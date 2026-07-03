/**
 * marketSync.js — 보유 자산 기준 시세 동기화
 * ─────────────────────────────────────────────────────────
 * 사용자가 등록한 종목코드(symbol)만 골라서 API 시세를 가져옵니다.
 *
 * 흐름:
 *   1. assets 에서 종목코드 목록 추출
 *   2. 종목마다 주식 API(likeSrtnCd) 호출
 *   3. 없으면 ETF API 도 시도 (ETF 코드 대비)
 *   4. parseMarketPricesFromApi 로 변환 후 배열 반환
 */

import { fetchMarketData } from '../api/marketApi.js'
import { fetchStockMarketData } from '../api/stockApi.js'
import { parseMarketPricesFromApi } from './storage.js'

/**
 * assets 배열에서 중복 없는 종목코드 목록을 만듭니다.
 *
 * @param {Array<Object>} assets
 * @returns {string[]}
 */
function getUniqueSymbols(assets) {
  const symbols = assets
    .map((asset) => asset.symbol?.trim())
    .filter((symbol) => Boolean(symbol))

  return [...new Set(symbols)]
}

/**
 * API 응답에서 정확히 해당 symbol 과 일치하는 시세만 남깁니다.
 */
function filterBySymbol(prices, symbol) {
  return prices.filter((price) => price.symbol === symbol)
}

/**
 * 한 종목코드에 대해 주식 → ETF 순으로 시세를 조회합니다.
 *
 * @param {string} symbol - 종목코드 (예: 005930)
 * @returns {Promise<Array<Object>>} 해당 종목 시세 배열
 */
async function fetchPricesForSymbol(symbol) {
  // ① 주식 시세 API (getStockPriceInfo)
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
    console.error(`[marketSync] 주식 API (${symbol}) 실패:`, error)
  }

  // ② ETF 시세 API (getETFPriceInfo) — 주식 API 에 없을 때
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
    console.error(`[marketSync] ETF API (${symbol}) 실패:`, error)
  }

  console.warn(`[marketSync] ${symbol} — 시세를 찾지 못했습니다.`)
  return []
}

/**
 * 보유 자산 목록에 있는 종목코드만 시세를 가져옵니다.
 *
 * @param {Array<Object>} assets - assetStorage 의 자산 배열
 * @returns {Promise<Array<Object>>} storage 에 넣을 시세 배열
 */
export async function fetchPricesForAssets(assets) {
  const symbols = getUniqueSymbols(assets)

  if (symbols.length === 0) {
    console.log(
      '[marketSync] 등록된 자산이 없습니다. AssetForm 에서 종목을 추가해 주세요.',
    )
    return []
  }

  console.log(`[marketSync] 보유 종목 ${symbols.length}개 시세 조회:`, symbols)

  const allPrices = []

  for (const symbol of symbols) {
    const prices = await fetchPricesForSymbol(symbol)
    allPrices.push(...prices)
  }

  return allPrices
}
