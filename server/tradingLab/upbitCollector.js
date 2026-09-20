/** Upbit private MyOrder WebSocket. READ ONLY. */

import { randomUUID } from 'crypto'
import WebSocket from 'ws'
import { createUpbitJwt } from './upbitAuth.js'
import {
  normalizeUpbitExecution,
  normalizeUpbitOrder,
} from './upbitNormalize.js'
import {
  listUpbitExecutions,
  replaceUpbitEpisodes,
  upsertUpbitExecution,
  upsertUpbitOrder,
} from './upbitRepository.js'
import { buildUpbitTradeEpisodes } from './upbitEpisodeService.js'

export const UPBIT_PRIVATE_WS_URL = 'wss://api.upbit.com/websocket/v1/private'

export function createUpbitCollector(options) {
  const WebSocketImpl = options.WebSocketImpl || WebSocket
  const url = options.url || UPBIT_PRIVATE_WS_URL
  const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer || ((id) => clearTimeout(id))
  const pingMs = options.pingMs ?? 30_000
  const baseBackoffMs = options.baseBackoffMs ?? 1_000
  const maxBackoffMs = options.maxBackoffMs ?? 30_000
  const now = options.now || (() => Date.now())
  let socket = null
  let reconnectTimer = null
  let pingTimer = null
  let stopped = true
  let connecting = false
  let connected = false
  let reconnectCount = 0
  let backoffAttempt = 0
  let lastMessageAt = null
  let lastExecutionAt = null
  let lastError = null

  function status() {
    return {
      configured: true,
      connected,
      lastMessageAt,
      lastExecutionAt,
      reconnectCount,
      lastError,
    }
  }

  function safeError(error, fallback = 'UPBIT_WS_ERROR') {
    const redact = (value, fallbackValue) => {
      let text = String(value || fallbackValue)
      for (const credential of [options.accessKey, options.secretKey]) {
        if (credential) text = text.split(credential).join('[REDACTED]')
      }
      return text
    }
    lastError = {
      code: redact(error?.code, fallback).slice(0, 80),
      message: redact(error?.message, 'Upbit WebSocket error').slice(0, 160),
    }
  }

  function clearTimers() {
    if (pingTimer) clearTimer(pingTimer)
    if (reconnectTimer) clearTimer(reconnectTimer)
    pingTimer = null
    reconnectTimer = null
  }

  function schedulePing() {
    if (stopped || !connected) return
    pingTimer = schedule(() => {
      try {
        if (socket?.ping) socket.ping()
      } catch (error) {
        safeError(error, 'PING_ERROR')
      }
      schedulePing()
    }, pingMs)
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return
    const wait = Math.min(maxBackoffMs, baseBackoffMs * 2 ** backoffAttempt)
    backoffAttempt += 1
    reconnectCount += 1
    reconnectTimer = schedule(() => {
      reconnectTimer = null
      connect()
    }, wait)
  }

  async function handlePayload(payload) {
    lastMessageAt = new Date(now()).toISOString()
    if (payload?.error) {
      safeError(payload.error, payload.error.name || 'UPBIT_WS_PAYLOAD_ERROR')
      return
    }
    if (payload?.type !== 'myOrder') return
    const nowIso = new Date(now()).toISOString()
    const order = normalizeUpbitOrder(payload, nowIso)
    if (!order) return
    upsertUpbitOrder(order, options.db)
    if (String(payload.state).toLowerCase() === 'trade' && payload.trade_uuid) {
      const execution = normalizeUpbitExecution(payload, {
        orderUuid: order.uuid,
        market: order.market,
        side: order.side,
      }, nowIso)
      if (execution) {
        upsertUpbitExecution(execution, options.db)
        lastExecutionAt = execution.tradedAt
        replaceUpbitEpisodes(
          buildUpbitTradeEpisodes(listUpbitExecutions(options.db), { nowIso }),
          options.db,
        )
      }
    }
  }

  function connect() {
    if (stopped || connecting || connected) return
    connecting = true
    const token = createUpbitJwt({
      accessKey: options.accessKey,
      secretKey: options.secretKey,
    })
    try {
      socket = new WebSocketImpl(url, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) {
      connecting = false
      safeError(error, 'CONNECT_ERROR')
      scheduleReconnect()
      return
    }
    socket.on('open', async () => {
      connecting = false
      connected = true
      backoffAttempt = 0
      lastError = null
      socket.send(JSON.stringify([
        { ticket: `aladdin-upbit-orders-${randomUUID()}` },
        { type: 'myOrder' },
        { format: 'DEFAULT' },
      ]))
      schedulePing()
      try {
        await options.reconcile?.()
      } catch (error) {
        safeError(error, 'RECONCILE_ERROR')
      }
    })
    socket.on('message', (data) => {
      try {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
        void handlePayload(JSON.parse(text))
      } catch (error) {
        safeError(error, 'MESSAGE_ERROR')
      }
    })
    socket.on('error', (error) => safeError(error))
    socket.on('close', () => {
      connecting = false
      connected = false
      if (pingTimer) clearTimer(pingTimer)
      pingTimer = null
      scheduleReconnect()
    })
  }

  function start() {
    if (!stopped) return
    stopped = false
    connect()
  }

  function stop() {
    stopped = true
    connecting = false
    connected = false
    clearTimers()
    try { socket?.close() } catch { /* best effort */ }
    socket = null
  }

  return { start, stop, connect, handlePayload, getStatus: status }
}
