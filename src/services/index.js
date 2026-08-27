/**
 * services/ 폴더 — 진입점(index)
 */

export {
  getMarketPrices,
  saveMarketPrices,
  upsertMarketPrices,
  clearMarketPrices,
  parseMarketPricesFromApi,
} from './storage.js'

export { getAssets, saveAssets, addAsset, deleteAsset } from './assetStorage.js'

export { fetchPricesForAssets } from './marketSync.js'

export {
  fetchKiwoomBalances,
  flattenKiwoomBalanceHoldings,
} from './kiwoomApi.js'

export {
  fetchKiwoomDividendPayments,
  syncKiwoomDividends,
  upsertKiwoomDividendEvents,
} from './kiwoomDividendSync.js'

export { lookupSymbolsByName } from './symbolLookup.js'

export {
  getPortfolioSnapshots,
  upsertPortfolioSnapshot,
  getSnapshotByDate,
  clearPortfolioSnapshots,
} from './snapshotStorage.js'

export {
  buildPortfolioSnapshot,
  recordPortfolioSnapshot,
  getTodayDateKey,
} from './snapshotBuilder.js'

export {
  getTrades,
  addTrade,
  getTradesByAssetId,
  deleteTradesByAssetId,
} from './tradeStorage.js'

export {
  getDividendEvents,
  saveDividendEvents,
  addDividendEvent,
  updateDividendEvent,
  deleteDividendEvent,
  getDividendEventsByYear,
  getDividendEventsByMonth,
  calculateDividendAmount,
} from './dividendStorage.js'

export {
  addAssetWithInitialTrade,
  recordTrade,
  removeAssetWithTrades,
  migrateLegacyAssetsToTrades,
  syncAssetFromTrades,
} from './tradeService.js'
