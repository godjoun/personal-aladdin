/**
 * tradingTradeStorage.js — TRADING 거래 기록 (localStorage 전용)
 */

import { calculateTradeMetrics } from '../utils/tradingTradeCalculator.js'
import {
  TRADING_TRADE_SOURCE_PLAN,
  isClosedPlanEligibleForTrade,
  mapClosedPlanToTrade,
} from '../utils/tradingPlanTradeSync.js'

export const TRADING_TRADES_STORAGE_KEY = 'aladdin.tradingTrades.v1'

export const TRADING_TRADE_TAGS = Object.freeze([
  '계획매매',
  '추격매수',
  '원칙준수',
  '손절지연',
  'FOMO',
])

/**
 * @typedef {Object} TradingTrade
 * @property {string} id
 * @property {string} symbol
 * @property {number} entryPrice
 * @property {number} exitPrice
 * @property {number} investedAmount
 * @property {number} returnRate
 * @property {number} profitLoss
 * @property {string} entryReason
 * @property {string} review
 * @property {string[]} tags
 * @property {string} tradedAt
 * @property {string} createdAt
 * @property {string} [updatedAt]
 * @property {'TRADING_PLAN'} [source]
 * @property {string} [sourcePlanId]
 */

/**
 * @typedef {Object} TradeSyncResult
 * @property {'created' | 'skipped' | 'not_applicable' | 'failed'} status
 * @property {TradingTrade | null} trade
 * @property {string} [message]
 */

/**
 * @param {unknown} value
 * @returns {TradingTrade | null}
 */
export function normalizeTradingTrade(value) {
  if (!value || typeof value !== 'object') return null

  const entryPrice = Number(value.entryPrice)
  const exitPrice = Number(value.exitPrice)
  const investedAmount = Number(value.investedAmount)
  const returnRate = Number(value.returnRate)
  const profitLoss = Number(value.profitLoss)
  const symbol = String(value.symbol ?? '').trim()
  const id = String(value.id ?? '').trim()
  const tradedAt = String(value.tradedAt ?? '')
  const createdAt = String(value.createdAt ?? '')
  const updatedAtRaw = value.updatedAt != null ? String(value.updatedAt) : ''

  if (!id || !symbol) return null
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(exitPrice) ||
    !Number.isFinite(investedAmount) ||
    !Number.isFinite(returnRate) ||
    !Number.isFinite(profitLoss)
  ) {
    return null
  }
  if (Number.isNaN(new Date(tradedAt).getTime())) return null

  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : []

  const sourceRaw = value.source != null ? String(value.source).trim() : ''
  const sourcePlanIdRaw =
    value.sourcePlanId != null ? String(value.sourcePlanId).trim() : ''

  /** @type {TradingTrade} */
  const trade = {
    id,
    symbol,
    entryPrice,
    exitPrice,
    investedAmount,
    returnRate,
    profitLoss,
    entryReason: String(value.entryReason ?? '').trim(),
    review: String(value.review ?? '').trim(),
    tags,
    tradedAt,
    createdAt: createdAt || tradedAt,
    ...(updatedAtRaw && !Number.isNaN(new Date(updatedAtRaw).getTime())
      ? { updatedAt: updatedAtRaw }
      : {}),
  }

  if (sourceRaw === TRADING_TRADE_SOURCE_PLAN && sourcePlanIdRaw) {
    trade.source = TRADING_TRADE_SOURCE_PLAN
    trade.sourcePlanId = sourcePlanIdRaw
  }

  return trade
}

export function getTradingTrades() {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(TRADING_TRADES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeTradingTrade(item))
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * @param {TradingTrade[]} trades
 */
export function saveTradingTrades(trades) {
  if (typeof localStorage === 'undefined') return
  const list = Array.isArray(trades) ? trades : []
  localStorage.setItem(TRADING_TRADES_STORAGE_KEY, JSON.stringify(list))
}

/**
 * @param {{
 *   symbol: string,
 *   entryPrice: number,
 *   exitPrice: number,
 *   investedAmount: number,
 *   entryReason?: string,
 *   review?: string,
 *   tags?: string[],
 * }} input
 * @param {Date} [now]
 * @returns {TradingTrade}
 */
export function addTradingTrade(input, now = new Date()) {
  const metrics = calculateTradeMetrics(input)
  if (!metrics) {
    throw new Error('Invalid trade metrics')
  }

  const iso = now.toISOString()
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : []

  /** @type {TradingTrade} */
  const trade = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `trade-${Date.now()}`,
    symbol: String(input.symbol).trim(),
    entryPrice: Number(input.entryPrice),
    exitPrice: Number(input.exitPrice),
    investedAmount: Number(input.investedAmount),
    returnRate: metrics.returnRate,
    profitLoss: metrics.profitLoss,
    entryReason: String(input.entryReason ?? '').trim(),
    review: String(input.review ?? '').trim(),
    tags,
    tradedAt: iso,
    createdAt: iso,
  }

  const next = [trade, ...getTradingTrades()]
  saveTradingTrades(next)
  return trade
}

/**
 * @param {string} sourcePlanId
 * @returns {TradingTrade | null}
 */
export function findTradingTradeBySourcePlanId(sourcePlanId) {
  const key = String(sourcePlanId ?? '').trim()
  if (!key) return null

  return (
    getTradingTrades().find(
      (trade) =>
        trade.source === TRADING_TRADE_SOURCE_PLAN && trade.sourcePlanId === key,
    ) ?? null
  )
}

/**
 * @param {import('./tradingPlanStorage.js').TradingPlan} plan
 * @param {Date} [now]
 * @returns {TradeSyncResult}
 */
export function addTradingTradeFromClosedPlan(plan, now = new Date()) {
  if (!isClosedPlanEligibleForTrade(plan)) {
    return { status: 'not_applicable', trade: null }
  }

  const existing = findTradingTradeBySourcePlanId(plan.id)
  if (existing) {
    return { status: 'skipped', trade: existing }
  }

  const mapped = mapClosedPlanToTrade(plan)
  if (!mapped) {
    return { status: 'not_applicable', trade: null }
  }

  try {
    const iso = now.toISOString()
    /** @type {TradingTrade} */
    const trade = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `trade-${Date.now()}`,
      ...mapped,
      createdAt: iso,
    }

    const next = [trade, ...getTradingTrades()]
    saveTradingTrades(next)
    return { status: 'created', trade }
  } catch {
    return {
      status: 'failed',
      trade: null,
      message: '매매일지 생성에 실패했습니다.',
    }
  }
}

/**
 * @param {string} id
 * @returns {TradingTrade | null}
 */
export function getTradingTradeById(id) {
  const key = String(id ?? '').trim()
  if (!key) return null
  return getTradingTrades().find((trade) => trade.id === key) ?? null
}

/**
 * @param {string} id
 * @param {{
 *   symbol: string,
 *   entryPrice: number,
 *   exitPrice: number,
 *   investedAmount: number,
 *   entryReason?: string,
 *   review?: string,
 *   tags?: string[],
 * }} input
 * @param {Date} [now]
 * @returns {TradingTrade | null}
 */
export function updateTradingTrade(id, input, now = new Date()) {
  const key = String(id ?? '').trim()
  if (!key) return null

  const metrics = calculateTradeMetrics(input)
  if (!metrics) {
    throw new Error('Invalid trade metrics')
  }

  const trades = getTradingTrades()
  const index = trades.findIndex((trade) => trade.id === key)
  if (index < 0) return null

  const existing = trades[index]
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : []

  /** @type {TradingTrade} */
  const updated = {
    ...existing,
    symbol: String(input.symbol).trim(),
    entryPrice: Number(input.entryPrice),
    exitPrice: Number(input.exitPrice),
    investedAmount: Number(input.investedAmount),
    returnRate: metrics.returnRate,
    profitLoss: metrics.profitLoss,
    entryReason: String(input.entryReason ?? '').trim(),
    review: String(input.review ?? '').trim(),
    tags,
    updatedAt: now.toISOString(),
  }

  const next = [...trades]
  next[index] = updated
  saveTradingTrades(next)
  return updated
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function deleteTradingTrade(id) {
  const key = String(id ?? '').trim()
  if (!key) return false

  const trades = getTradingTrades()
  const next = trades.filter((trade) => trade.id !== key)
  if (next.length === trades.length) return false

  saveTradingTrades(next)
  return true
}

/**
 * 테스트용
 */
export function clearTradingTrades() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(TRADING_TRADES_STORAGE_KEY)
}
