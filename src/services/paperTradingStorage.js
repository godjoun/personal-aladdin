/**
 * paperTradingStorage.js — PAPER 모의투자 (localStorage 전용)
 */

import {
  calculatePaperQuantity,
  calculatePaperSellMetrics,
  validatePaperBuyInput,
  validatePaperInitialCapital,
  validatePaperSellInput,
} from '../utils/paperTradingCalculator.js'

export const PAPER_ACCOUNT_STORAGE_KEY = 'aladdin.paperAccount.v1'
export const PAPER_TRADES_STORAGE_KEY = 'aladdin.paperTrades.v1'

/**
 * @typedef {Object} PaperPosition
 * @property {string} symbol
 * @property {number} entryPrice
 * @property {number} investedAmount
 * @property {number} quantity
 * @property {string} openedAt
 */

/**
 * @typedef {Object} PaperAccount
 * @property {number} initialCapital
 * @property {number} cash
 * @property {PaperPosition | null} position
 * @property {number} realizedProfitLoss
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} PaperTrade
 * @property {string} id
 * @property {'PAPER'} mode
 * @property {string} symbol
 * @property {number} entryPrice
 * @property {number} exitPrice
 * @property {number} investedAmount
 * @property {number} quantity
 * @property {number} returnRate
 * @property {number} profitLoss
 * @property {string} openedAt
 * @property {string} closedAt
 */

/**
 * @param {unknown} value
 * @returns {PaperPosition | null}
 */
export function normalizePaperPosition(value) {
  if (!value || typeof value !== 'object') return null

  const symbol = String(value.symbol ?? '').trim()
  const entryPrice = Number(value.entryPrice)
  const investedAmount = Number(value.investedAmount)
  const quantity = Number(value.quantity)
  const openedAt = String(value.openedAt ?? '')

  if (!symbol) return null
  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(investedAmount) ||
    investedAmount <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null
  }
  if (Number.isNaN(new Date(openedAt).getTime())) return null

  return { symbol, entryPrice, investedAmount, quantity, openedAt }
}

/**
 * @param {unknown} value
 * @returns {PaperAccount | null}
 */
export function normalizePaperAccount(value) {
  if (!value || typeof value !== 'object') return null

  const initialCapital = Number(value.initialCapital)
  const cash = Number(value.cash)
  const realizedProfitLoss = Number(value.realizedProfitLoss)
  const createdAt = String(value.createdAt ?? '')
  const updatedAt = String(value.updatedAt ?? '')
  const positionRaw = value.position

  if (
    !Number.isFinite(initialCapital) ||
    initialCapital <= 0 ||
    !Number.isFinite(cash) ||
    cash < 0 ||
    !Number.isFinite(realizedProfitLoss)
  ) {
    return null
  }
  if (
    Number.isNaN(new Date(createdAt).getTime()) ||
    Number.isNaN(new Date(updatedAt).getTime())
  ) {
    return null
  }

  let position = null
  if (positionRaw != null) {
    position = normalizePaperPosition(positionRaw)
    if (!position) return null
  }

  return {
    initialCapital,
    cash,
    position,
    realizedProfitLoss,
    createdAt,
    updatedAt,
  }
}

/**
 * @param {unknown} value
 * @returns {PaperTrade | null}
 */
export function normalizePaperTrade(value) {
  if (!value || typeof value !== 'object') return null

  const id = String(value.id ?? '').trim()
  const mode = String(value.mode ?? '')
  const symbol = String(value.symbol ?? '').trim()
  const entryPrice = Number(value.entryPrice)
  const exitPrice = Number(value.exitPrice)
  const investedAmount = Number(value.investedAmount)
  const quantity = Number(value.quantity)
  const returnRate = Number(value.returnRate)
  const profitLoss = Number(value.profitLoss)
  const openedAt = String(value.openedAt ?? '')
  const closedAt = String(value.closedAt ?? '')

  if (!id || mode !== 'PAPER' || !symbol) return null
  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(exitPrice) ||
    exitPrice <= 0 ||
    !Number.isFinite(investedAmount) ||
    investedAmount <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(returnRate) ||
    !Number.isFinite(profitLoss)
  ) {
    return null
  }
  if (
    Number.isNaN(new Date(openedAt).getTime()) ||
    Number.isNaN(new Date(closedAt).getTime())
  ) {
    return null
  }

  return {
    id,
    mode: 'PAPER',
    symbol,
    entryPrice,
    exitPrice,
    investedAmount,
    quantity,
    returnRate,
    profitLoss,
    openedAt,
    closedAt,
  }
}

/**
 * @returns {PaperAccount | null}
 */
export function getPaperAccount() {
  if (typeof localStorage === 'undefined') return null

  try {
    const raw = localStorage.getItem(PAPER_ACCOUNT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return normalizePaperAccount(parsed)
  } catch {
    return null
  }
}

/**
 * @param {PaperAccount} account
 */
export function savePaperAccount(account) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PAPER_ACCOUNT_STORAGE_KEY, JSON.stringify(account))
}

/**
 * @returns {PaperTrade[]}
 */
export function getPaperTrades() {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(PAPER_TRADES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => normalizePaperTrade(item)).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * @param {PaperTrade[]} trades
 */
export function savePaperTrades(trades) {
  if (typeof localStorage === 'undefined') return
  const list = Array.isArray(trades) ? trades : []
  localStorage.setItem(PAPER_TRADES_STORAGE_KEY, JSON.stringify(list))
}

/**
 * @param {number} initialCapital
 * @param {Date} [now]
 * @returns {PaperAccount}
 */
export function createPaperAccount(initialCapital, now = new Date()) {
  const validation = validatePaperInitialCapital(initialCapital)
  if (!validation.ok) {
    throw new Error('Invalid initial capital')
  }

  const amount = Number(initialCapital)
  const iso = now.toISOString()

  /** @type {PaperAccount} */
  const account = {
    initialCapital: amount,
    cash: amount,
    position: null,
    realizedProfitLoss: 0,
    createdAt: iso,
    updatedAt: iso,
  }

  savePaperAccount(account)
  return account
}

/**
 * @param {{
 *   symbol: string,
 *   entryPrice: number,
 *   investedAmount: number,
 * }} input
 * @param {Date} [now]
 * @returns {{
 *   ok: true,
 *   account: PaperAccount,
 * } | {
 *   ok: false,
 *   code: 'NO_ACCOUNT' | 'HAS_POSITION' | 'VALIDATION',
 *   message?: string,
 *   errors?: Record<string, string>,
 * }}
 */
export function executePaperBuy(input, now = new Date()) {
  const account = getPaperAccount()
  if (!account) {
    return {
      ok: false,
      code: 'NO_ACCOUNT',
      message: 'PAPER 계좌가 없습니다. 모의투자를 먼저 시작해 주세요.',
    }
  }

  if (account.position) {
    return {
      ok: false,
      code: 'HAS_POSITION',
      message: '이미 보유 중인 포지션이 있습니다. 먼저 가상 매도를 진행해 주세요.',
    }
  }

  const validation = validatePaperBuyInput({
    ...input,
    availableCash: account.cash,
  })
  if (!validation.ok) {
    return { ok: false, code: 'VALIDATION', errors: validation.errors }
  }

  const quantity = calculatePaperQuantity(input.investedAmount, input.entryPrice)
  if (!quantity) {
    return {
      ok: false,
      code: 'VALIDATION',
      errors: { investedAmount: '투자 금액과 매수가를 확인해 주세요.' },
    }
  }

  const investedAmount = Number(input.investedAmount)
  /** @type {PaperPosition} */
  const position = {
    symbol: String(input.symbol).trim(),
    entryPrice: Number(input.entryPrice),
    investedAmount,
    quantity,
    openedAt: now.toISOString(),
  }

  /** @type {PaperAccount} */
  const updated = {
    ...account,
    cash: account.cash - investedAmount,
    position,
    updatedAt: now.toISOString(),
  }

  savePaperAccount(updated)
  return { ok: true, account: updated }
}

/**
 * @param {{ exitPrice: number }} input
 * @param {Date} [now]
 * @returns {{
 *   ok: true,
 *   account: PaperAccount,
 *   trade: PaperTrade,
 * } | {
 *   ok: false,
 *   code: 'NO_ACCOUNT' | 'NO_POSITION' | 'VALIDATION',
 *   message?: string,
 *   errors?: Record<string, string>,
 * }}
 */
export function executePaperSell(input, now = new Date()) {
  const account = getPaperAccount()
  if (!account) {
    return {
      ok: false,
      code: 'NO_ACCOUNT',
      message: 'PAPER 계좌가 없습니다.',
    }
  }

  const position = account.position
  if (!position) {
    return {
      ok: false,
      code: 'NO_POSITION',
      message: '청산할 포지션이 없습니다.',
    }
  }

  const validation = validatePaperSellInput(input)
  if (!validation.ok) {
    return { ok: false, code: 'VALIDATION', errors: validation.errors }
  }

  const metrics = calculatePaperSellMetrics({
    entryPrice: position.entryPrice,
    exitPrice: Number(input.exitPrice),
    investedAmount: position.investedAmount,
    quantity: position.quantity,
  })
  if (!metrics) {
    return {
      ok: false,
      code: 'VALIDATION',
      errors: { exitPrice: '매도가를 확인해 주세요.' },
    }
  }

  const iso = now.toISOString()
  /** @type {PaperTrade} */
  const trade = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `paper-${Date.now()}`,
    mode: 'PAPER',
    symbol: position.symbol,
    entryPrice: position.entryPrice,
    exitPrice: Number(input.exitPrice),
    investedAmount: position.investedAmount,
    quantity: position.quantity,
    returnRate: metrics.returnRate,
    profitLoss: metrics.profitLoss,
    openedAt: position.openedAt,
    closedAt: iso,
  }

  /** @type {PaperAccount} */
  const updated = {
    ...account,
    cash: account.cash + metrics.sellProceeds,
    position: null,
    realizedProfitLoss: account.realizedProfitLoss + metrics.profitLoss,
    updatedAt: iso,
  }

  savePaperAccount(updated)
  savePaperTrades([trade, ...getPaperTrades()])
  return { ok: true, account: updated, trade }
}

/**
 * PAPER 계좌·거래 기록 초기화 (실제 매매일지는 영향 없음)
 */
export function resetPaperTrading() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(PAPER_ACCOUNT_STORAGE_KEY)
  localStorage.removeItem(PAPER_TRADES_STORAGE_KEY)
}

/** 테스트용 */
export function clearPaperTrading() {
  resetPaperTrading()
}
