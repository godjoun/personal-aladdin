/**
 * snapshotBuilder.js — 포트폴리오 스냅샷 생성
 * ─────────────────────────────────────────────────────────
 * Positions(보유) + Marks(시세) + Analytics(리스크) 를
 * 하루 단위 원장 레코드로 묶습니다.
 */

import { calculateAssetClassAllocation } from '../utils/calculator.js'
import {
  buildAssetRows,
  calculatePortfolioSummary,
} from '../utils/portfolioRows.js'
import { simulateCrisisScenarios } from '../utils/riskEngine.js'
import { analyzeRebalancing } from '../utils/rebalanceEngine.js'
import { upsertPortfolioSnapshot } from './snapshotStorage.js'

/**
 * 오늘 날짜 YYYYMMDD (로컬 시간)
 */
export function getTodayDateKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function getMaxWeightDeviation(rebalance) {
  if (!rebalance.items.length) return 0
  return Math.max(...rebalance.items.map((item) => Math.abs(item.difference)))
}

/**
 * 현재 assets + prices 로 오늘 스냅샷 객체를 만듭니다.
 *
 * @param {Array<Object>} assets
 * @param {Array<Object>} prices
 * @param {string} [dateKey] - YYYYMMDD, 기본값 오늘
 * @returns {Object|null} 평가 가능한 자산이 없으면 null
 */
export function buildPortfolioSnapshot(assets, prices, dateKey = getTodayDateKey()) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return null
  }

  const rows = buildAssetRows(assets, prices)
  const summary = calculatePortfolioSummary(rows)
  const allocation = calculateAssetClassAllocation(rows)

  if (allocation.totalValuedAmount <= 0) {
    return null
  }

  const crisisSimulation = simulateCrisisScenarios(allocation)
  const rebalanceCheck = analyzeRebalancing(allocation)
  const worstScenario = crisisSimulation.scenarios.find(
    (s) => s.id === crisisSimulation.worstScenarioId,
  )

  const valuedRows = rows.filter((row) => row.hasPrice)

  const positions = valuedRows.map((row) => ({
    assetId: row.id,
    symbol: row.symbol,
    name: row.name,
    assetType: row.assetType,
    quantity: row.quantity,
    averageBuyPrice: row.averageBuyPrice,
    markPrice: row.latestPrice,
    priceDate: row.priceDate,
    holdingValue: row.holdingValue,
    profitLoss: row.profitLoss,
    profitRate: row.profitRate,
    weight:
      allocation.totalValuedAmount > 0
        ? (row.holdingValue / allocation.totalValuedAmount) * 100
        : 0,
  }))

  return {
    date: dateKey,
    recordedAt: new Date().toISOString(),
    totalInvested: summary.totalInvested,
    totalValuedAmount: summary.totalHoldingValue,
    totalProfitLoss: summary.totalProfitLoss,
    totalReturnRate: summary.totalReturnRate,
    assetCount: assets.length,
    valuedCount: summary.valuedCount,
    allocation: allocation.groups.map((group) => ({
      assetClass: group.assetClass,
      totalValue: group.totalValue,
      weight: group.weight,
      assetCount: group.assetCount,
    })),
    positions,
    risk: {
      worstScenarioId: worstScenario?.id ?? null,
      worstScenarioName: worstScenario?.name ?? null,
      expectedLossRate: worstScenario?.expectedLossRate ?? null,
      expectedLossAmount: worstScenario?.expectedLossAmount ?? null,
      maxWeightDeviation: getMaxWeightDeviation(rebalanceCheck),
      rebalanceReviewCount: rebalanceCheck.reviewCount,
    },
  }
}

/**
 * 스냅샷을 생성하고 localStorage 에 저장합니다.
 */
export function recordPortfolioSnapshot(assets, prices, dateKey) {
  const snapshot = buildPortfolioSnapshot(assets, prices, dateKey)

  if (!snapshot) {
    return { recorded: false, reason: 'no_valued_assets' }
  }

  const result = upsertPortfolioSnapshot(snapshot)

  return { recorded: true, ...result }
}
