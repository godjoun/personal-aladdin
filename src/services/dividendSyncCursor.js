/**
 * dividendSyncCursor.js — 배당 증분 동기화 커서 (localStorage)
 */

const STORAGE_KEY = 'aladdin.dividendSyncCursor'
export const DIVIDEND_INITIAL_FROM = '2026-08-01'
export const DIVIDEND_OVERLAP_DAYS = 3

/**
 * @param {Date} [now]
 * @param {number} daysAgo
 */
export function formatYmdDaysAgo(now = new Date(), daysAgo = 0) {
  const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param {Storage} [storage]
 * @returns {{ lastSuccessYmd: string | null }}
 */
export function readDividendSyncCursor(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY)
    if (!raw) return { lastSuccessYmd: null }
    const parsed = JSON.parse(raw)
    const ymd = String(parsed?.lastSuccessYmd || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { lastSuccessYmd: null }
    return { lastSuccessYmd: ymd }
  } catch {
    return { lastSuccessYmd: null }
  }
}

/**
 * @param {string} ymd
 * @param {Storage} [storage]
 */
export function writeDividendSyncCursor(ymd, storage = globalThis.localStorage) {
  const value = String(ymd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
  try {
    storage?.setItem?.(
      STORAGE_KEY,
      JSON.stringify({
        lastSuccessYmd: value,
        updatedAt: new Date().toISOString(),
      }),
    )
  } catch {
    // ignore quota
  }
}

/**
 * 증분 from 날짜 (최초는 INITIAL, 이후는 lastSuccess − overlap)
 * @param {{ now?: Date, storage?: Storage, overlapDays?: number }} [options]
 */
export function resolveDividendSyncFrom(options = {}) {
  const overlap = options.overlapDays ?? DIVIDEND_OVERLAP_DAYS
  const cursor = readDividendSyncCursor(options.storage)
  if (!cursor.lastSuccessYmd) {
    return {
      from: DIVIDEND_INITIAL_FROM,
      mode: 'full',
    }
  }

  const last = new Date(`${cursor.lastSuccessYmd}T00:00:00`)
  if (!Number.isFinite(last.getTime())) {
    return { from: DIVIDEND_INITIAL_FROM, mode: 'full' }
  }

  const from = formatYmdDaysAgo(last, overlap)
  // INITIAL 보다 더 과거로 가지 않음
  const resolved = from < DIVIDEND_INITIAL_FROM ? DIVIDEND_INITIAL_FROM : from
  return { from: resolved, mode: 'incremental' }
}
