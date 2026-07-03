/**
 * positionEngine.js — 거래 원장 → 포지션 계산
 * ─────────────────────────────────────────────────────────
 * 매수·매도 이벤트로부터 보유 수량·평균 매수가를 산출합니다.
 * 평균 단가법(average cost)을 사용합니다.
 */

/**
 * @param {Array<{ side: string, quantity: number, price: number, tradedAt: string }>} trades
 * @returns {{ quantity: number, averageBuyPrice: number }}
 */
export function computePositionFromTrades(trades) {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime(),
  )

  let quantity = 0
  let totalCost = 0

  for (const trade of sorted) {
    const qty = Number(trade.quantity)
    const price = Number(trade.price)

    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      continue
    }

    if (trade.side === 'buy') {
      quantity += qty
      totalCost += qty * price
    } else if (trade.side === 'sell') {
      if (qty > quantity) {
        return { quantity: 0, averageBuyPrice: 0, error: 'insufficient_quantity' }
      }

      const avgCost = quantity > 0 ? totalCost / quantity : 0
      totalCost -= avgCost * qty
      quantity -= qty
    }
  }

  return {
    quantity,
    averageBuyPrice: quantity > 0 ? totalCost / quantity : 0,
  }
}
