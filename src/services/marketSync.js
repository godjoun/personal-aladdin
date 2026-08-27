/**
 * marketSync.js — 보유 자산 기준 시세 동기화
 * ─────────────────────────────────────────────────────────
 * 1) 키움 잔고(kt00018) 현재가 — 있으면 우선
 * 2) 공공데이터 주식/ETF 시세 — 보완 (제한 병렬)
 */

import { fetchMarketData } from '../api/marketApi.js'
import { fetchStockMarketData } from '../api/stockApi.js'
import { parseMarketPricesFromApi } from './storage.js'
import { apiFetch } from './apiClient.js'
import { mapWithConcurrency } from '../utils/concurrency.js'

const PUBLIC_PRICE_CONCURRENCY = 3

/**
 * @param {Array<Object>} assets
 * @returns {string[]}
 */
function getUniqueSymbols(assets) {
  const symbols = assets
    .map((asset) => asset.symbol?.trim())
    .filter((symbol) => Boolean(symbol))

  return [...new Set(symbols)]
}

function filterBySymbol(prices, symbol) {
  return prices.filter((price) => price.symbol === symbol)
}

function todayKstYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('-', '')
}

/**
 * @param {string[]} symbols
 * @param {{ fetchImpl?: typeof fetch, balancesPayload?: object }} [options]
 */
export async function fetchKiwoomBalancePrices(symbols = [], options = {}) {
  const wanted = new Set(
    (Array.isArray(symbols) ? symbols : [])
      .map((s) => String(s).trim().replace(/^A/i, ''))
      .filter(Boolean),
  )

  if (wanted.size === 0) {
    return []
  }

  let payload = options.balancesPayload
  if (!payload) {
    try {
      const fetchImpl = options.fetchImpl ?? apiFetch
      const response = await fetchImpl('/api/kiwoom/balances')
      if (!response.ok) {
        return []
      }
      payload = await response.json()
    } catch {
      return []
    }
  }

  const date = todayKstYmd()
  const bySymbol = new Map()

  for (const account of Object.values(payload?.accounts || {})) {
    if (!account?.ok || !Array.isArray(account.holdings)) {
      continue
    }

    for (const holding of account.holdings) {
      const symbol = String(holding?.code?.value || holding?.code?.raw || '')
        .trim()
        .replace(/^A/i, '')
      if (!symbol || !wanted.has(symbol)) {
        continue
      }

      const rawPrice = holding?.currentPrice?.value
      if (rawPrice == null || !Number.isFinite(Number(rawPrice))) {
        continue
      }

      const closePrice = Math.abs(Number(rawPrice))
      if (!(closePrice > 0)) {
        continue
      }

      bySymbol.set(symbol, {
        symbol,
        name: holding?.name || '',
        date,
        closePrice,
        source: 'kiwoom',
      })
    }
  }

  return Array.from(bySymbol.values())
}

/**
 * @param {string} symbol
 */
async function fetchPricesForSymbol(symbol) {
  try {
    const stockResult = await fetchStockMarketData({
      likeSrtnCd: symbol,
      numOfRows: '100',
      pageNo: '1',
    })
    const stockPrices = filterBySymbol(
      parseMarketPricesFromApi(stockResult),
      symbol,
    )
    if (stockPrices.length > 0) return stockPrices
  } catch (error) {
    console.error(`[marketSync] 주식 API (${symbol}) 실패:`, error.message)
  }

  try {
    const etfResult = await fetchMarketData({
      likeSrtnCd: symbol,
      numOfRows: '100',
      pageNo: '1',
    })
    const etfPrices = filterBySymbol(parseMarketPricesFromApi(etfResult), symbol)
    if (etfPrices.length > 0) return etfPrices
  } catch (error) {
    console.error(`[marketSync] ETF API (${symbol}) 실패:`, error.message)
  }

  return []
}

/**
 * @param {Array<Object>} assets
 * @param {{
 *   skipPublic?: boolean,
 *   skipKiwoomBalances?: boolean,
 *   balancesPayload?: object,
 *   concurrency?: number,
 * }} [options]
 */
export async function fetchPricesForAssets(assets, options = {}) {
  const symbols = getUniqueSymbols(assets)

  if (symbols.length === 0) {
    return []
  }

  /** @type {Array<Object>} */
  let publicPrices = []
  if (!options.skipPublic) {
    const settled = await mapWithConcurrency(
      symbols,
      options.concurrency ?? PUBLIC_PRICE_CONCURRENCY,
      (symbol) => fetchPricesForSymbol(symbol),
    )
    for (const result of settled) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        publicPrices.push(...result.value)
      }
    }
  }

  /** @type {Array<Object>} */
  let kiwoomPrices = []
  if (!options.skipKiwoomBalances) {
    kiwoomPrices = await fetchKiwoomBalancePrices(symbols, {
      balancesPayload: options.balancesPayload,
    })
  }

  return [...publicPrices, ...kiwoomPrices]
}
