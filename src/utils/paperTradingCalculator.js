/**
 * paperTradingCalculator.js — PAPER 모의투자 계산·검증
 */

/**
 * @param {number} investedAmount
 * @param {number} entryPrice
 * @returns {number | null}
 */
export function calculatePaperQuantity(investedAmount, entryPrice) {
  const invested = Number(investedAmount)
  const entry = Number(entryPrice)
  if (!Number.isFinite(invested) || invested <= 0) return null
  if (!Number.isFinite(entry) || entry <= 0) return null

  const quantity = invested / entry
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  return quantity
}

/**
 * @param {{
 *   entryPrice: number,
 *   exitPrice: number,
 *   investedAmount: number,
 *   quantity: number,
 * }} input
 * @returns {{ sellProceeds: number, returnRate: number, profitLoss: number } | null}
 */
export function calculatePaperSellMetrics(input) {
  const entry = Number(input.entryPrice)
  const exit = Number(input.exitPrice)
  const invested = Number(input.investedAmount)
  const quantity = Number(input.quantity)

  if (!Number.isFinite(entry) || entry <= 0) return null
  if (!Number.isFinite(exit) || exit <= 0) return null
  if (!Number.isFinite(invested) || invested <= 0) return null
  if (!Number.isFinite(quantity) || quantity <= 0) return null

  const sellProceeds = quantity * exit
  const returnRate = ((exit - entry) / entry) * 100
  const profitLoss = sellProceeds - invested

  if (
    !Number.isFinite(sellProceeds) ||
    !Number.isFinite(returnRate) ||
    !Number.isFinite(profitLoss)
  ) {
    return null
  }

  return { sellProceeds, returnRate, profitLoss }
}

/**
 * @param {{ symbol?: string, entryPrice?: unknown, investedAmount?: unknown, availableCash?: unknown }} input
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validatePaperBuyInput(input) {
  /** @type {Record<string, string>} */
  const errors = {}

  const symbol = String(input.symbol ?? '').trim()
  if (!symbol) {
    errors.symbol = '코인을 입력해 주세요.'
  }

  const entryPrice = Number(input.entryPrice)
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    errors.entryPrice = '매수가는 0보다 커야 합니다.'
  }

  const investedAmount = Number(input.investedAmount)
  if (!Number.isFinite(investedAmount) || investedAmount <= 0) {
    errors.investedAmount = '투자 금액은 0보다 커야 합니다.'
  } else {
    const cash = Number(input.availableCash)
    if (Number.isFinite(cash) && investedAmount > cash) {
      errors.investedAmount = '투자 금액이 현재 현금을 초과합니다.'
    }
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * @param {unknown} initialCapital
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validatePaperInitialCapital(initialCapital) {
  /** @type {Record<string, string>} */
  const errors = {}
  const amount = Number(initialCapital)
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.initialCapital = '초기 가상자금은 0보다 커야 합니다.'
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * @param {{ exitPrice?: unknown }} input
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validatePaperSellInput(input) {
  /** @type {Record<string, string>} */
  const errors = {}
  const exitPrice = Number(input.exitPrice)
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    errors.exitPrice = '매도가는 0보다 커야 합니다.'
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * @param {number} value
 */
export function formatPaperQuantity(value) {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('ko-KR', {
    maximumFractionDigits: 8,
  })
}
