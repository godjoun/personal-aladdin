/**
 * symbolLookup.js — 종목명/코드 검색
 * ─────────────────────────────────────────────────────────
 * 우선: 서버 키움 종목 캐시 (/api/kiwoom/stocks/search)
 * 실패 시: 공공데이터 likeItmsNm 보완 (수동 입력도 항상 가능)
 */

import { fetchMarketData } from '../api/marketApi.js'
import { fetchStockMarketData } from '../api/stockApi.js'
import { parseMarketPricesFromApi } from './storage.js'
import { apiFetch } from './apiClient.js'

function dedupeBySymbol(items) {
  const map = new Map()

  for (const item of items) {
    if (item.symbol && !map.has(item.symbol)) {
      map.set(item.symbol, {
        symbol: item.symbol,
        name: item.name,
      })
    }
  }

  return Array.from(map.values())
}

/**
 * 공공데이터 보완 검색
 *
 * @param {string} name
 * @param {string} [assetType='주식']
 * @returns {Promise<Array<{ symbol: string, name: string }>>}
 */
export async function lookupSymbolsByName(name, assetType = '주식') {
  const keyword = name.trim()

  if (!keyword) {
    return []
  }

  const params = {
    likeItmsNm: keyword,
    numOfRows: '20',
    pageNo: '1',
  }

  let results = []

  if (assetType === '주식') {
    try {
      const stockResult = await fetchStockMarketData(params)
      results.push(...parseMarketPricesFromApi(stockResult))
    } catch (error) {
      console.error('[symbolLookup] 주식 검색 실패:', error.message)
    }
  }

  if (results.length === 0) {
    try {
      const etfResult = await fetchMarketData(params)
      results.push(...parseMarketPricesFromApi(etfResult))
    } catch (error) {
      console.error('[symbolLookup] ETF 검색 실패:', error.message)
    }
  }

  return dedupeBySymbol(results).slice(0, 10)
}

/**
 * 종목 자동완성 검색 (키움 서버 캐시 우선)
 *
 * @param {string} query
 * @param {{ assetType?: string }} [options]
 * @returns {Promise<Array<{ symbol: string, name: string }>>}
 */
export async function searchStocks(query, options = {}) {
  const keyword = String(query ?? '').trim()
  if (keyword.length < 1) {
    return []
  }

  try {
    const response = await apiFetch(
      `/api/kiwoom/stocks/search?q=${encodeURIComponent(keyword)}`,
    )

    if (response.ok) {
      const data = await response.json()
      if (Array.isArray(data)) {
        return data
          .filter((item) => item?.symbol && item?.name)
          .map((item) => ({
            symbol: String(item.symbol),
            name: String(item.name),
          }))
          .slice(0, 10)
      }
    }
  } catch (error) {
    console.warn('[symbolLookup] 키움 종목 검색 실패, 공공데이터로 보완:', error.message)
  }

  return lookupSymbolsByName(keyword, options.assetType || '주식')
}
