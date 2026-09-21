function finite(value) {
  if (value == null || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export function isOpenUpbitTrade(trade) {
  return trade?.status === 'OPEN' || trade?.status === 'PARTIAL'
}

export function sortUpbitTrades(trades = []) {
  return [...trades].sort((a, b) => {
    const openOrder = Number(isOpenUpbitTrade(b)) - Number(isOpenUpbitTrade(a))
    if (openOrder !== 0) return openOrder
    const aTime = Date.parse(isOpenUpbitTrade(a) ? a.openedAt : a.closedAt) || 0
    const bTime = Date.parse(isOpenUpbitTrade(b) ? b.openedAt : b.closedAt) || 0
    return bTime - aTime
  })
}

export function summarizeUpbitTrades(trades = []) {
  return trades.reduce((summary, trade) => {
    if (isOpenUpbitTrade(trade)) summary.openCount += 1
    else summary.closedCount += 1
    const realized = finite(trade.realizedPnl)
    if (realized != null) summary.totalRealizedPnl += realized
    return summary
  }, { total: trades.length, openCount: 0, closedCount: 0, totalRealizedPnl: 0 })
}

export function upbitTradePnl(trade, quote) {
  if (isOpenUpbitTrade(trade)) {
    const currentPrice = finite(quote?.tradePrice)
    const entryPrice = finite(trade.averageEntryPrice)
    const quantity = finite(trade.remainingQuantity)
    if (currentPrice == null || entryPrice == null || entryPrice <= 0 || quantity == null || quantity <= 0) {
      return { amount: null, rate: null, label: '현재 평가손익', tone: 'neutral' }
    }
    const basis = entryPrice * quantity
    const amount = (currentPrice - entryPrice) * quantity
    const rate = basis > 0 ? (amount / basis) * 100 : null
    return { amount, rate, label: '현재 평가손익', tone: amount > 0 ? 'profit' : amount < 0 ? 'loss' : 'neutral' }
  }
  const amount = trade.status === 'UNKNOWN_BASIS' ? null : finite(trade.realizedPnl)
  const rate = trade.status === 'UNKNOWN_BASIS' ? null : finite(trade.realizedPnlPct)
  return { amount, rate, label: '실현손익', tone: amount > 0 ? 'profit' : amount < 0 ? 'loss' : 'neutral' }
}
