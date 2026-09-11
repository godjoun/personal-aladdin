/**
 * tradeEvent.js — Bybit publicTrade 정규화 / 1분 bucket 집계
 *
 * READ ONLY. raw trade 장기 저장은 하지 않는다.
 * S=Buy → aggressive/taker buy, S=Sell → aggressive/taker sell.
 */

import { parseBybitNumber } from './bybitMarketDataProvider.js'
import {
  TRADE_FLOW_BUCKET_INTERVAL_SECONDS,
  TRADING_LAB_SYMBOL_SET,
} from './constants.js'

export const BYBIT_PUBLIC_TRADE_SIDES = Object.freeze({
  Buy: 'BUY',
  Sell: 'SELL',
})

/**
 * @param {unknown} rawSide
 * @returns {'BUY' | 'SELL' | null}
 */
export function mapBybitTradeSide(rawSide) {
  if (rawSide === 'Buy') return 'BUY'
  if (rawSide === 'Sell') return 'SELL'
  return null
}

/**
 * @param {unknown} message
 * @returns {object[]}
 */
export function extractBybitPublicTradeRows(message) {
  if (!message || typeof message !== 'object') return []
  const topic = typeof message.topic === 'string' ? message.topic : ''
  if (!topic.startsWith('publicTrade.')) return []
  if (Array.isArray(message.data)) return message.data
  if (message.data && typeof message.data === 'object') return [message.data]
  return []
}

/**
 * @param {number} timestampMs
 * @param {number} [intervalSeconds]
 */
export function bucketStartMs(
  timestampMs,
  intervalSeconds = TRADE_FLOW_BUCKET_INTERVAL_SECONDS,
) {
  const intervalMs = intervalSeconds * 1000
  return Math.floor(timestampMs / intervalMs) * intervalMs
}

/**
 * @param {{
 *   symbol: string,
 *   bucketStart: string,
 *   intervalSeconds?: number,
 * }} params
 */
export function createEmptyTradeFlowBucket(params) {
  const intervalSeconds =
    params.intervalSeconds ?? TRADE_FLOW_BUCKET_INTERVAL_SECONDS
  return {
    symbol: params.symbol,
    bucketStart: params.bucketStart,
    intervalSeconds,
    buyVolume: 0,
    sellVolume: 0,
    buyNotional: 0,
    sellNotional: 0,
    tradeCount: 0,
    deltaVolume: 0,
    deltaNotional: 0,
    updatedAt: params.bucketStart,
  }
}

/**
 * @param {object} bucket
 */
export function refreshTradeFlowBucketDeltas(bucket) {
  bucket.deltaVolume = bucket.buyVolume - bucket.sellVolume
  bucket.deltaNotional = bucket.buyNotional - bucket.sellNotional
  return bucket
}

/**
 * @param {object} bucket
 * @param {object} trade normalizeBybitPublicTrade 결과
 */
export function applyTradeToBucket(bucket, trade) {
  if (trade.side === 'BUY') {
    bucket.buyVolume += trade.volume
    bucket.buyNotional += trade.notional
  } else {
    bucket.sellVolume += trade.volume
    bucket.sellNotional += trade.notional
  }
  bucket.tradeCount += 1
  bucket.updatedAt = trade.receivedAt || bucket.updatedAt
  return refreshTradeFlowBucketDeltas(bucket)
}

/**
 * @param {unknown} raw
 * @param {{ receivedAt?: string }} [options]
 * @returns {{ ok: true, value: object } | { ok: false, reason: string }}
 */
export function normalizeBybitPublicTrade(raw, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'payload' }
  }

  const tradeId = raw.i == null ? '' : String(raw.i).trim()
  if (!tradeId) return { ok: false, reason: 'tradeId' }

  const symbol = String(raw.s || '').trim().toUpperCase()
  if (!TRADING_LAB_SYMBOL_SET.has(symbol)) {
    return { ok: false, reason: 'symbol' }
  }

  const rawSide = raw.S === 'Buy' || raw.S === 'Sell' ? raw.S : null
  const side = mapBybitTradeSide(rawSide)
  if (!rawSide || !side) return { ok: false, reason: 'side' }

  const priceRaw = raw.p == null ? '' : String(raw.p).trim()
  const volumeRaw = raw.v == null ? '' : String(raw.v).trim()
  const price = parseBybitNumber(priceRaw)
  const volume = parseBybitNumber(volumeRaw)
  if (price === null || price <= 0) return { ok: false, reason: 'price' }
  if (volume === null || volume <= 0) return { ok: false, reason: 'volume' }

  const timestampMs = parseBybitNumber(raw.T)
  if (timestampMs === null || timestampMs <= 0) {
    return { ok: false, reason: 'timestamp' }
  }

  const notional = price * volume
  if (!Number.isFinite(notional) || notional <= 0) {
    return { ok: false, reason: 'notional' }
  }

  const seq = parseBybitNumber(raw.seq)
  const receivedAt = options.receivedAt || new Date().toISOString()
  const intervalSeconds = TRADE_FLOW_BUCKET_INTERVAL_SECONDS
  const startMs = bucketStartMs(timestampMs, intervalSeconds)

  return {
    ok: true,
    value: {
      tradeId,
      symbol,
      timestampMs,
      timestamp: new Date(timestampMs).toISOString(),
      receivedAt,
      rawSide,
      side,
      price,
      volume,
      notional,
      seq: seq === null ? null : seq,
      bucketStartMs: startMs,
      bucketStart: new Date(startMs).toISOString(),
      intervalSeconds,
    },
  }
}

/**
 * bounded trade-id cache. seq 는 여러 trade 가 공유할 수 있어 키로 쓰지 않는다.
 *
 * @param {{ maxSize?: number, ttlMs?: number, now?: () => number }} [options]
 */
export function createTradeIdCache(options = {}) {
  const maxSize = options.maxSize ?? 8_000
  const ttlMs = options.ttlMs ?? 120_000
  const now = options.now || (() => Date.now())
  /** @type {Map<string, number>} */
  const seen = new Map()

  function prune(nowMs = now()) {
    for (const [id, expiresAt] of seen) {
      if (expiresAt <= nowMs) seen.delete(id)
    }
    while (seen.size > maxSize) {
      const oldest = seen.keys().next().value
      if (oldest == null) break
      seen.delete(oldest)
    }
  }

  return {
    /**
     * @param {string} tradeId
     * @returns {boolean} true = 처음 본 id, false = 중복
     */
    remember(tradeId) {
      const nowMs = now()
      prune(nowMs)
      if (seen.has(tradeId)) return false
      seen.set(tradeId, nowMs + ttlMs)
      if (seen.size > maxSize) prune(nowMs)
      return true
    },
    size() {
      prune()
      return seen.size
    },
    has(tradeId) {
      prune()
      return seen.has(tradeId)
    },
    clear() {
      seen.clear()
    },
  }
}
