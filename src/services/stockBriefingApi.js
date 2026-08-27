/**
 * stockBriefingApi.js — 종목 브리핑 API (서버 경유) + 클라이언트 캐시
 */

import { apiFetch } from './apiClient.js'

/** 브리핑 client cache TTL */
export const BRIEFING_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000

/** @type {Map<string, { expiresAt: number, payload: object }>} */
const briefingCache = new Map()

export function clearBriefingClientCache() {
  briefingCache.clear()
}

/**
 * @param {string} symbol
 */
export function peekBriefingCache(symbol) {
  const code = String(symbol || '')
    .trim()
    .replace(/^A/i, '')
  const hit = briefingCache.get(code)
  if (!hit) return null
  return {
    payload: hit.payload,
    fresh: hit.expiresAt > Date.now(),
    stale: hit.expiresAt <= Date.now(),
  }
}

/**
 * @param {string} symbol
 * @param {{
 *   name?: string,
 *   holdings?: Array<Record<string, unknown>>,
 *   fetchImpl?: typeof fetch,
 *   forceRefresh?: boolean,
 * }} [options]
 */
export async function fetchStockBriefing(symbol, options = {}) {
  const code = String(symbol || '')
    .trim()
    .replace(/^A/i, '')
  if (!options.forceRefresh) {
    const hit = briefingCache.get(code)
    if (hit && hit.expiresAt > Date.now()) {
      return { ...hit.payload, cached: true }
    }
  }

  const params = new URLSearchParams()
  if (options.name) params.set('name', String(options.name).slice(0, 80))
  if (Array.isArray(options.holdings) && options.holdings.length > 0) {
    params.set('holdings', JSON.stringify(options.holdings.slice(0, 8)))
  }
  const qs = params.toString()
  const url = `/api/stocks/${encodeURIComponent(code)}/briefing${qs ? `?${qs}` : ''}`
  const fetchImpl = options.fetchImpl ?? apiFetch

  let response
  try {
    response = await fetchImpl(url)
  } catch (error) {
    const stale = briefingCache.get(code)
    if (stale) return { ...stale.payload, cached: true, stale: true }
    throw error
  }

  if (!response.ok) {
    const stale = briefingCache.get(code)
    if (stale) return { ...stale.payload, cached: true, stale: true }
    const err = new Error('Stock briefing failed')
    err.status = response.status
    throw err
  }

  const payload = await response.json()
  briefingCache.set(code, {
    expiresAt: Date.now() + BRIEFING_CLIENT_CACHE_TTL_MS,
    payload,
  })
  return payload
}

/**
 * @param {Array<{ symbol: string, name?: string }>} holdings
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function fetchAttentionSummary(holdings, options = {}) {
  const fetchImpl = options.fetchImpl ?? apiFetch
  try {
    const response = await fetchImpl('/api/stocks/attention-summary', {
      method: 'POST',
      body: JSON.stringify({
        holdings: (holdings || []).slice(0, 20).map((row) => ({
          symbol: row.symbol,
          name: row.name,
        })),
      }),
    })
    if (!response.ok) return { ok: true, items: [] }
    return response.json()
  } catch {
    return { ok: true, items: [] }
  }
}
