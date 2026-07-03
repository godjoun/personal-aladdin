/**
 * utils/ 폴더 — 진입점(index)
 * ─────────────────────────────────────────────────────────
 * utils 폴더의 함수들을 한곳에서 export 합니다.
 */

export {
  getLatestPriceBySymbol,
  getPriceHistoryBySymbol,
  calculateHoldingValue,
  calculateProfitLoss,
  calculateProfitRate,
  calculateAssetClassAllocation,
} from './calculator.js'

export {
  DEFAULT_ASSET_SHOCKS,
  CRISIS_SCENARIOS,
  calculateScenarioLossRate,
  simulateCrisisScenarios,
} from './riskEngine.js'

export {
  DEFAULT_TARGET_ALLOCATION,
  REBALANCE_THRESHOLD,
  calculateWeightDifference,
  needsRebalanceReview,
  analyzeRebalancing,
  networkAllocationToTargets,
  getTargetWeightSum,
} from './rebalanceEngine.js'

export { buildAssetRows, calculatePortfolioSummary } from './portfolioRows.js'

export {
  formatSnapshotDate,
  calculateMaxDrawdown,
  enrichSnapshotsWithDailyChange,
} from './snapshotAnalytics.js'

export {
  buildAllocationTimeSeries,
  calculateProfitContributions,
  calculatePeriodValueContributions,
  calculateRollingVolatility,
  calculateSharpeRatio,
} from './portfolioAnalytics.js'

export { computePositionFromTrades } from './positionEngine.js'
