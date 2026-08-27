/**
 * assetStorage.js — 수동 자산 (메모리 전용, SQLite가 SoT)
 */

import {
  FINANCE_LS_KEYS,
  getMemory,
  setMemory,
} from './memoryFinanceStore.js'

const MEMORY_KEY = FINANCE_LS_KEYS.assets

/**
 * @returns {Array<Object>}
 */
export function getAssets() {
  const value = getMemory(MEMORY_KEY, [])
  return Array.isArray(value) ? value : []
}

/**
 * @param {Array<Object>} assets
 */
export function saveAssets(assets) {
  if (!Array.isArray(assets)) {
    throw new Error('[assetStorage] saveAssets: assets 는 배열이어야 합니다.')
  }
  setMemory(MEMORY_KEY, assets)
}

/**
 * @param {Object} asset
 */
export function addAsset(asset) {
  const existingAssets = getAssets()
  const newAsset = {
    ...asset,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  saveAssets([...existingAssets, newAsset])
  return newAsset
}

/**
 * @param {string} id
 */
export function deleteAsset(id) {
  const updatedAssets = getAssets().filter((asset) => asset.id !== id)
  saveAssets(updatedAssets)
  return updatedAssets
}
