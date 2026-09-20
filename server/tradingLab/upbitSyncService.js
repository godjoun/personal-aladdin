/** REST reconciliation: closed orders -> detail trades -> idempotent persistence. */

import { getDb } from '../db.js'
import {
  extractUpbitOrderExecutions,
  hasExecutedUpbitVolume,
  normalizeUpbitOrder,
} from './upbitNormalize.js'
import {
  getUpbitSyncState,
  listUpbitExecutions,
  replaceUpbitEpisodes,
  setUpbitSyncState,
  upsertUpbitExecution,
  upsertUpbitOrder,
} from './upbitRepository.js'
import { buildUpbitTradeEpisodes } from './upbitEpisodeService.js'
import { splitUpbitWindows, UPBIT_CLOSED_ORDER_LIMIT } from './upbitClient.js'

const DEFAULT_FIRST_SYNC_MS = 7 * 24 * 60 * 60 * 1000
const MIN_OVERFLOW_WINDOW_MS = 60 * 1000

async function fetchWindowSafely(client, window) {
  const rows = await client.listClosedOrders(window)
  if (!Array.isArray(rows)) return []
  if (rows.length < UPBIT_CLOSED_ORDER_LIMIT) return rows
  const width = window.endMs - window.startMs
  if (width <= MIN_OVERFLOW_WINDOW_MS) {
    const error = new Error('Upbit closed-order window remains saturated')
    error.code = 'WINDOW_OVERFLOW'
    throw error
  }
  const middle = window.startMs + Math.floor(width / 2)
  const [left, right] = await Promise.all([
    fetchWindowSafely(client, { startMs: window.startMs, endMs: middle }),
    fetchWindowSafely(client, { startMs: middle, endMs: window.endMs }),
  ])
  const unique = new Map()
  for (const row of [...left, ...right]) {
    if (row?.uuid) unique.set(row.uuid, row)
  }
  return [...unique.values()]
}

export async function reconcileUpbitOrders(options) {
  const db = options.db || getDb()
  const nowMs = options.nowMs ?? Date.now()
  const previousSync = getUpbitSyncState('lastSyncAt', db)
  const parsedPrevious = previousSync ? Date.parse(previousSync) : NaN
  const startMs = options.startMs ?? (
    Number.isFinite(parsedPrevious) ? Math.max(0, parsedPrevious - 5 * 60 * 1000) : nowMs - DEFAULT_FIRST_SYNC_MS
  )
  const endMs = options.endMs ?? nowMs
  const windows = splitUpbitWindows(startMs, endMs)
  const orders = new Map()
  for (const window of windows) {
    const rows = await fetchWindowSafely(options.client, window)
    for (const raw of rows) if (raw?.uuid) orders.set(raw.uuid, raw)
  }

  let executionCount = 0
  for (const rawSummary of orders.values()) {
    const detail = await options.client.getOrder(rawSummary.uuid)
    const raw = detail && typeof detail === 'object' ? detail : rawSummary
    const nowIso = new Date(nowMs).toISOString()
    const order = normalizeUpbitOrder(raw, nowIso) || normalizeUpbitOrder(rawSummary, nowIso)
    if (!order) continue
    upsertUpbitOrder(order, db)
    if (!hasExecutedUpbitVolume(order)) continue
    for (const execution of extractUpbitOrderExecutions(raw, order, nowIso)) {
      executionCount += upsertUpbitExecution(execution, db) ? 1 : 0
    }
  }
  const episodes = buildUpbitTradeEpisodes(listUpbitExecutions(db), {
    nowIso: new Date(nowMs).toISOString(),
  })
  replaceUpbitEpisodes(episodes, db)
  const lastSyncAt = new Date(nowMs).toISOString()
  setUpbitSyncState('lastSyncAt', lastSyncAt, db)
  return { orderCount: orders.size, executionCount, episodeCount: episodes.length, lastSyncAt }
}

export { fetchWindowSafely }
