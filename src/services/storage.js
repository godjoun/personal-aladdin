/**
 * storage.js — 시세 데이터 (메모리 전용, 금융정보 localStorage 금지)
 */

import {
  FINANCE_LS_KEYS,
  getMemory,
  setMemory,
} from './memoryFinanceStore.js'

const MEMORY_KEY = FINANCE_LS_KEYS.marketPrices

function makePriceKey(symbol, date) {
  return `${symbol}|${date}`
}

export function getMarketPrices() {
  const value = getMemory(MEMORY_KEY, [])
  return Array.isArray(value) ? value : []
}

export function saveMarketPrices(prices) {
  if (!Array.isArray(prices)) {
    throw new Error('[storage] saveMarketPrices: prices 는 배열이어야 합니다.')
  }
  setMemory(MEMORY_KEY, prices)
}

export function upsertMarketPrices(newPrices) {
  if (!Array.isArray(newPrices)) {
    throw new Error('[storage] upsertMarketPrices: newPrices 는 배열이어야 합니다.')
  }

  const existingPrices = getMarketPrices()
  const priceMap = new Map()

  for (const price of existingPrices) {
    if (price.symbol && price.date) {
      priceMap.set(makePriceKey(price.symbol, price.date), price)
    }
  }

  let inserted = 0
  let updated = 0

  for (const price of newPrices) {
    if (!price.symbol || !price.date) {
      console.warn('[storage] symbol 또는 date 가 없는 항목을 건너뜁니다')
      continue
    }

    const key = makePriceKey(price.symbol, price.date)
    if (priceMap.has(key)) {
      priceMap.set(key, { ...priceMap.get(key), ...price })
      updated += 1
    } else {
      priceMap.set(key, price)
      inserted += 1
    }
  }

  const mergedPrices = Array.from(priceMap.values())
  saveMarketPrices(mergedPrices)

  return {
    total: mergedPrices.length,
    inserted,
    updated,
  }
}

export function clearMarketPrices() {
  setMemory(MEMORY_KEY, [])
}

export function parseMarketPricesFromApi(apiResponse) {
  const items = apiResponse?.response?.body?.items?.item

  if (!items) {
    console.warn('[storage] API 응답에서 시세 항목(items.item)을 찾을 수 없습니다.')
    return []
  }

  const itemList = Array.isArray(items) ? items : [items]

  return itemList.map((item) => ({
    symbol: item.srtnCd,
    date: item.basDt,
    name: item.itmsNm,
    closePrice: item.clpr,
    openPrice: item.mkp,
    highPrice: item.hipr,
    lowPrice: item.lopr,
    volume: item.trqu,
    tradeAmount: item.trPrc,
    change: item.vs,
    changeRate: item.fltRt,
    isinCode: item.isinCd,
    market: item.mrktCtg,
  }))
}
