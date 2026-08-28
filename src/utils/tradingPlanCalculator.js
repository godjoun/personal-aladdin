/**
 * tradingPlanCalculator.js — 매매 계획 위험·보상 계산
 */

/**
 * @param {{
 *   entryPrice: unknown,
 *   stopPrice: unknown,
 *   targetPrice: unknown,
 *   investedAmount: unknown,
 * }} input
 * @returns {{
 *   stopLossRate: number,
 *   expectedLoss: number,
 *   targetReturnRate: number,
 *   expectedProfit: number,
 *   riskRewardRatio: number,
 * } | null}
 */
export function calculateTradingPlanMetrics(input) {
  const entryPrice = Number(input.entryPrice)
  const stopPrice = Number(input.stopPrice)
  const targetPrice = Number(input.targetPrice)
  const investedAmount = Number(input.investedAmount)

  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(stopPrice) ||
    stopPrice <= 0 ||
    !Number.isFinite(targetPrice) ||
    targetPrice <= 0 ||
    !Number.isFinite(investedAmount) ||
    investedAmount <= 0
  ) {
    return null
  }

  if (!(stopPrice < entryPrice && entryPrice < targetPrice)) {
    return null
  }

  const stopLossRate = ((stopPrice - entryPrice) / entryPrice) * 100
  const expectedLoss =
    investedAmount * ((entryPrice - stopPrice) / entryPrice)
  const targetReturnRate = ((targetPrice - entryPrice) / entryPrice) * 100
  const expectedProfit =
    investedAmount * ((targetPrice - entryPrice) / entryPrice)

  if (
    !Number.isFinite(stopLossRate) ||
    !Number.isFinite(expectedLoss) ||
    expectedLoss <= 0 ||
    !Number.isFinite(targetReturnRate) ||
    !Number.isFinite(expectedProfit) ||
    expectedProfit <= 0
  ) {
    return null
  }

  const riskRewardRatio = expectedProfit / expectedLoss
  if (!Number.isFinite(riskRewardRatio) || riskRewardRatio <= 0) {
    return null
  }

  return {
    stopLossRate,
    expectedLoss,
    targetReturnRate,
    expectedProfit,
    riskRewardRatio,
  }
}

/**
 * @param {{
 *   symbol?: string,
 *   entryPrice?: unknown,
 *   stopPrice?: unknown,
 *   targetPrice?: unknown,
 *   investedAmount?: unknown,
 * }} input
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validateTradingPlanInput(input) {
  /** @type {Record<string, string>} */
  const errors = {}

  const symbol = String(input.symbol ?? '').trim()
  if (!symbol) {
    errors.symbol = '코인을 입력해 주세요.'
  }

  const entryPrice = Number(input.entryPrice)
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    errors.entryPrice = '진입가는 0보다 커야 합니다.'
  }

  const stopPrice = Number(input.stopPrice)
  if (!Number.isFinite(stopPrice) || stopPrice <= 0) {
    errors.stopPrice = '손절가는 0보다 커야 합니다.'
  }

  const targetPrice = Number(input.targetPrice)
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    errors.targetPrice = '목표가는 0보다 커야 합니다.'
  }

  if (
    Number.isFinite(entryPrice) &&
    entryPrice > 0 &&
    Number.isFinite(stopPrice) &&
    stopPrice > 0
  ) {
    if (stopPrice >= entryPrice) {
      errors.stopPrice = '손절가는 진입가보다 낮아야 합니다.'
    }
  }

  if (
    Number.isFinite(entryPrice) &&
    entryPrice > 0 &&
    Number.isFinite(targetPrice) &&
    targetPrice > 0
  ) {
    if (targetPrice <= entryPrice) {
      errors.targetPrice = '목표가는 진입가보다 높아야 합니다.'
    }
  }

  const investedAmount = Number(input.investedAmount)
  if (!Number.isFinite(investedAmount) || investedAmount <= 0) {
    errors.investedAmount = '투자 금액은 0보다 커야 합니다.'
  }

  if (Object.keys(errors).length === 0) {
    const metrics = calculateTradingPlanMetrics(input)
    if (!metrics) {
      errors.entryPrice = '진입·손절·목표 가격 관계를 확인해 주세요.'
    }
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * @param {number} ratio
 */
export function formatRiskRewardRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return '—'
  return `1 : ${ratio.toFixed(2)}`
}

/**
 * @param {unknown} actualEntryPrice
 * @param {unknown} actualExitPrice
 * @param {unknown} actualInvestedAmount
 * @returns {{ returnRate: number, profitLoss: number } | null}
 */
export function calculateActualTradeMetrics(
  actualEntryPrice,
  actualExitPrice,
  actualInvestedAmount,
) {
  const entry = Number(actualEntryPrice)
  const exit = Number(actualExitPrice)
  const invested = Number(actualInvestedAmount)

  if (
    !Number.isFinite(entry) ||
    entry <= 0 ||
    !Number.isFinite(exit) ||
    exit <= 0 ||
    !Number.isFinite(invested) ||
    invested <= 0
  ) {
    return null
  }

  const returnRate = ((exit - entry) / entry) * 100
  const profitLoss = invested * ((exit - entry) / entry)

  if (!Number.isFinite(returnRate) || !Number.isFinite(profitLoss)) {
    return null
  }

  return { returnRate, profitLoss }
}

/**
 * @param {unknown} currentPrice
 * @param {unknown} actualEntryPrice
 * @param {unknown} actualInvestedAmount
 */
export function calculateUnrealizedMetrics(
  currentPrice,
  actualEntryPrice,
  actualInvestedAmount,
) {
  return calculateActualTradeMetrics(
    actualEntryPrice,
    currentPrice,
    actualInvestedAmount,
  )
}

/**
 * @param {{ actualEntryPrice?: unknown, actualInvestedAmount?: unknown }} input
 */
export function validatePlanEntryInput(input) {
  /** @type {Record<string, string>} */
  const errors = {}

  const actualEntryPrice = Number(input.actualEntryPrice)
  if (!Number.isFinite(actualEntryPrice) || actualEntryPrice <= 0) {
    errors.actualEntryPrice = '실제 진입가는 0보다 커야 합니다.'
  }

  const actualInvestedAmount = Number(input.actualInvestedAmount)
  if (!Number.isFinite(actualInvestedAmount) || actualInvestedAmount <= 0) {
    errors.actualInvestedAmount = '실제 투자금액은 0보다 커야 합니다.'
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * @param {{ actualExitPrice?: unknown }} input
 */
export function validatePlanExitInput(input) {
  /** @type {Record<string, string>} */
  const errors = {}

  const actualExitPrice = Number(input.actualExitPrice)
  if (!Number.isFinite(actualExitPrice) || actualExitPrice <= 0) {
    errors.actualExitPrice = '실제 청산가는 0보다 커야 합니다.'
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan[]} plans
 */
export function getActiveTradingPlans(plans) {
  if (!Array.isArray(plans)) return []
  return plans.filter(
    (plan) => plan.status === 'WAITING' || plan.status === 'ENTERED',
  )
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan[]} plans
 * @returns {string[]}
 */
export function getActiveTradingPlanSymbols(plans) {
  return [...new Set(getActiveTradingPlans(plans).map((plan) => plan.symbol))]
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan} plan
 */
export function isActiveTradingPlan(plan) {
  return plan.status === 'WAITING' || plan.status === 'ENTERED'
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan[]} plans
 * @param {number} [limit]
 */
export function getRecentTradingPlans(plans, limit = 3) {
  if (!Array.isArray(plans)) return []
  return [...plans]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, limit)
}

/**
 * @param {string} status
 */
export function formatTradingPlanStatus(status) {
  if (status === 'WAITING') return '진입 대기'
  if (status === 'ENTERED') return '보유 중'
  if (status === 'CLOSED') return '거래 종료'
  if (status === 'CANCELLED') return '계획 취소'
  return status || '—'
}
