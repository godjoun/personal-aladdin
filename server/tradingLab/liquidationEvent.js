/**
 * liquidationEvent.js — Bybit allLiquidation 이벤트 정규화 / 집계
 *
 * Observed liquidation 만 다룬다. 미래 청산 추정은 하지 않는다.
 */

import { parseBybitNumber } from './bybitMarketDataProvider.js'
import {
  OBSERVED_LIQUIDATION_SOURCE,
  OBSERVED_LIQUIDATION_SOURCE_TYPE,
  TRADING_LAB_SYMBOL_SET,
} from './constants.js'

export const BYBIT_LIQUIDATION_SIDES = Object.freeze({
  Buy: 'LONG',
  Sell: 'SHORT',
})

const MAX_AGGREGATE_ROWS = 5_000
const DEFAULT_BUCKET_BPS = 5
const MIN_BUCKET_WIDTH = Object.freeze({
  BTCUSDT: 10,
  ETHUSDT: 1,
})

/**
 * Bybit allLiquidation.S → 청산된 포지션 방향
 * Buy = LONG position liquidation
 * Sell = SHORT position liquidation
 *
 * @param {unknown} rawSide
 * @returns {'LONG' | 'SHORT' | null}
 */
export function mapBybitLiquidationSide(rawSide) {
  if (rawSide === 'Buy') return 'LONG'
  if (rawSide === 'Sell') return 'SHORT'
  return null
}

/**
 * @param {{
 *   symbol: string,
 *   timestampMs: number,
 *   rawSide: string,
 *   priceRaw: string,
 *   quantityRaw: string,
 * }} parts
 */
export function buildLiquidationSourceKey(parts) {
  return `BYBIT:${parts.symbol}:${parts.timestampMs}:${parts.rawSide}:${parts.priceRaw}:${parts.quantityRaw}`
}

/**
 * @param {unknown} raw
 * @param {{ receivedAt?: string }} [options]
 * @returns {{ ok: true, value: object } | { ok: false, reason: string }}
 */
export function normalizeBybitLiquidationEvent(raw, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'payload' }
  }

  const symbol = String(raw.s || '').trim().toUpperCase()
  if (!TRADING_LAB_SYMBOL_SET.has(symbol)) {
    return { ok: false, reason: 'symbol' }
  }

  const rawSide = raw.S === 'Buy' || raw.S === 'Sell' ? raw.S : null
  const liquidatedSide = mapBybitLiquidationSide(rawSide)
  if (!rawSide || !liquidatedSide) {
    return { ok: false, reason: 'side' }
  }

  const priceRaw = raw.p == null ? '' : String(raw.p).trim()
  const quantityRaw = raw.v == null ? '' : String(raw.v).trim()
  const price = parseBybitNumber(priceRaw)
  const quantity = parseBybitNumber(quantityRaw)
  if (price === null || price <= 0) return { ok: false, reason: 'price' }
  if (quantity === null || quantity <= 0) return { ok: false, reason: 'quantity' }

  const timestampMs = parseBybitNumber(raw.T)
  if (timestampMs === null || timestampMs <= 0) {
    return { ok: false, reason: 'timestamp' }
  }

  const receivedAt = options.receivedAt || new Date().toISOString()
  const estimatedNotional = price * quantity
  if (!Number.isFinite(estimatedNotional) || estimatedNotional <= 0) {
    return { ok: false, reason: 'notional' }
  }

  return {
    ok: true,
    value: {
      symbol,
      timestampMs,
      timestamp: new Date(timestampMs).toISOString(),
      receivedAt,
      source: OBSERVED_LIQUIDATION_SOURCE,
      sourceType: OBSERVED_LIQUIDATION_SOURCE_TYPE,
      rawSide,
      liquidatedSide,
      price,
      quantity,
      estimatedNotional,
      sourceKey: buildLiquidationSourceKey({
        symbol,
        timestampMs,
        rawSide,
        priceRaw,
        quantityRaw,
      }),
    },
  }
}

/**
 * @param {unknown} message
 * @returns {object[]}
 */
export function extractBybitLiquidationRows(message) {
  if (!message || typeof message !== 'object') return []
  const topic = typeof message.topic === 'string' ? message.topic : ''
  if (!topic.startsWith('allLiquidation.')) return []
  if (Array.isArray(message.data)) return message.data
  if (message.data && typeof message.data === 'object') return [message.data]
  return []
}

/**
 * @param {Array<{
 *   liquidatedSide?: string,
 *   side?: string,
 *   price?: number,
 *   priceLevel?: number,
 *   quantity?: number,
 *   estimatedNotional?: number,
 *   estimatedValue?: number,
 *   timestamp?: string,
 * }>} events
 */
export function summarizeLiquidationSide(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      count: 0,
      estimatedNotional: 0,
      largestEvent: null,
      weightedAveragePrice: null,
    }
  }

  let estimatedNotional = 0
  let qtySum = 0
  let priceQtySum = 0
  let largest = null

  for (const event of events) {
    const notional = toFinite(event.estimatedNotional ?? event.estimatedValue) || 0
    const qty = toFinite(event.quantity)
    const price = toFinite(event.price ?? event.priceLevel)
    estimatedNotional += notional
    if (qty !== null && qty > 0 && price !== null) {
      qtySum += qty
      priceQtySum += price * qty
    }
    if (!largest || notional > (largest.estimatedNotional || 0)) {
      largest = {
        timestamp: event.timestamp || null,
        price,
        quantity: qty,
        estimatedNotional: notional,
      }
    }
  }

  return {
    count: events.length,
    estimatedNotional,
    largestEvent: largest,
    weightedAveragePrice: qtySum > 0 ? priceQtySum / qtySum : null,
  }
}

/**
 * 가격대 집계 — 기준가 대비 basis point bucket.
 * 고정 달러 폭이 아니라 심볼 가격 스케일에 맞춘다.
 *
 * @param {Array<object>} events
 * @param {{ referencePrice?: number | null, bucketBps?: number }} [options]
 */
export function aggregateLiquidationBuckets(events, options = {}) {
  const list = Array.isArray(events) ? events : []
  const usable = list
    .map((event) => ({
      price: toFinite(event.price ?? event.priceLevel),
      notional: toFinite(event.estimatedNotional ?? event.estimatedValue) || 0,
      side: event.liquidatedSide || event.side,
    }))
    .filter((event) => event.price !== null && event.price > 0)

  if (usable.length === 0) return []

  const referencePrice =
    toFinite(options.referencePrice) ||
    usable.reduce((sum, event) => sum + event.price, 0) / usable.length
  const symbol = list[0]?.symbol
  const minWidth = MIN_BUCKET_WIDTH[symbol] || 1
  const bps = options.bucketBps ?? DEFAULT_BUCKET_BPS
  const width = Math.max(minWidth, referencePrice * (bps / 10_000))

  /** @type {Map<number, { priceLow: number, priceHigh: number, longNotional: number, shortNotional: number, eventCount: number }>} */
  const buckets = new Map()
  for (const event of usable) {
    const index = Math.floor(event.price / width)
    const priceLow = index * width
    const priceHigh = priceLow + width
    const current = buckets.get(index) || {
      priceLow,
      priceHigh,
      longNotional: 0,
      shortNotional: 0,
      eventCount: 0,
    }
    if (event.side === 'LONG') current.longNotional += event.notional
    else if (event.side === 'SHORT') current.shortNotional += event.notional
    current.eventCount += 1
    buckets.set(index, current)
  }

  return [...buckets.values()].sort((a, b) => a.priceLow - b.priceLow)
}

export const LIQUIDATION_QUERY_LIMIT = MAX_AGGREGATE_ROWS

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toFinite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}
