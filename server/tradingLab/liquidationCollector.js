/**
 * liquidationCollector.js — Bybit public linear allLiquidation WebSocket
 *
 * READ ONLY. API key / private channel / 주문 기능 없음.
 * WebSocket 장애는 collector 만 degraded 하고 Express 전체를 죽이지 않는다.
 */

import { TRADING_LAB_SYMBOLS } from './constants.js'
import { getDb } from '../db.js'
import {
  extractBybitLiquidationRows,
  normalizeBybitLiquidationEvent,
} from './liquidationEvent.js'
import { insertObservedLiquidation } from './liquidationRepository.js'

export const BYBIT_PUBLIC_LINEAR_WS = 'wss://stream.bybit.com/v5/public/linear'
export const BYBIT_LIQUIDATION_TOPICS = Object.freeze(
  TRADING_LAB_SYMBOLS.map((symbol) => `allLiquidation.${symbol}`),
)

const DEFAULT_PING_MS = 20_000
const DEFAULT_BACKOFF_MS = 1_000
const DEFAULT_MAX_BACKOFF_MS = 30_000

/** @type {ReturnType<typeof createLiquidationCollector> | null} */
let activeCollector = null

export function getLiquidationCollector() {
  return activeCollector
}

export function setLiquidationCollector(collector) {
  activeCollector = collector
}

export function resetLiquidationCollector() {
  if (activeCollector) {
    try {
      activeCollector.stop()
    } catch {
      // stop 실패가 테스트를 깨지 않게 한다
    }
  }
  activeCollector = null
}

/**
 * @param {{
 *   WebSocketImpl?: typeof WebSocket,
 *   url?: string,
 *   topics?: string[],
 *   pingIntervalMs?: number,
 *   backoffMs?: number,
 *   maxBackoffMs?: number,
 *   now?: () => number,
 *   schedule?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (id: unknown) => void,
 *   persist?: (event: object) => { inserted: boolean },
 *   autoConnect?: boolean,
 * }} [options]
 */
export function createLiquidationCollector(options = {}) {
  const WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket
  const url = BYBIT_PUBLIC_LINEAR_WS
  const topics = options.topics || [...BYBIT_LIQUIDATION_TOPICS]
  const pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_MS
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS
  const now = options.now || (() => Date.now())
  const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer || ((id) => clearTimeout(id))
  const persist =
    options.persist ||
    ((event) => insertObservedLiquidation(event, getDb()))

  let socket = null
  let stopped = true
  let connecting = false
  let connected = false
  let subscribedSymbols = []
  let reconnectCount = 0
  let currentBackoff = backoffMs
  let pingTimer = null
  let reconnectTimer = null
  let lastEventAt = null
  let lastMessageAt = null

  function status() {
    return {
      provider: 'BYBIT',
      connected,
      subscribedSymbols: [...subscribedSymbols],
      lastEventAt,
      lastMessageAt,
      reconnectCount,
    }
  }

  function clearPing() {
    if (pingTimer != null) {
      clearTimer(pingTimer)
      pingTimer = null
    }
  }

  function clearReconnect() {
    if (reconnectTimer != null) {
      clearTimer(reconnectTimer)
      reconnectTimer = null
    }
  }

  function safeSend(payload) {
    if (!socket || socket.readyState !== 1) return
    try {
      socket.send(JSON.stringify(payload))
    } catch {
      console.error('[TradingLab] liquidation ws send failed')
    }
  }

  function subscribe() {
    safeSend({ op: 'subscribe', args: topics })
  }

  function startPing() {
    clearPing()
    pingTimer = schedule(function pingLoop() {
      safeSend({ op: 'ping', req_id: 'liq-heartbeat' })
      if (!stopped && connected) startPing()
    }, pingIntervalMs)
  }

  function readData(data) {
    if (typeof data === 'string') return data
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
      return data.toString('utf8')
    }
    if (data instanceof ArrayBuffer) {
      return new TextDecoder().decode(data)
    }
    return String(data)
  }

  function handleMessage(raw) {
    lastMessageAt = new Date(now()).toISOString()
    let message
    try {
      message = JSON.parse(readData(raw))
    } catch {
      console.error('[TradingLab] liquidation ws ignored malformed json')
      return
    }
    if (!message || typeof message !== 'object') return

    if (message.op === 'ping') {
      safeSend({ op: 'pong' })
      return
    }

    if (message.op === 'subscribe' && message.success === true) {
      subscribedSymbols = TRADING_LAB_SYMBOLS.filter((symbol) =>
        topics.includes(`allLiquidation.${symbol}`),
      )
      return
    }

    const rows = extractBybitLiquidationRows(message)
    for (const row of rows) {
      const parsed = normalizeBybitLiquidationEvent(row, {
        receivedAt: new Date(now()).toISOString(),
      })
      if (!parsed.ok) {
        console.error(`[TradingLab] skip invalid liquidation event reason=${parsed.reason}`)
        continue
      }
      try {
        persist(parsed.value)
        lastEventAt = parsed.value.receivedAt
      } catch {
        console.error('[TradingLab] liquidation persist failed')
      }
    }
  }

  function attach(nextSocket) {
    socket = nextSocket
    connecting = true
    const onOpen = () => {
      connecting = false
      connected = true
      currentBackoff = backoffMs
      subscribe()
      subscribedSymbols = TRADING_LAB_SYMBOLS.filter((symbol) =>
        topics.includes(`allLiquidation.${symbol}`),
      )
      startPing()
    }
    const onMessage = (event) => {
      try {
        const raw =
          event && typeof event === 'object' && 'data' in event ? event.data : event
        handleMessage(raw)
      } catch {
        console.error('[TradingLab] liquidation ws message handler failed')
      }
    }
    const onError = () => {
      console.error('[TradingLab] liquidation ws error')
    }
    const onClose = () => {
      connected = false
      connecting = false
      subscribedSymbols = []
      clearPing()
      socket = null
      if (!stopped) scheduleReconnect()
    }

    if (typeof nextSocket.addEventListener === 'function') {
      nextSocket.addEventListener('open', onOpen)
      nextSocket.addEventListener('message', onMessage)
      nextSocket.addEventListener('error', onError)
      nextSocket.addEventListener('close', onClose)
    } else {
      nextSocket.onopen = onOpen
      nextSocket.onmessage = onMessage
      nextSocket.onerror = onError
      nextSocket.onclose = onClose
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer != null) return
    reconnectCount += 1
    const wait = currentBackoff
    currentBackoff = Math.min(currentBackoff * 2, maxBackoffMs)
    reconnectTimer = schedule(() => {
      reconnectTimer = null
      if (!stopped) connect()
    }, wait)
  }

  function connect() {
    if (stopped) return
    if (connecting || connected) return
    if (!WebSocketImpl) {
      console.error('[TradingLab] WebSocket implementation missing')
      return
    }
    try {
      attach(new WebSocketImpl(url))
    } catch {
      console.error('[TradingLab] liquidation ws connect failed')
      connecting = false
      connected = false
      scheduleReconnect()
    }
  }

  function start() {
    stopped = false
    connect()
  }

  function stop() {
    stopped = true
    connected = false
    connecting = false
    subscribedSymbols = []
    clearPing()
    clearReconnect()
    if (socket) {
      try {
        socket.close()
      } catch {
        // ignore
      }
    }
    socket = null
  }

  const collector = {
    start,
    stop,
    getStatus: status,
    handleMessage,
    /** @internal */
    _connect: connect,
  }

  activeCollector = collector
  if (options.autoConnect) start()
  return collector
}
