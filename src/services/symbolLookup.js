/**
 * symbolLookup.js — 종목명으로 종목코드 검색
 * ─────────────────────────────────────────────────────────
 * 공공데이터 API 의 likeItmsNm 파라미터를 사용합니다.
 * 주식 API 먼저 시도하고, 없으면 ETF API 를 시도합니다.
 */

import { fetchMarketData } from '../api/marketApi.js'
import { fetchStockMarketData } from '../api/stockApi.js'
import { parseMarketPricesFromApi } from './storage.js'

/**
 * symbol 기준으로 중복 제거
 */
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
 * 종목명으로 종목코드 후보를 검색합니다.
 *
 * @param {string} name - 종목명 (예: 삼성전자)
 * @param {string} [assetType='주식'] - 자산군
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

  // 주식 자산군이면 주식 시세 API 먼저
  if (assetType === '주식') {
    try {
      const stockResult = await fetchStockMarketData(params)
      results.push(...parseMarketPricesFromApi(stockResult))
    } catch (error) {
      console.error('[symbolLookup] 주식 검색 실패:', error)
    }
  }

  // 결과가 없으면 ETF API 도 시도
  if (results.length === 0) {
    try {
      const etfResult = await fetchMarketData(params)
      results.push(...parseMarketPricesFromApi(etfResult))
    } catch (error) {
      console.error('[symbolLookup] ETF 검색 실패:', error)
    }
  }

  return dedupeBySymbol(results)
}
