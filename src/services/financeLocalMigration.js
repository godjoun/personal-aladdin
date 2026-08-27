/**
 * financeLocalMigration.js — legacy 금융 localStorage → SQLite 안전 이관
 *
 * 성공(서버 merge + read-back 검증) 후에만 LS 키 삭제.
 * 실패 시 LS 원본 유지.
 */

import { mergeByIdPreferLocal } from '../utils/manualMerge.js'
import {
  FINANCE_LS_KEYS,
  hasLegacyLocalKey,
  listRemainingFinanceLocalKeys,
  peekLegacyLocalArray,
  removeLegacyLocalKeys,
} from './memoryFinanceStore.js'
import { saveAssets } from './assetStorage.js'
import { saveTrades } from './tradeStorage.js'
import { saveDividendEvents } from './dividendStorage.js'
import { saveMarketPrices } from './storage.js'
import { savePortfolioSnapshots } from './snapshotStorage.js'
import {
  fetchServerManualAssets,
  fetchServerManualTrades,
  mergeManualLedgerToServer,
} from './manualPersistence.js'
import {
  fetchServerDividends,
  migrateLocalDividendsToServer,
} from './dividendPersistence.js'
import { apiFetch } from './apiClient.js'

function idsOf(items) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => item?.id || item?.sourceKey)
      .filter(Boolean)
      .map(String),
  )
}

/**
 * 서버 목록이 legacy 모든 ID를 포함하는지 확인
 * @param {Array<object>} legacy
 * @param {Array<object>} server
 */
export function serverContainsAllIds(legacy, server) {
  const serverIds = idsOf(server)
  for (const item of legacy) {
    const id = item?.id || item?.sourceKey
    if (!id) continue
    if (!serverIds.has(String(id))) return false
  }
  return true
}

/**
 * @param {typeof fetch} [fetchImpl]
 */
export async function migrateLegacyFinanceFromLocalStorage(
  fetchImpl = apiFetch,
) {
  const legacyAssets = peekLegacyLocalArray(FINANCE_LS_KEYS.assets)
  const legacyTrades = peekLegacyLocalArray(FINANCE_LS_KEYS.trades)
  const legacyDividends = peekLegacyLocalArray(FINANCE_LS_KEYS.dividends)
  const legacyPrices = peekLegacyLocalArray(FINANCE_LS_KEYS.marketPrices)
  const legacySnapshots = peekLegacyLocalArray(FINANCE_LS_KEYS.snapshots)

  const hadLedgerLs =
    hasLegacyLocalKey(FINANCE_LS_KEYS.assets) ||
    hasLegacyLocalKey(FINANCE_LS_KEYS.trades) ||
    hasLegacyLocalKey(FINANCE_LS_KEYS.dividends)

  const keysToClear = []

  try {
    // ── assets / trades ─────────────────────────────────
    const [serverAssets, serverTrades] = await Promise.all([
      fetchServerManualAssets(fetchImpl),
      fetchServerManualTrades(fetchImpl),
    ])

    const assetMerge = mergeByIdPreferLocal(legacyAssets, serverAssets)
    const tradeMerge = mergeByIdPreferLocal(legacyTrades, serverTrades)

    if (assetMerge.localOnly > 0 || tradeMerge.localOnly > 0) {
      await mergeManualLedgerToServer(
        { assets: assetMerge.merged, trades: tradeMerge.merged },
        fetchImpl,
      )
    }

    const [verifiedAssets, verifiedTrades] = await Promise.all([
      fetchServerManualAssets(fetchImpl),
      fetchServerManualTrades(fetchImpl),
    ])

    if (
      !serverContainsAllIds(legacyAssets, verifiedAssets) ||
      !serverContainsAllIds(legacyTrades, verifiedTrades)
    ) {
      throw new Error('Manual ledger read-back verification failed')
    }

    saveAssets(verifiedAssets)
    saveTrades(verifiedTrades)

    if (
      hasLegacyLocalKey(FINANCE_LS_KEYS.assets) ||
      hasLegacyLocalKey(FINANCE_LS_KEYS.trades)
    ) {
      keysToClear.push(FINANCE_LS_KEYS.assets, FINANCE_LS_KEYS.trades)
    }

    // ── dividends ───────────────────────────────────────
    let dividendPayload = await fetchServerDividends(fetchImpl)
    if (!dividendPayload.migrated && legacyDividends.length > 0) {
      // migrate-local expects getDividendEvents — temporarily put legacy in memory
      saveDividendEvents(legacyDividends)
      dividendPayload = await migrateLocalDividendsToServer(fetchImpl)
    } else if (legacyDividends.length > 0) {
      // already migrated flag: still merge legacy via POST upsert
      const response = await fetchImpl('/api/dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: legacyDividends }),
      })
      if (!response.ok) throw new Error('Dividend upsert failed')
      dividendPayload = await fetchServerDividends(fetchImpl)
    }

    const serverEvents = Array.isArray(dividendPayload.events)
      ? dividendPayload.events
      : []

    if (!serverContainsAllIds(legacyDividends, serverEvents)) {
      throw new Error('Dividend read-back verification failed')
    }

    saveDividendEvents(serverEvents)
    if (hasLegacyLocalKey(FINANCE_LS_KEYS.dividends)) {
      keysToClear.push(FINANCE_LS_KEYS.dividends)
    }

    // ── prices / snapshots (서버 SoT 없음 → 메모리 이관 후 LS 삭제) ──
    if (legacyPrices.length > 0) {
      saveMarketPrices(legacyPrices)
    }
    if (hasLegacyLocalKey(FINANCE_LS_KEYS.marketPrices)) {
      keysToClear.push(FINANCE_LS_KEYS.marketPrices)
    }

    if (legacySnapshots.length > 0) {
      savePortfolioSnapshots(legacySnapshots)
    }
    if (hasLegacyLocalKey(FINANCE_LS_KEYS.snapshots)) {
      keysToClear.push(FINANCE_LS_KEYS.snapshots)
    }

    removeLegacyLocalKeys([...new Set(keysToClear)])

    return {
      ok: true,
      clearedKeys: [...new Set(keysToClear)],
      remainingFinanceKeys: listRemainingFinanceLocalKeys(),
      assets: verifiedAssets.length,
      trades: verifiedTrades.length,
      dividends: serverEvents.length,
      hadLedgerLs,
    }
  } catch (error) {
    console.warn(
      '[financeLocalMigration] 이관 실패 — localStorage 원본 유지:',
      error.message,
    )
    // 실패 시: 세션용으로 legacy를 메모리에만 올리고 LS는 유지
    if (legacyAssets.length > 0) saveAssets(legacyAssets)
    if (legacyTrades.length > 0) saveTrades(legacyTrades)
    if (legacyDividends.length > 0) saveDividendEvents(legacyDividends)
    if (legacyPrices.length > 0) saveMarketPrices(legacyPrices)
    if (legacySnapshots.length > 0) savePortfolioSnapshots(legacySnapshots)

    return {
      ok: false,
      error: error.message,
      clearedKeys: [],
      remainingFinanceKeys: listRemainingFinanceLocalKeys(),
      hadLedgerLs,
    }
  }
}
