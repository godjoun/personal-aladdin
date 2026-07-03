/**
 * services/ 폴더 — 진입점(index)
 * ─────────────────────────────────────────────────────────
 * services 폴더의 함수들을 한곳에서 export 합니다.
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

export { lookupSymbolsByName } from './symbolLookup.js'

export { exportLocalVault } from './dataExport.js'

export {
  registerStation,
  pushVaultToCentral,
  getStationCredentials,
  checkCentralHealth,
  getCentralAdminUrl,
} from './stationClient.js'

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
  addAssetWithInitialTrade,
  recordTrade,
  removeAssetWithTrades,
  migrateLegacyAssetsToTrades,
  syncAssetFromTrades,
} from './tradeService.js'
