/**
 * utils/ 폴더 — 진입점(index)
 */

export {
  hasValidPrice,
  toNullableNumber,
  getLatestPriceBySymbol,
  getPriceHistoryBySymbol,
  calculateHoldingValue,
  calculateProfitLoss,
  calculateProfitRate,
  calculateAssetClassAllocation,
} from './calculator.js'

export {
  DEFAULT_TARGET_ALLOCATION,
  REBALANCE_THRESHOLD,
  calculateWeightDifference,
  needsRebalanceReview,
  analyzeRebalancing,
} from './rebalanceEngine.js'

export { simulateCrisisScenarios } from './riskEngine.js'

export { buildAssetRows, calculatePortfolioSummary } from './portfolioRows.js'

export {
  buildKiwoomHoldingRow,
  buildKiwoomHoldingRows,
  buildDashboardHoldingsView,
  calculateKiwoomPortfolioSummary,
} from './kiwoomDashboard.js'

export { computePositionFromTrades } from './positionEngine.js'

export {
  parseDividendPaymentDate,
  getDividendEventAmount,
  calculateMonthlyDividendSummary,
  calculateYearPaidDividend,
  getNextDividendEvent,
  getDividendStatusLabel,
  calculateLast12MonthsDividendBars,
  getRecentPaidDividends,
} from './dividendCalculator.js'

export {
  DIVIDEND_STATUSES,
  validateAndBuildDividendPayload,
  dividendEventToFormValues,
} from './dividendForm.js'
