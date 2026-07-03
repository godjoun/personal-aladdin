/**
 * tradeService.js — 거래 기록 + 자산 동기화
 */

import { addAsset, deleteAsset, getAssets, saveAssets } from './assetStorage.js'
import {
  addTrade,
  deleteTradesByAssetId,
  getTrades,
  getTradesByAssetId,
  hasTradesForAsset,
} from './tradeStorage.js'
import { computePositionFromTrades } from '../utils/positionEngine.js'

/**
 * 거래 원장 기준으로 자산 1건의 수량·평균매수가를 갱신합니다.
 */
export function syncAssetFromTrades(assetId) {
  const assets = getAssets()
  const index = assets.findIndex((asset) => asset.id === assetId)

  if (index < 0) {
    return { synced: false, reason: 'asset_not_found' }
  }

  const trades = getTradesByAssetId(assetId)
  const position = computePositionFromTrades(trades)

  if (position.error === 'insufficient_quantity') {
    return { synced: false, reason: 'insufficient_quantity' }
  }

  if (position.quantity <= 0) {
    deleteTradesByAssetId(assetId)
    deleteAsset(assetId)
    return { synced: true, removed: true }
  }

  assets[index] = {
    ...assets[index],
    quantity: position.quantity,
    averageBuyPrice: position.averageBuyPrice,
  }

  saveAssets(assets)

  return { synced: true, asset: assets[index] }
}

/**
 * 매수·매도 거래를 기록하고 자산을 동기화합니다.
 */
export function recordTrade({ assetId, side, quantity, price, memo = '' }) {
  const assets = getAssets()
  const asset = assets.find((item) => item.id === assetId)

  if (!asset) {
    return { success: false, reason: 'asset_not_found' }
  }

  const qty = Number(quantity)
  const tradePrice = Number(price)

  if (!Number.isFinite(qty) || qty <= 0) {
    return { success: false, reason: 'invalid_quantity' }
  }

  if (!Number.isFinite(tradePrice) || tradePrice < 0) {
    return { success: false, reason: 'invalid_price' }
  }

  if (side === 'sell') {
    const current = computePositionFromTrades(getTradesByAssetId(assetId))

    if (qty > current.quantity) {
      return { success: false, reason: 'insufficient_quantity' }
    }
  }

  const trade = addTrade({
    assetId,
    symbol: asset.symbol,
    name: asset.name,
    assetType: asset.assetType,
    side,
    quantity: qty,
    price: tradePrice,
    memo: memo.trim(),
  })

  const syncResult = syncAssetFromTrades(assetId)

  return { success: true, trade, ...syncResult }
}

/**
 * 신규 자산 등록 + 최초 매수 거래 1건 기록
 */
export function addAssetWithInitialTrade(assetData) {
  const newAsset = addAsset(assetData)

  const trade = addTrade({
    assetId: newAsset.id,
    symbol: newAsset.symbol,
    name: newAsset.name,
    assetType: newAsset.assetType,
    side: 'buy',
    quantity: newAsset.quantity,
    price: newAsset.averageBuyPrice,
    memo: newAsset.memo ? `최초 등록 — ${newAsset.memo}` : '최초 등록',
  })

  return { asset: newAsset, trade }
}

/**
 * 자산 삭제 시 연결된 거래 원장도 함께 삭제
 */
export function removeAssetWithTrades(assetId) {
  deleteTradesByAssetId(assetId)
  return deleteAsset(assetId)
}

/**
 * 기존 자산(거래 없음)을 거래 원장으로 마이그레이션
 */
export function migrateLegacyAssetsToTrades() {
  const assets = getAssets()
  let migrated = 0

  for (const asset of assets) {
    if (hasTradesForAsset(asset.id)) {
      continue
    }

    addTrade({
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      assetType: asset.assetType,
      side: 'buy',
      quantity: asset.quantity,
      price: asset.averageBuyPrice,
      memo: '기존 보유 자산 마이그레이션',
      tradedAt: asset.createdAt || new Date().toISOString(),
    })

    migrated += 1
  }

  return migrated
}

export { getTrades, getTradesByAssetId }
