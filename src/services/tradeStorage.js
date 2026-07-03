/**
 * tradeStorage.js — 거래 이벤트 원장 (Transaction Ledger)
 * ─────────────────────────────────────────────────────────
 * 블랙록 ALADDIN 의 거래 기록 레이어에 해당합니다.
 * 매수·매도 이벤트는 덮어쓰지 않고 누적합니다.
 *
 * 저장 형식 (Trade):
 *   {
 *     id, assetId, symbol, name, assetType,
 *     side: 'buy' | 'sell',
 *     quantity, price, memo,
 *     tradedAt: ISO string
 *   }
 */

const STORAGE_KEY = 'aladdin_trades'

export function getTrades() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw === null) {
      return []
    }

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      console.warn('[tradeStorage] 저장된 데이터가 배열이 아닙니다.')
      return []
    }

    return parsed.sort(
      (a, b) => new Date(b.tradedAt).getTime() - new Date(a.tradedAt).getTime(),
    )
  } catch (error) {
    console.error('[tradeStorage] 읽기 실패:', error)
    return []
  }
}

export function saveTrades(trades) {
  if (!Array.isArray(trades)) {
    throw new Error('[tradeStorage] trades 는 배열이어야 합니다.')
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades))
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
