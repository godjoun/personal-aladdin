/**
 * tradeStorage.js — 거래 원장 (메모리 전용, SQLite가 SoT)
 */

import {
  FINANCE_LS_KEYS,
  getMemory,
  setMemory,
} from './memoryFinanceStore.js'

const MEMORY_KEY = FINANCE_LS_KEYS.trades

export function getTrades() {
  const value = getMemory(MEMORY_KEY, [])
  const list = Array.isArray(value) ? value : []
  return [...list].sort(
    (a, b) => new Date(b.tradedAt).getTime() - new Date(a.tradedAt).getTime(),
  )
}

export function saveTrades(trades) {
  if (!Array.isArray(trades)) {
    throw new Error('[tradeStorage] trades 는 배열이어야 합니다.')
  }
  setMemory(MEMORY_KEY, trades)
}

export function addTrade(trade) {
  const trades = getTrades()
  const newTrade = {
    ...trade,
    id: crypto.randomUUID(),
    tradedAt: trade.tradedAt || new Date().toISOString(),
  }
  trades.push(newTrade)
  saveTrades(trades)
  return newTrade
}

export function getTradesByAssetId(assetId) {
  return getTrades()
    .filter((trade) => trade.assetId === assetId)
    .sort((a, b) => new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime())
}

export function deleteTradesByAssetId(assetId) {
  const trades = getTrades().filter((trade) => trade.assetId !== assetId)
  saveTrades(trades)
  return trades
}

export function hasTradesForAsset(assetId) {
  return getTrades().some((trade) => trade.assetId === assetId)
}
