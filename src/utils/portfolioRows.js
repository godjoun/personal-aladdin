/**
 * portfolioRows.js — 보유 자산 + 시세 매칭 행 데이터
 */

import {
  calculateHoldingValue,
  calculateProfitLoss,
  calculateProfitRate,
  getLatestPriceBySymbol,
  hasValidPrice,
} from './calculator.js'

/**
 * 자산 1건 + 시세 매칭 + 계산 결과
 *
 * 현재가가 없으면 hasPrice=false 이고
 * holdingValue / profitLoss / profitRate 는 null 입니다.
 * (0원·-100% 로 계산하지 않음)
 */
export function buildAssetRows(assets, prices) {
  if (!Array.isArray(assets)) {
    return []
  }

  return assets.map((asset) => {
    const latest = getLatestPriceBySymbol(prices, asset.symbol)
    const candidatePrice = latest?.closePrice
    const latestPrice = hasValidPrice(candidatePrice)
      ? Number(candidatePrice)
      : null

    const hasPrice = latestPrice !== null
    const invested = Number(asset.quantity) * Number(asset.averageBuyPrice)

    let holdingValue = null
    let profitLoss = null
    let profitRate = null

    if (hasPrice) {
      holdingValue = calculateHoldingValue(asset.quantity, latestPrice)
      profitLoss = calculateProfitLoss(
        asset.quantity,
        asset.averageBuyPrice,
        latestPrice,
      )
      profitRate = calculateProfitRate(asset.averageBuyPrice, latestPrice)
    }

    return {
      ...asset,
      latestPrice,
      priceDate: latest?.date ?? null,
      hasPrice,
      invested: Number.isFinite(invested) ? invested : 0,
      holdingValue,
      profitLoss,
      profitRate,
    }
  })
}

/**
 * 포트폴리오 합계
 *
 * - 투자원금: 전 자산 합산
 * - 평가자산/손익/수익률: 현재가 있는 자산만
 * - incompletePrices: 현재가 없는 자산이 1개라도 있으면 true
 */
export function calculatePortfolioSummary(rows) {
  const list = Array.isArray(rows) ? rows : []
  const totalInvested = list.reduce((sum, row) => sum + (row.invested || 0), 0)
  const valuedRows = list.filter((row) => row.hasPrice)
  const noPriceCount = list.length - valuedRows.length
  const incompletePrices = noPriceCount > 0

  const totalHoldingValue =
    valuedRows.length === 0
      ? null
      : valuedRows.reduce((sum, row) => sum + (row.holdingValue || 0), 0)

  const investedWithPrice = valuedRows.reduce(
    (sum, row) => sum + (row.invested || 0),
    0,
  )

  const totalProfitLoss =
    incompletePrices || valuedRows.length === 0
      ? null
      : valuedRows.reduce((sum, row) => sum + (row.profitLoss || 0), 0)

  const totalReturnRate =
    totalProfitLoss == null || investedWithPrice <= 0
      ? null
      : (totalProfitLoss / investedWithPrice) * 100

  return {
    totalInvested,
    totalHoldingValue,
    totalProfitLoss,
    totalReturnRate,
    valuedCount: valuedRows.length,
    noPriceCount,
    incompletePrices,
  }
}
