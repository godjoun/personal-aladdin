/**
 * manualPersistence.js — 수동 자산/거래 SQLite hydrate
 *
 * A. 서버 있음 + local 비어 있음 → 서버 → local 복원
 * B. local 있음 + 서버 비어 있음 → local → 서버 1회 병합 저장
 * C. 양쪽 있음 → ID 기준 병합(기존 기록 덮어쓰기/삭제 없음)
 *
 * Kiwoom 잔고는 대상 아님.
 */

import { getAssets, saveAssets } from './assetStorage.js'
import { getTrades, saveTrades } from './tradeStorage.js'
import { mergeByIdPreferLocal } from '../utils/manualMerge.js'
import { apiFetch } from './apiClient.js'

/**
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchServerManualAssets(fetchImpl = apiFetch) {
  const response = await fetchImpl('/api/manual/assets')
  if (!response.ok) throw new Error('Failed to load server manual assets')
  const payload = await response.json()
  return Array.isArray(payload.assets) ? payload.assets : []
}

/**
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchServerManualTrades(fetchImpl = apiFetch) {
  const response = await fetchImpl('/api/manual/trades')
  if (!response.ok) throw new Error('Failed to load server manual trades')
  const payload = await response.json()
  return Array.isArray(payload.trades) ? payload.trades : []
}

/**
 * 서버에 없는 ID만 추가 (덮어쓰기·전체 교체 없음)
 *
 * @param {{ assets?: Array<object>, trades?: Array<object> }} payload
 * @param {typeof fetch} [fetchImpl]
 */
export async function mergeManualLedgerToServer(
  payload,
  fetchImpl = apiFetch,
) {
  const response = await fetchImpl('/api/manual/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assets: Array.isArray(payload.assets) ? payload.assets : [],
      trades: Array.isArray(payload.trades) ? payload.trades : [],
    }),
  })
  if (!response.ok) throw new Error('Failed to merge manual ledger')
  return response.json()
}

/**
 * 앱 시작 hydrate. 반복 호출해도 중복 insert/덮어쓰기 없음.
 *
 * @param {typeof fetch} [fetchImpl]
 */
export async function hydrateManualLedgerFromServer(fetchImpl = apiFetch) {
  try {
    const [serverAssets, serverTrades] = await Promise.all([
      fetchServerManualAssets(fetchImpl),
      fetchServerManualTrades(fetchImpl),
    ])

    const localAssets = getAssets()
    const localTrades = getTrades()

    const assetMerge = mergeByIdPreferLocal(localAssets, serverAssets)
    const tradeMerge = mergeByIdPreferLocal(localTrades, serverTrades)

    const assetsChanged =
      assetMerge.merged.length !== localAssets.length ||
      assetMerge.addedFromServer > 0
    const tradesChanged =
      tradeMerge.merged.length !== localTrades.length ||
      tradeMerge.addedFromServer > 0

    if (assetsChanged) {
      saveAssets(assetMerge.merged)
    }
    if (tradesChanged) {
      saveTrades(tradeMerge.merged)
    }

    // B/C: local-only → 서버에 없는 ID만 추가
    let serverMerge = { assets: { inserted: 0 }, trades: { inserted: 0 } }
    if (assetMerge.localOnly > 0 || tradeMerge.localOnly > 0) {
      serverMerge = await mergeManualLedgerToServer(
        {
          assets: assetMerge.merged,
          trades: tradeMerge.merged,
        },
        fetchImpl,
      )
    } else if (
      localAssets.length === 0 &&
      localTrades.length === 0 &&
      (serverAssets.length > 0 || serverTrades.length > 0)
    ) {
      // A: 복원만 — 서버 push 불필요
      serverMerge = { assets: { inserted: 0 }, trades: { inserted: 0 }, restored: true }
    }

    return {
      ok: true,
      assets: assetMerge.merged,
      trades: tradeMerge.merged,
      restoredAssets: assetMerge.addedFromServer,
      restoredTrades: tradeMerge.addedFromServer,
      uploadedAssets: serverMerge?.assets?.inserted ?? 0,
      uploadedTrades: serverMerge?.trades?.inserted ?? 0,
      changed: assetsChanged || tradesChanged,
    }
  } catch (error) {
    console.warn('[manualPersistence] hydrate 실패, local 유지:', error.message)
    return {
      ok: false,
      assets: getAssets(),
      trades: getTrades(),
      restoredAssets: 0,
      restoredTrades: 0,
      uploadedAssets: 0,
      uploadedTrades: 0,
      changed: false,
    }
  }
}
