/**
 * dataExport.js — 로컬 vault 전체보내기
 * 중앙 서버 업로드·백업용
 */

import { getAssets } from './assetStorage.js'
import { getMarketPrices } from './storage.js'
import { getPortfolioSnapshots } from './snapshotStorage.js'
import { getTrades } from './tradeStorage.js'

const VAULT_VERSION = 1

/**
 * localStorage 의 모든 ALADDIN 데이터를 하나의 객체로 묶습니다.
 */
export function exportLocalVault() {
  return {
    version: VAULT_VERSION,
    exportedAt: new Date().toISOString(),
    assets: getAssets(),
    trades: getTrades(),
    snapshots: getPortfolioSnapshots(),
    marketPrices: getMarketPrices(),
  }
}
