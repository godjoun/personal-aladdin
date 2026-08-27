/**
 * kiwoomDashboard.js — 키움 잔고 → Dashboard 행/요약
 * ─────────────────────────────────────────────────────────
 * 키움 제공 값을 우선 사용하고, 없으면 0으로 채우지 않습니다.
 * localStorage 수동 자산과 심볼이 겹치면 키움만 사용합니다.
 */

import {
  calculateHoldingValue,
  calculateProfitLoss,
  calculateProfitRate,
  hasValidPrice,
} from './calculator.js'
import { buildAssetRows, calculatePortfolioSummary } from './portfolioRows.js'

export const KIWOOM_ACCOUNT_LABELS = {
  isa: 'ISA',
  general: '일반',
}

/**
 * @param {object} holding - flattenKiwoomBalanceHoldings 항목
 */
export function buildKiwoomHoldingRow(holding) {
  const accountType = holding.accountType === 'general' ? 'general' : 'isa'
  const symbol = String(holding.symbol || '').trim()
  const name = String(holding.name || '').trim()
  const quantity = holding.quantity
  const averageBuyPrice = holding.averageBuyPrice

  let latestPrice = hasValidPrice(holding.currentPrice)
    ? Number(holding.currentPrice)
    : null

  // 키움 공식 값 우선 — 있으면 단순 (현재가-평단)×수량 으로 덮어쓰지 않음
  const hasOfficialEval =
    holding.evaluationAmount != null && Number.isFinite(holding.evaluationAmount)
  const hasOfficialProfitLoss =
    holding.profitLoss != null && Number.isFinite(holding.profitLoss)
  const hasOfficialReturnRate =
    holding.returnRate != null && Number.isFinite(holding.returnRate)

  let holdingValue = hasOfficialEval ? Number(holding.evaluationAmount) : null
  let profitLoss = hasOfficialProfitLoss ? Number(holding.profitLoss) : null
  let profitRate = hasOfficialReturnRate ? Number(holding.returnRate) : null

  if (!hasOfficialEval && latestPrice != null && quantity != null) {
    holdingValue = calculateHoldingValue(quantity, latestPrice)
  }
  if (
    !hasOfficialProfitLoss &&
    latestPrice != null &&
    quantity != null &&
    averageBuyPrice != null
  ) {
    profitLoss = calculateProfitLoss(quantity, averageBuyPrice, latestPrice)
  }
  if (!hasOfficialReturnRate && latestPrice != null && averageBuyPrice != null) {
    profitRate = calculateProfitRate(averageBuyPrice, latestPrice)
  }

  let invested = null
  if (holding.buyAmount != null && Number.isFinite(holding.buyAmount)) {
    invested = Number(holding.buyAmount)
  } else if (
    quantity != null &&
    averageBuyPrice != null &&
    Number.isFinite(quantity) &&
    Number.isFinite(averageBuyPrice)
  ) {
    invested = quantity * averageBuyPrice
  }

  const hasPrice = latestPrice != null

  return {
    id: `kiwoom:${accountType}:${symbol || name}`,
    source: 'kiwoom',
    accountType,
    accountLabel: KIWOOM_ACCOUNT_LABELS[accountType],
    canDelete: false,
    name,
    symbol,
    quantity,
    averageBuyPrice,
    latestPrice,
    hasPrice,
    invested,
    holdingValue,
    profitLoss,
    profitRate,
  }
}

/**
 * @param {Array<object>} holdings
 */
export function buildKiwoomHoldingRows(holdings) {
  if (!Array.isArray(holdings)) return []
  return holdings.map((holding) => buildKiwoomHoldingRow(holding))
}

/**
 * 키움 평가 가능 종목만으로 요약
 * - 평가금액/손익이 없는 종목은 0으로 넣지 않음
 * - 일부 누락 시 평가손익·수익률은 null(—)
 */
export function calculateKiwoomPortfolioSummary(rows) {
  const list = Array.isArray(rows) ? rows : []

  const investedParts = list
    .map((row) => row.invested)
    .filter((value) => value != null && Number.isFinite(value))
  const totalInvested =
    investedParts.length > 0
      ? investedParts.reduce((sum, value) => sum + value, 0)
      : null

  const evalParts = list.filter(
    (row) => row.holdingValue != null && Number.isFinite(row.holdingValue),
  )
  const plParts = list.filter(
    (row) => row.profitLoss != null && Number.isFinite(row.profitLoss),
  )

  const totalHoldingValue =
    evalParts.length > 0
      ? evalParts.reduce((sum, row) => sum + row.holdingValue, 0)
      : null

  const incomplete =
    list.length === 0 ||
    evalParts.length < list.length ||
    plParts.length < list.length

  const totalProfitLoss =
    incomplete || plParts.length === 0
      ? null
      : plParts.reduce((sum, row) => sum + row.profitLoss, 0)

  const investedForRate = list
    .filter(
      (row) =>
        row.holdingValue != null &&
        row.profitLoss != null &&
        row.invested != null &&
        row.invested > 0,
    )
    .reduce((sum, row) => sum + row.invested, 0)

  const totalReturnRate =
    totalProfitLoss == null || investedForRate <= 0
      ? null
      : (totalProfitLoss / investedForRate) * 100

  return {
    totalInvested,
    totalHoldingValue,
    totalProfitLoss,
    totalReturnRate,
    valuedCount: evalParts.length,
    noPriceCount: list.length - evalParts.length,
    incompletePrices: incomplete,
  }
}

/**
 * Dashboard 표시용 행 + 요약
 * 키움 성공 시 키움 우선. 수동 자산 중 동일 심볼은 제외.
 *
 * @param {{
 *   kiwoomHoldings?: Array<object>,
 *   kiwoomOk?: boolean,
 *   assets?: Array<object>,
 *   prices?: Array<object>,
 * }} input
 */
export function buildDashboardHoldingsView({
  kiwoomHoldings = [],
  kiwoomOk = false,
  assets = [],
  prices = [],
} = {}) {
  const kiwoomRows = buildKiwoomHoldingRows(kiwoomHoldings)

  if (kiwoomOk && kiwoomRows.length > 0) {
    const kiwoomSymbols = new Set(
      kiwoomRows.map((row) => row.symbol).filter(Boolean),
    )

    const manualRows = buildAssetRows(assets, prices)
      .filter((row) => !kiwoomSymbols.has(row.symbol))
      .map((row) => ({
        ...row,
        source: 'manual',
        accountType: null,
        accountLabel: '수동',
        canDelete: true,
      }))

    // 요약은 키움 평가 가능 종목만 (수동 잔여는 중복 합산 방지·우선순위)
    const summary = calculateKiwoomPortfolioSummary(kiwoomRows)

    return {
      rows: [...kiwoomRows, ...manualRows],
      summary,
      usingKiwoom: true,
    }
  }

  const manualRows = buildAssetRows(assets, prices).map((row) => ({
    ...row,
    source: 'manual',
    accountType: null,
    accountLabel: '수동',
    canDelete: true,
  }))

  return {
    rows: manualRows,
    summary: calculatePortfolioSummary(manualRows),
    usingKiwoom: false,
  }
}
