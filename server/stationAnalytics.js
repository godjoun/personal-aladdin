/**
 * stationAnalytics.js — 스테이션(기관)별 리스크·회계 분석 (Phase 3 축소판)
 * 업로드된 vault·스냅샷으로 블랙록식 기관 분석을 호스트 admin 에 제공합니다.
 */

import {
  buildAllocationTimeSeries,
  calculateRollingVolatility,
  calculateSharpeRatio,
  getSnapshotsInWindow,
} from '../src/utils/portfolioAnalytics.js'
import { calculateMaxDrawdown } from '../src/utils/snapshotAnalytics.js'

function sortSnapshotsAsc(snapshots) {
  return [...(snapshots ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

function getLatestSnapshot(snapshots) {
  const sorted = sortSnapshotsAsc(snapshots)
  return sorted[sorted.length - 1] ?? null
}

function calculatePeriodReturn(snapshots, windowDays) {
  const window = getSnapshotsInWindow(snapshots, windowDays)

  if (window.length < 2) {
    return null
  }

  const first = window[0].totalValuedAmount
  const last = window[window.length - 1].totalValuedAmount

  if (first <= 0) {
    return null
  }

  return {
    periodReturnPercent: ((last - first) / first) * 100,
    startDate: window[0].date,
    endDate: window[window.length - 1].date,
    startValue: first,
    endValue: last,
    sampleDays: window.length,
  }
}

function calculateConcentration(positions = []) {
  const sorted = [...positions].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))

  return {
    top1Weight: sorted[0]?.weight ?? 0,
    top3Weight: sorted.slice(0, 3).reduce((sum, row) => sum + (row.weight ?? 0), 0),
    topHoldings: sorted.slice(0, 5).map((row) => ({
      symbol: row.symbol,
      name: row.name,
      weight: row.weight ?? 0,
      holdingValue: row.holdingValue ?? 0,
      profitLoss: row.profitLoss ?? null,
    })),
  }
}

function calculatePositionProfitLeaders(positions = []) {
  const rows = positions.filter((row) => row.profitLoss != null)

  if (rows.length === 0) {
    return []
  }

  const totalProfit = rows.reduce((sum, row) => sum + row.profitLoss, 0)

  return rows
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      profitLoss: row.profitLoss,
      profitRate: row.profitRate ?? null,
      weight: row.weight ?? 0,
      contributionPercent: totalProfit !== 0 ? (row.profitLoss / totalProfit) * 100 : 0,
    }))
    .sort((a, b) => Math.abs(b.profitLoss) - Math.abs(a.profitLoss))
    .slice(0, 5)
}

function summarizeTrades(trades = []) {
  const buyCount = trades.filter((trade) => trade.side === 'buy').length
  const sellCount = trades.filter((trade) => trade.side === 'sell').length

  return {
    totalTrades: trades.length,
    buyCount,
    sellCount,
    lastTradeAt:
      trades.length > 0
        ? [...trades].sort(
            (a, b) => new Date(b.tradedAt).getTime() - new Date(a.tradedAt).getTime(),
          )[0].tradedAt
        : null,
  }
}

/**
 * @param {Object|null} payload - station latestPayload
 * @param {{ windowDays?: number }} [options]
 */
export function buildStationAnalytics(payload, { windowDays = 30 } = {}) {
  const snapshots = payload?.snapshots ?? []
  const latest = getLatestSnapshot(snapshots)
  const positions = latest?.positions ?? []

  const rollingVol = calculateRollingVolatility(snapshots, windowDays)
  const sharpe = calculateSharpeRatio(snapshots, windowDays)
  const mdd = calculateMaxDrawdown(snapshots)
  const periodReturn = calculatePeriodReturn(snapshots, windowDays)
  const allocationSeries = buildAllocationTimeSeries(snapshots, windowDays)
  const concentration = calculateConcentration(positions)
  const profitLeaders = calculatePositionProfitLeaders(positions)
  const trades = summarizeTrades(payload?.trades ?? [])

  const aumSeries = getSnapshotsInWindow(snapshots, windowDays).map((snapshot) => ({
    date: snapshot.date,
    totalValuedAmount: snapshot.totalValuedAmount,
    totalReturnRate: snapshot.totalReturnRate ?? null,
  }))

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    snapshotCount: snapshots.length,
    uniqueSnapshotDays: new Set(snapshots.map((snapshot) => snapshot.date)).size,
    accounting: {
      asOfDate: latest?.date ?? null,
      totalInvested: latest?.totalInvested ?? null,
      totalValuedAmount: latest?.totalValuedAmount ?? null,
      totalProfitLoss: latest?.totalProfitLoss ?? null,
      totalReturnRate: latest?.totalReturnRate ?? null,
      assetCount: latest?.assetCount ?? payload?.assets?.length ?? 0,
      valuedCount: latest?.valuedCount ?? 0,
    },
    performance: {
      periodReturn,
      mdd,
    },
    risk: {
      annualizedVolPercent: rollingVol?.annualizedVolPercent ?? null,
      sharpeRatio: sharpe?.sharpeRatio ?? null,
      sampleDays: rollingVol?.sampleDays ?? 0,
      worstScenarioName: latest?.risk?.worstScenarioName ?? null,
      expectedLossRate: latest?.risk?.expectedLossRate ?? null,
      expectedLossAmount: latest?.risk?.expectedLossAmount ?? null,
      maxWeightDeviation: latest?.risk?.maxWeightDeviation ?? null,
      rebalanceReviewCount: latest?.risk?.rebalanceReviewCount ?? 0,
      concentration,
    },
    profitLeaders,
    trades,
    charts: {
      allocationSeries,
      aumSeries,
    },
  }
}

/**
 * Host Intelligence Report 표용 요약
 */
export function buildStationRiskSummary(payload, windowDays = 30) {
  const analytics = buildStationAnalytics(payload, { windowDays })

  return {
    snapshotCount: analytics.snapshotCount,
    mddPercent: analytics.performance.mdd.mddPercent,
    annualizedVolPercent: analytics.risk.annualizedVolPercent,
    sharpeRatio: analytics.risk.sharpeRatio,
    periodReturnPercent: analytics.performance.periodReturn?.periodReturnPercent ?? null,
    expectedLossRate: analytics.risk.expectedLossRate,
    expectedLossAmount: analytics.risk.expectedLossAmount,
    worstScenarioName: analytics.risk.worstScenarioName,
    top1Weight: analytics.risk.concentration.top1Weight,
    rebalanceReviewCount: analytics.risk.rebalanceReviewCount,
  }
}
