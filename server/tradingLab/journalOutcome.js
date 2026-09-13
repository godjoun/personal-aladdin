import { SHADOW_ASSUMED_FEE_BPS, SHADOW_ASSUMED_SLIPPAGE_BPS } from './constants.js'
import { applyRoundTripCost, classifyShadowResult, SHADOW_HORIZONS_MS, signedReturnPct } from './shadowTradeEngine.js'

const INTERVAL = 15 * 60 * 1000
const validPrice = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0

/**
 * Journal outcomes use the first CLOSED 15m candle at/after the horizon
 * (at most 15m later). Missing historical candles never become today's price.
 * Already observed horizons are frozen; transient provider failures cannot erase them.
 */
export function evaluateJournalOutcome({ direction, entryPrice, createdAt, nowMs, candles = [], previous = {} }) {
  const entryMs = Date.parse(createdAt)
  const endMs = entryMs + SHADOW_HORIZONS_MS['24h']
  const closed = candles.filter((c) => Number.isFinite(c.timestamp) && c.timestamp + INTERVAL <= nowMs && validPrice(c.close))
    .sort((a, b) => a.timestamp - b.timestamp)
  const result = { evaluatedAt: new Date(nowMs).toISOString(), assumedFeeBps: SHADOW_ASSUMED_FEE_BPS, assumedSlippageBps: SHADOW_ASSUMED_SLIPPAGE_BPS }
  for (const [key, offset] of Object.entries(SHADOW_HORIZONS_MS)) {
    const due = entryMs + offset
    const candle = nowMs >= due ? closed.find((c) => c.timestamp + INTERVAL >= due && c.timestamp + INTERVAL < due + INTERVAL) : null
    const price = previous?.[`price${key}`] ?? candle?.close ?? null
    result[`price${key}`] = price
    result[`return${key}Pct`] = signedReturnPct(direction, entryPrice, price)
  }
  // Whole candles only, excluding highs/lows before entry and after the 24h boundary.
  let favorable = previous?.maxFavorableMovePct ?? null
  let adverse = previous?.maxAdverseMovePct ?? null
  for (const candle of closed) {
    if (candle.timestamp < entryMs || candle.timestamp + INTERVAL > Math.min(nowMs, endMs) || !validPrice(candle.high) || !validPrice(candle.low)) continue
    const a = signedReturnPct(direction, entryPrice, candle.high)
    const b = signedReturnPct(direction, entryPrice, candle.low)
    favorable = Math.max(favorable ?? 0, a, b)
    adverse = Math.min(adverse ?? 0, a, b)
  }
  result.maxFavorableMovePct = favorable
  result.maxAdverseMovePct = adverse
  const complete = Object.keys(SHADOW_HORIZONS_MS).every((key) => result[`price${key}`] !== null)
  result.status = complete ? 'CLOSED' : nowMs >= entryMs + SHADOW_HORIZONS_MS['1h'] ? 'EVALUATING' : 'OPEN'
  result.feeAdjustedReturnPct = applyRoundTripCost(result.return24hPct)
  result.result = classifyShadowResult(result.feeAdjustedReturnPct, complete)
  return result
}
