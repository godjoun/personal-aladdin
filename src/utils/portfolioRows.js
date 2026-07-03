/**
 * portfolioRows.js — 보유 자산 + 시세 매칭 행 데이터
 * 블랙록 ALADDIN 의 Positions + Marks 레이어에 해당합니다.
 */

import {
  calculateHoldingValue,
  calculateProfitLoss,
  calculateProfitRate,
  getLatestPriceBySymbol,
} from './calculator.js'

/**
 * 자산 1건 + 시세 매칭 + 계산 결과
 */
export function buildAssetRows(assets, prices) {
  return assets.map((asset) => {
    const latest = getLatestPriceBySymbol(prices, asset.symbol)
    const latestPrice =
      latest && Number(latest.closePrice) > 0
        ? Number(latest.closePrice)
        : null

    const hasPrice = latestPrice !== null
    const invested = asset.quantity * asset.averageBuyPrice

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
      invested,
      holdingValue,
      profitLoss,
      profitRate,
    }
  })
}

/**
 * 포트폴리오 합계
 */
export function calculatePortfolioSummary(rows) {
  const totalInvested = rows.reduce((sum, row) => sum + row.invested, 0)
  const valuedRows = rows.filter((row) => row.hasPrice)

  const totalHoldingValue = valuedRows.reduce(
    (sum, row) => sum + row.holdingValue,
    0,
  )
  const totalProfitLoss = valuedRows.reduce(
    (sum, row) => sum + row.profitLoss,
    0,
  )
  const investedWithPrice = valuedRows.reduce(
    (sum, row) => sum + row.invested,
    0,
  )

  const totalReturnRate =
    investedWithPrice > 0 ? (totalProfitLoss / investedWithPrice) * 100 : null

  return {
    totalInvested,
    totalHoldingValue,
    totalProfitLoss,
    totalReturnRate,
    valuedCount: valuedRows.length,
  }
}
