/**
 * tradeFlowCollector.js — Bybit public linear publicTrade WebSocket
 *
 * READ ONLY. API key / private channel / 주문 기능 없음.
 * liquidation collector 와 독립 connection 을 쓴다.
 * 한 소켓에 topic 을 섞으면 한쪽 장애가 다른 쪽 구독까지 끊을 수 있어 분리한다.
 * WebSocket 장애는 collector 만 degraded 하고 Express 전체를 죽이지 않는다.
 *
 * raw trade 는 메모리에서 1분 bucket 으로만 집계하고 SQLite 에 upsert 한다.
 */

import { getDb } from '../db.js'
import {
  TRADE_FLOW_BUCKET_INTERVAL_SECONDS,
  TRADING_LAB_SYMBOLS,
} from './constants.js'
import { BYBIT_PUBLIC_LINEAR_WS } from './liquidationCollector.js'
import {
  applyTradeToBucket,
  createEmptyTradeFlowBucket,
  createTradeIdCache,
  extractBybitPublicTradeRows,
  normalizeBybitPublicTrade,
} from './tradeEvent.js'
import {
  listTradeFlowBuckets,
  pruneTradeFlowBuckets,
  upsertTradeFlowBucket,
} from './tradeFlowRepository.js'

export const BYBIT_PUBLIC_TRADE_TOPICS = Object.freeze(
  TRADING_LAB_SYMBOLS.map((symbol) => `publicTrade.${symbol}`),
)

const DEFAULT_PING_MS = 20_000
const DEFAULT_BACKOFF_MS = 1_000
const DEFAULT_MAX_BACKOFF_MS = 30_000
const DEFAULT_FLUSH_MS = 1_000

/** @type {ReturnType<typeof createTradeFlowCollector> | null} */
let activeCollector = null

export function getTradeFlowCollector() {
  return activeCollector
}

export function setTradeFlowCollector(collector) {
  activeCollector = collector
}

export function resetTradeFlowCollector() {
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
 *   flushIntervalMs?: number,
 *   now?: () => number,
 *   schedule?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (id: unknown) => void,
 *   persistBuckets?: (buckets: object[]) => void,
 *   loadBuckets?: (sinceIso: string) => object[],
 *   prune?: () => void,
 *   tradeIdCache?: ReturnType<typeof createTradeIdCache>,
 *   autoConnect?: boolean,
 * }} [options]
 */
export function createTradeFlowCollector(options = {}) {
  const WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket
  const url = options.url || BYBIT_PUBLIC_LINEAR_WS
  const topics = options.topics || [...BYBIT_PUBLIC_TRADE_TOPICS]
  const pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_MS
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_MS
  const now = options.now || (() => Date.now())
  const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer || ((id) => clearTimeout(id))
  const persistBuckets =
    options.persistBuckets ||
    ((buckets) => {
      const db = getDb()
      for (const bucket of buckets) upsertTradeFlowBucket(bucket, db)
    })
  const loadBuckets =
    options.loadBuckets ||
    (options.persistBuckets
      ? () => []
      : (sinceIso) => listTradeFlowBuckets({ since: sinceIso }, getDb()))
  const prune =
    options.prune ||
    (options.persistBuckets ? () => {} : () => pruneTradeFlowBuckets({}, getDb()))
  const tradeIdCache = options.tradeIdCache || createTradeIdCache({ now })

  let socket = null
  let stopped = true
  let connecting = false
  let connected = false
  let subscribedSymbols = []
  let reconnectCount = 0
  let currentBackoff = backoffMs
  let pingTimer = null
  let reconnectTimer = null
  let flushTimer = null
  let lastTradeAt = null
  let lastMessageAt = null
  /** @type {Map<string, object>} */
  const pending = new Map()

  function bucketKey(bucket) {
    return `${bucket.symbol}:${bucket.bucketStart}:${bucket.intervalSeconds}`
  }

  function status() {
    return {
      provider: 'BYBIT',
      connected,
      subscribedSymbols: [...subscribedSymbols],
      lastTradeAt,
      lastMessageAt,
      reconnectCount,
    }
  }

  function hydrateOpenBuckets() {
    try {
      const lookbackMs = TRADE_FLOW_BUCKET_INTERVAL_SECONDS * 2 * 1000
      const sinceIso = new Date(now() - lookbackMs).toISOString()
      const existing = loadBuckets(sinceIso)
      for (const bucket of existing) {
        pending.set(bucketKey(bucket), {
          ...bucket,
        })
      }
    } catch {
      console.error('[TradingLab] trade flow bucket hydrate failed')
    }
  }

  function flush() {
    if (pending.size === 0) {
      try {
        prune()
      } catch {
        console.error('[TradingLab] trade flow prune failed')
      }
      return
    }
    const buckets = [...pending.values()].map((bucket) => ({ ...bucket }))
    try {
      persistBuckets(buckets)
      prune()
    } catch {
      console.error('[TradingLab] trade flow persist failed')
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

  function clearFlush() {
    if (flushTimer != null) {
      clearTimer(flushTimer)
      flushTimer = null
    }
  }

  function startFlush() {
    clearFlush()
    if (flushIntervalMs <= 0) return
    flushTimer = schedule(function flushLoop() {
      flush()
      if (!stopped) startFlush()
    }, flushIntervalMs)
  }

  function safeSend(payload) {
    if (!socket || socket.readyState !== 1) return
    try {
      socket.send(JSON.stringify(payload))
    } catch {
      console.error('[TradingLab] trade flow ws send failed')
    }
  }

  function subscribe() {
    safeSend({ op: 'subscribe', args: topics })
  }

  function startPing() {
    clearPing()
    pingTimer = schedule(function pingLoop() {
      safeSend({ op: 'ping', req_id: 'cvd-heartbeat' })
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

  function applyNormalizedTrade(trade) {
    if (!tradeIdCache.remember(trade.tradeId)) return false
    const key = `${trade.symbol}:${trade.bucketStart}:${trade.intervalSeconds}`
    const current =
      pending.get(key) ||
      createEmptyTradeFlowBucket({
        symbol: trade.symbol,
        bucketStart: trade.bucketStart,
        intervalSeconds: trade.intervalSeconds,
      })
    applyTradeToBucket(current, trade)
    pending.set(key, current)
    lastTradeAt = trade.receivedAt
    if (flushIntervalMs <= 0) flush()
    return true
  }

  function handleMessage(raw) {
    lastMessageAt = new Date(now()).toISOString()
    let message
    try {
      message = JSON.parse(readData(raw))
    } catch {
      console.error('[TradingLab] trade flow ws ignored malformed json')
      return
    }
    if (!message || typeof message !== 'object') return

    if (message.op === 'ping') {
      safeSend({ op: 'pong' })
      return
    }

    if (message.op === 'subscribe' && message.success === true) {
      subscribedSymbols = TRADING_LAB_SYMBOLS.filter((symbol) =>
        topics.includes(`publicTrade.${symbol}`),
      )
      return
    }

    const rows = extractBybitPublicTradeRows(message)
    for (const row of rows) {
      const parsed = normalizeBybitPublicTrade(row, {
        receivedAt: new Date(now()).toISOString(),
      })
      if (!parsed.ok) {
        console.error(`[TradingLab] skip invalid publicTrade reason=${parsed.reason}`)
        continue
      }
      try {
        applyNormalizedTrade(parsed.value)
      } catch {
        console.error('[TradingLab] trade flow apply failed')
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
        topics.includes(`publicTrade.${symbol}`),
      )
      startPing()
      startFlush()
    }
    const onMessage = (event) => {
      try {
        const raw =
          event && typeof event === 'object' && 'data' in event ? event.data : event
        handleMessage(raw)
      } catch {
        console.error('[TradingLab] trade flow ws message handler failed')
      }
    }
    const onError = () => {
      console.error('[TradingLab] trade flow ws error')
    }
    const onClose = () => {
      connected = false
      connecting = false
      subscribedSymbols = []
      clearPing()
      socket = null
      try {
        flush()
      } catch {
        console.error('[TradingLab] trade flow flush on close failed')
      }
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
      console.error('[TradingLab] trade flow ws connect failed')
      connecting = false
      connected = false
      scheduleReconnect()
    }
  }

  function start() {
    if (!stopped) return
    stopped = false
    hydrateOpenBuckets()
    startFlush()
    connect()
  }

  function stop() {
    stopped = true
    connected = false
    connecting = false
    subscribedSymbols = []
    clearPing()
    clearReconnect()
    clearFlush()
    try {
      flush()
    } catch {
      console.error('[TradingLab] trade flow flush on stop failed')
    }
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
    flush,
    getStatus: status,
    handleMessage,
    /** @internal */
    _connect: connect,
    /** @internal */
    _pending: pending,
  }

  activeCollector = collector
  if (options.autoConnect) start()
  return collector
}
