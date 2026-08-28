/**
 * tradingPlanStorage.js — 매매 계획 (localStorage 전용)
 */

import {
  calculateActualTradeMetrics,
  calculateTradingPlanMetrics,
  validatePlanEntryInput,
  validatePlanExitInput,
} from '../utils/tradingPlanCalculator.js'
import { addTradingTradeFromClosedPlan } from './tradingTradeStorage.js'

export const TRADING_PLANS_STORAGE_KEY = 'aladdin.tradingPlans.v1'

export const TRADING_PLAN_STATUSES = Object.freeze([
  'WAITING',
  'ENTERED',
  'CLOSED',
  'CANCELLED',
])

/**
 * @typedef {'WAITING' | 'ENTERED' | 'CLOSED' | 'CANCELLED'} TradingPlanStatus
 */

/**
 * @typedef {Object} TradingPlan
 * @property {string} id
 * @property {string} symbol
 * @property {number} entryPrice
 * @property {number} stopPrice
 * @property {number} targetPrice
 * @property {number} investedAmount
 * @property {number} stopLossRate
 * @property {number} expectedLoss
 * @property {number} targetReturnRate
 * @property {number} expectedProfit
 * @property {number} riskRewardRatio
 * @property {string} note
 * @property {TradingPlanStatus} status
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {number} [actualEntryPrice]
 * @property {number} [actualInvestedAmount]
 * @property {string} [enteredAt]
 * @property {string} [entryNote]
 * @property {number} [actualExitPrice]
 * @property {string} [closedAt]
 * @property {string} [exitNote]
 * @property {number} [actualProfitLoss]
 * @property {number} [actualReturnRate]
 * @property {string} [cancelledAt]
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function parseOptionalIso(value) {
  if (value == null || value === '') return null
  const iso = String(value)
  if (Number.isNaN(new Date(iso).getTime())) return null
  return iso
}

/**
 * @param {unknown} value
 * @returns {TradingPlan | null}
 */
export function normalizeTradingPlan(value) {
  if (!value || typeof value !== 'object') return null

  const id = String(value.id ?? '').trim()
  const symbol = String(value.symbol ?? '').trim()
  const entryPrice = Number(value.entryPrice)
  const stopPrice = Number(value.stopPrice)
  const targetPrice = Number(value.targetPrice)
  const investedAmount = Number(value.investedAmount)
  const stopLossRate = Number(value.stopLossRate)
  const expectedLoss = Number(value.expectedLoss)
  const targetReturnRate = Number(value.targetReturnRate)
  const expectedProfit = Number(value.expectedProfit)
  const riskRewardRatio = Number(value.riskRewardRatio)
  const statusRaw = String(value.status ?? 'WAITING').trim()
  const createdAt = String(value.createdAt ?? '')
  const updatedAt = String(value.updatedAt ?? '')

  if (!id || !symbol) return null
  if (!TRADING_PLAN_STATUSES.includes(statusRaw)) return null
  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(stopPrice) ||
    stopPrice <= 0 ||
    !Number.isFinite(targetPrice) ||
    targetPrice <= 0 ||
    !Number.isFinite(investedAmount) ||
    investedAmount <= 0 ||
    !Number.isFinite(stopLossRate) ||
    !Number.isFinite(expectedLoss) ||
    expectedLoss <= 0 ||
    !Number.isFinite(targetReturnRate) ||
    !Number.isFinite(expectedProfit) ||
    expectedProfit <= 0 ||
    !Number.isFinite(riskRewardRatio) ||
    riskRewardRatio <= 0
  ) {
    return null
  }
  if (
    Number.isNaN(new Date(createdAt).getTime()) ||
    Number.isNaN(new Date(updatedAt).getTime())
  ) {
    return null
  }
  if (!(stopPrice < entryPrice && entryPrice < targetPrice)) return null

  /** @type {TradingPlan} */
  const base = {
    id,
    symbol,
    entryPrice,
    stopPrice,
    targetPrice,
    investedAmount,
    stopLossRate,
    expectedLoss,
    targetReturnRate,
    expectedProfit,
    riskRewardRatio,
    note: String(value.note ?? '').trim(),
    status: /** @type {TradingPlanStatus} */ (statusRaw),
    createdAt,
    updatedAt,
  }

  if (statusRaw === 'WAITING') {
    return base
  }

  if (statusRaw === 'CANCELLED') {
    const cancelledAt = parseOptionalIso(value.cancelledAt)
    return cancelledAt ? { ...base, cancelledAt } : base
  }

  const actualEntryPrice = Number(value.actualEntryPrice)
  const actualInvestedAmount = Number(value.actualInvestedAmount)
  const enteredAt = parseOptionalIso(value.enteredAt)

  if (
    !Number.isFinite(actualEntryPrice) ||
    actualEntryPrice <= 0 ||
    !Number.isFinite(actualInvestedAmount) ||
    actualInvestedAmount <= 0 ||
    !enteredAt
  ) {
    return null
  }

  /** @type {TradingPlan} */
  const entered = {
    ...base,
    actualEntryPrice,
    actualInvestedAmount,
    enteredAt,
    entryNote: String(value.entryNote ?? '').trim(),
  }

  if (statusRaw === 'ENTERED') {
    return entered
  }

  const actualExitPrice = Number(value.actualExitPrice)
  const closedAt = parseOptionalIso(value.closedAt)
  const actualProfitLoss = Number(value.actualProfitLoss)
  const actualReturnRate = Number(value.actualReturnRate)

  if (
    !Number.isFinite(actualExitPrice) ||
    actualExitPrice <= 0 ||
    !closedAt ||
    !Number.isFinite(actualProfitLoss) ||
    !Number.isFinite(actualReturnRate)
  ) {
    return null
  }

  return {
    ...entered,
    status: 'CLOSED',
    actualExitPrice,
    closedAt,
    exitNote: String(value.exitNote ?? '').trim(),
    actualProfitLoss,
    actualReturnRate,
  }
}

export function getTradingPlans() {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(TRADING_PLANS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => normalizeTradingPlan(item)).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * @param {TradingPlan[]} plans
 */
export function saveTradingPlans(plans) {
  if (typeof localStorage === 'undefined') return
  const list = Array.isArray(plans) ? plans : []
  localStorage.setItem(TRADING_PLANS_STORAGE_KEY, JSON.stringify(list))
}

/**
 * @param {string} id
 * @returns {TradingPlan | null}
 */
export function getTradingPlanById(id) {
  const key = String(id ?? '').trim()
  if (!key) return null
  return getTradingPlans().find((plan) => plan.id === key) ?? null
}

/**
 * @param {{
 *   symbol: string,
 *   entryPrice: number,
 *   stopPrice: number,
 *   targetPrice: number,
 *   investedAmount: number,
 *   note?: string,
 * }} input
 * @param {Date} [now]
 * @returns {TradingPlan}
 */
export function addTradingPlan(input, now = new Date()) {
  const metrics = calculateTradingPlanMetrics(input)
  if (!metrics) {
    throw new Error('Invalid trading plan metrics')
  }

  const iso = now.toISOString()
  /** @type {TradingPlan} */
  const plan = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `plan-${Date.now()}`,
    symbol: String(input.symbol).trim(),
    entryPrice: Number(input.entryPrice),
    stopPrice: Number(input.stopPrice),
    targetPrice: Number(input.targetPrice),
    investedAmount: Number(input.investedAmount),
    stopLossRate: metrics.stopLossRate,
    expectedLoss: metrics.expectedLoss,
    targetReturnRate: metrics.targetReturnRate,
    expectedProfit: metrics.expectedProfit,
    riskRewardRatio: metrics.riskRewardRatio,
    note: String(input.note ?? '').trim(),
    status: 'WAITING',
    createdAt: iso,
    updatedAt: iso,
  }

  saveTradingPlans([plan, ...getTradingPlans()])
  return plan
}

/**
 * @param {string} id
 * @param {{
 *   symbol: string,
 *   entryPrice: number,
 *   stopPrice: number,
 *   targetPrice: number,
 *   investedAmount: number,
 *   note?: string,
 * }} input
 * @param {Date} [now]
 * @returns {TradingPlan | null}
 */
export function updateTradingPlan(id, input, now = new Date()) {
  const key = String(id ?? '').trim()
  if (!key) return null

  const metrics = calculateTradingPlanMetrics(input)
  if (!metrics) {
    throw new Error('Invalid trading plan metrics')
  }

  const plans = getTradingPlans()
  const index = plans.findIndex((plan) => plan.id === key)
  if (index < 0) return null

  const existing = plans[index]
  if (existing.status !== 'WAITING') {
    throw new Error('Only WAITING plans can be edited')
  }

  /** @type {TradingPlan} */
  const updated = {
    ...existing,
    symbol: String(input.symbol).trim(),
    entryPrice: Number(input.entryPrice),
    stopPrice: Number(input.stopPrice),
    targetPrice: Number(input.targetPrice),
    investedAmount: Number(input.investedAmount),
    stopLossRate: metrics.stopLossRate,
    expectedLoss: metrics.expectedLoss,
    targetReturnRate: metrics.targetReturnRate,
    expectedProfit: metrics.expectedProfit,
    riskRewardRatio: metrics.riskRewardRatio,
    note: String(input.note ?? '').trim(),
    updatedAt: now.toISOString(),
  }

  const next = [...plans]
  next[index] = updated
  saveTradingPlans(next)
  return updated
}

/**
 * @param {string} id
 * @param {{
 *   actualEntryPrice: number,
 *   actualInvestedAmount: number,
 *   entryNote?: string,
 * }} input
 * @param {Date} [now]
 * @returns {TradingPlan | null}
 */
export function recordPlanEntry(id, input, now = new Date()) {
  const key = String(id ?? '').trim()
  if (!key) return null

  const validation = validatePlanEntryInput(input)
  if (!validation.ok) {
    throw new Error('Invalid plan entry input')
  }

  const plans = getTradingPlans()
  const index = plans.findIndex((plan) => plan.id === key)
  if (index < 0) return null

  const existing = plans[index]
  if (existing.status !== 'WAITING') {
    throw new Error('Only WAITING plans can record entry')
  }

  const iso = now.toISOString()
  /** @type {TradingPlan} */
  const updated = {
    ...existing,
    status: 'ENTERED',
    actualEntryPrice: Number(input.actualEntryPrice),
    actualInvestedAmount: Number(input.actualInvestedAmount),
    enteredAt: iso,
    entryNote: String(input.entryNote ?? '').trim(),
    updatedAt: iso,
  }

  const next = [...plans]
  next[index] = updated
  saveTradingPlans(next)
  return updated
}

/**
 * @typedef {Object} RecordPlanExitResult
 * @property {TradingPlan} plan
 * @property {import('./tradingTradeStorage.js').TradeSyncResult} tradeSync
 */

/**
 * @param {string} id
 * @param {{
 *   actualExitPrice: number,
 *   exitNote?: string,
 * }} input
 * @param {Date} [now]
 * @returns {RecordPlanExitResult | null}
 */
export function recordPlanExit(id, input, now = new Date()) {
  const key = String(id ?? '').trim()
  if (!key) return null

  const validation = validatePlanExitInput(input)
  if (!validation.ok) {
    throw new Error('Invalid plan exit input')
  }

  const plans = getTradingPlans()
  const index = plans.findIndex((plan) => plan.id === key)
  if (index < 0) return null

  const existing = plans[index]
  if (existing.status !== 'ENTERED') {
    throw new Error('Only ENTERED plans can record exit')
  }

  const actualEntryPrice = existing.actualEntryPrice
  const actualInvestedAmount = existing.actualInvestedAmount
  if (
    actualEntryPrice == null ||
    actualInvestedAmount == null
  ) {
    return null
  }

  const metrics = calculateActualTradeMetrics(
    actualEntryPrice,
    Number(input.actualExitPrice),
    actualInvestedAmount,
  )
  if (!metrics) {
    throw new Error('Invalid exit metrics')
  }

  const iso = now.toISOString()
  /** @type {TradingPlan} */
  const updated = {
    ...existing,
    status: 'CLOSED',
    actualExitPrice: Number(input.actualExitPrice),
    closedAt: iso,
    exitNote: String(input.exitNote ?? '').trim(),
    actualProfitLoss: metrics.profitLoss,
    actualReturnRate: metrics.returnRate,
    updatedAt: iso,
  }

  const next = [...plans]
  next[index] = updated
  saveTradingPlans(next)

  const tradeSync = addTradingTradeFromClosedPlan(updated, now)
  return { plan: updated, tradeSync }
}

/**
 * @param {string} id
 * @param {Date} [now]
 * @returns {TradingPlan | null}
 */
export function cancelTradingPlan(id, now = new Date()) {
  const key = String(id ?? '').trim()
  if (!key) return null

  const plans = getTradingPlans()
  const index = plans.findIndex((plan) => plan.id === key)
  if (index < 0) return null

  const existing = plans[index]
  if (existing.status !== 'WAITING') {
    throw new Error('Only WAITING plans can be cancelled')
  }

  const iso = now.toISOString()
  /** @type {TradingPlan} */
  const updated = {
    ...existing,
    status: 'CANCELLED',
    cancelledAt: iso,
    updatedAt: iso,
  }

  const next = [...plans]
  next[index] = updated
  saveTradingPlans(next)
  return updated
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function deleteTradingPlan(id) {
  const key = String(id ?? '').trim()
  if (!key) return false

  const plans = getTradingPlans()
  const next = plans.filter((plan) => plan.id !== key)
  if (next.length === plans.length) return false

  saveTradingPlans(next)
  return true
}

/** 테스트용 */
export function clearTradingPlans() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(TRADING_PLANS_STORAGE_KEY)
}
