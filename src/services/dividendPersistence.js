/**
 * dividendPersistence.js — 서버 SQLite ↔ 클라이언트 dividend 상태
 */

import { getDividendEvents, saveDividendEvents } from './dividendStorage.js'
import { getAssets } from './assetStorage.js'
import { getTrades } from './tradeStorage.js'
import { apiFetch } from './apiClient.js'

export {
  hydrateManualLedgerFromServer,
  mergeManualLedgerToServer,
} from './manualPersistence.js'

/**
 * 서버 배당 목록 조회
 */
export async function fetchServerDividends(fetchImpl = apiFetch) {
  const response = await fetchImpl('/api/dividends')
  if (!response.ok) {
    throw new Error('Failed to load server dividends')
  }
  return response.json()
}

/**
 * localStorage → 서버 1회 이관
 */
export async function migrateLocalDividendsToServer(fetchImpl = apiFetch) {
  const local = getDividendEvents()
  const response = await fetchImpl('/api/dividends/migrate-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: local }),
  })
  if (!response.ok) {
    throw new Error('Dividend migration failed')
  }
  return response.json()
}

/**
 * 서버 배당을 localStorage 캐시에 반영 (화면 호환)
 */
export function applyServerDividendsToLocal(events) {
  if (!Array.isArray(events)) return getDividendEvents()
  saveDividendEvents(events)
  return events
}

/**
 * 앱 시작 시: 서버 로드 + 필요 시 local migration
 */
export async function hydrateDividendsFromServer(fetchImpl = apiFetch) {
  try {
    let payload = await fetchServerDividends(fetchImpl)

    if (!payload.migrated) {
      payload = await migrateLocalDividendsToServer(fetchImpl)
    }

    const events = Array.isArray(payload.events) ? payload.events : []
    applyServerDividendsToLocal(events)
    return { ok: true, events }
  } catch (error) {
    console.warn('[dividendPersistence] 서버 hydrate 실패, local 유지:', error.message)
    return { ok: false, events: getDividendEvents() }
  }
}

/**
 * 키움/수동 이벤트를 서버에 upsert 후 local 갱신
 */
export async function persistDividendEvents(events, fetchImpl = apiFetch) {
  const response = await fetchImpl('/api/dividends', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  })
  if (!response.ok) {
    throw new Error('Failed to persist dividends')
  }
  const payload = await response.json()
  const next = Array.isArray(payload.events) ? payload.events : getDividendEvents()
  applyServerDividendsToLocal(next)
  return payload
}

/**
 * 수동 자산/거래를 서버에 백업
 */
export async function persistManualLedger(fetchImpl = apiFetch) {
  const assets = getAssets()
  const trades = getTrades()

  await Promise.all([
    fetchImpl('/api/manual/assets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets }),
    }),
    fetchImpl('/api/manual/trades', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trades }),
    }),
  ])
}
