/**
 * stockBriefingApi.js — 종목 브리핑 API (서버 경유)
 */

import { apiFetch } from './apiClient.js'

/**
 * @param {string} symbol
 * @param {{
 *   name?: string,
 *   holdings?: Array<Record<string, unknown>>,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export async function fetchStockBriefing(symbol, options = {}) {
  const code = String(symbol || '')
    .trim()
    .replace(/^A/i, '')
  const params = new URLSearchParams()
  if (options.name) params.set('name', String(options.name).slice(0, 80))
  if (Array.isArray(options.holdings) && options.holdings.length > 0) {
    params.set('holdings', JSON.stringify(options.holdings.slice(0, 8)))
  }
  const qs = params.toString()
  const url = `/api/stocks/${encodeURIComponent(code)}/briefing${qs ? `?${qs}` : ''}`
  const fetchImpl = options.fetchImpl ?? apiFetch
  const response = await fetchImpl(url)
  if (!response.ok) {
    const error = new Error('Stock briefing failed')
    error.status = response.status
    throw error
  }
  return response.json()
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
