/** Upbit public quotation client. No credential is read or transmitted. */

import { UPBIT_API_BASE_URL } from './upbitClient.js'

const DEFAULT_TIMEOUT_MS = 4_000

function normalizeTicker(row, requestedMarkets) {
  const market = String(row?.market || '').trim().toUpperCase()
  const tradePrice = Number(row?.trade_price)
  if (!requestedMarkets.has(market) || !Number.isFinite(tradePrice) || tradePrice <= 0) return null
  const timestamp = Number(row?.timestamp)
  const updatedDate = Number.isFinite(timestamp) ? new Date(timestamp) : null
  return {
    market,
    tradePrice,
    updatedAt: updatedDate && !Number.isNaN(updatedDate.getTime()) ? updatedDate.toISOString() : null,
  }
}

/**
 * @param {{ fetchImpl?: typeof fetch, baseUrl?: string, timeoutMs?: number }} [options]
 */
export function createUpbitPublicMarketClient(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const baseUrl = options.baseUrl || UPBIT_API_BASE_URL
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async getTickers(markets) {
      const requested = [...new Set((markets || []).map((value) => String(value).trim().toUpperCase()))]
      if (requested.length === 0) return []
      const url = `${baseUrl}/v1/ticker?${new URLSearchParams({ markets: requested.join(',') })}`
      let response
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        const error = new Error('Upbit public ticker request failed')
        error.code = 'UPBIT_TICKER_NETWORK_ERROR'
        throw error
      }
      const payload = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(payload)) {
        const error = new Error('Upbit public ticker request failed')
        error.code = `UPBIT_TICKER_HTTP_${response.status}`
        throw error
      }
      const requestedMarkets = new Set(requested)
      return payload.map((row) => normalizeTicker(row, requestedMarkets)).filter(Boolean)
    },
  }
}
