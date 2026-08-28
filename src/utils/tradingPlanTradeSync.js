/**
 * tradingPlanTradeSync.js — CLOSED 매매 계획 → 매매일지 매핑
 */

export const TRADING_TRADE_SOURCE_PLAN = 'TRADING_PLAN'

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan} plan
 */
export function isClosedPlanEligibleForTrade(plan) {
  if (plan.status !== 'CLOSED') return false

  const actualEntryPrice = Number(plan.actualEntryPrice)
  const actualInvestedAmount = Number(plan.actualInvestedAmount)
  const actualExitPrice = Number(plan.actualExitPrice)
  const actualReturnRate = Number(plan.actualReturnRate)
  const actualProfitLoss = Number(plan.actualProfitLoss)
  const enteredAt = String(plan.enteredAt ?? '')
  const closedAt = String(plan.closedAt ?? '')

  if (
    !Number.isFinite(actualEntryPrice) ||
    actualEntryPrice <= 0 ||
    !Number.isFinite(actualInvestedAmount) ||
    actualInvestedAmount <= 0 ||
    !Number.isFinite(actualExitPrice) ||
    actualExitPrice <= 0 ||
    !Number.isFinite(actualReturnRate) ||
    !Number.isFinite(actualProfitLoss)
  ) {
    return false
  }

  if (
    Number.isNaN(new Date(enteredAt).getTime()) ||
    Number.isNaN(new Date(closedAt).getTime())
  ) {
    return false
  }

  return true
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan} plan
 * @returns {Omit<import('../services/tradingTradeStorage.js').TradingTrade, 'id' | 'createdAt' | 'updatedAt'> | null}
 */
export function mapClosedPlanToTrade(plan) {
  if (!isClosedPlanEligibleForTrade(plan)) return null

  const entryReason = String(plan.entryNote ?? '').trim() || String(plan.note ?? '').trim()
  const review = String(plan.exitNote ?? '').trim()

  return {
    symbol: plan.symbol,
    entryPrice: Number(plan.actualEntryPrice),
    exitPrice: Number(plan.actualExitPrice),
    investedAmount: Number(plan.actualInvestedAmount),
    returnRate: Number(plan.actualReturnRate),
    profitLoss: Number(plan.actualProfitLoss),
    entryReason,
    review,
    tags: [],
    tradedAt: String(plan.closedAt),
    source: TRADING_TRADE_SOURCE_PLAN,
    sourcePlanId: plan.id,
  }
}

/**
 * @param {import('../services/tradingTradeStorage.js').TradingTrade} trade
 */
export function isTradingPlanSourceTrade(trade) {
  return trade?.source === TRADING_TRADE_SOURCE_PLAN && Boolean(trade?.sourcePlanId)
}
