/**
 * marketSync.js — 보유 자산 기준 시세 동기화
 * ─────────────────────────────────────────────────────────
 * 1) 키움 잔고(kt00018) 현재가 — 있으면 우선
 * 2) 공공데이터 주식/ETF 시세 — 보완
 */

import { fetchMarketData } from '../api/marketApi.js'
import { fetchStockMarketData } from '../api/stockApi.js'
import { parseMarketPricesFromApi } from './storage.js'
import { apiFetch } from './apiClient.js'

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
 * 키움 잔고 응답의 현재가를 MarketPrice 형태로 변환합니다.
 * (값 자체는 로그하지 않음)
 *
 * @param {string[]} symbols
 * @returns {Promise<Array<Object>>}
 */
export async function fetchKiwoomBalancePrices(symbols = []) {
  const wanted = new Set(
    (Array.isArray(symbols) ? symbols : [])
      .map((s) => String(s).trim().replace(/^A/i, ''))
      .filter(Boolean),
  )

  if (wanted.size === 0) {
    return []
  }

  let payload
  try {
    const response = await apiFetch('/api/kiwoom/balances')
    if (!response.ok) {
      return []
    }
    payload = await response.json()
  } catch {
    return []
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
 * 한 종목코드에 대해 주식 → ETF 순으로 시세를 조회합니다.
 *
 * @param {string} symbol
 * @returns {Promise<Array<Object>>}
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

    if (stockPrices.length > 0) {
      console.log(`[marketSync] 주식 ${symbol} 시세 ${stockPrices.length}건`)
      return stockPrices
    }
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

    if (etfPrices.length > 0) {
      console.log(`[marketSync] ETF ${symbol} 시세 ${etfPrices.length}건`)
      return etfPrices
    }
  } catch (error) {
    console.error(`[marketSync] ETF API (${symbol}) 실패:`, error.message)
  }

  console.warn(`[marketSync] ${symbol} — 공공 시세를 찾지 못했습니다.`)
  return []
}

/**
 * 보유 자산 종목 시세 조회 (키움 잔고 현재가 우선, 공공데이터 보완)
 *
 * @param {Array<Object>} assets
 * @returns {Promise<Array<Object>>}
 */
export async function fetchPricesForAssets(assets) {
  const symbols = getUniqueSymbols(assets)

  if (symbols.length === 0) {
    console.log(
      '[marketSync] 등록된 자산이 없습니다. AssetForm 에서 종목을 추가해 주세요.',
    )
    return []
  }

  console.log(`[marketSync] 보유 종목 ${symbols.length}개 시세 조회`)

  const publicPrices = []
  for (const symbol of symbols) {
    const prices = await fetchPricesForSymbol(symbol)
    publicPrices.push(...prices)
  }

  const kiwoomPrices = await fetchKiwoomBalancePrices(symbols)
  if (kiwoomPrices.length > 0) {
    console.log(
      `[marketSync] 키움 잔고 현재가 보완 ${kiwoomPrices.length}종목`,
    )
  }

  // 같은 symbol+date 는 뒤쪽(키움)이 upsert 시 우선
  return [...publicPrices, ...kiwoomPrices]
}
