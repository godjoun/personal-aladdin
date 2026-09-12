/**
 * shadowTradeEngine.js — 가상 포지션 규칙 (실제 주문 없음)
 */

import {
  SHADOW_ASSUMED_FEE_BPS,
  SHADOW_ASSUMED_SLIPPAGE_BPS,
  SHADOW_AUTO_LONG_STATES,
  SHADOW_AUTO_SHORT_STATES,
  SHADOW_AUTO_STRENGTH_MIN,
  SHADOW_DEDUP_WINDOW_MS,
  SHADOW_OBSERVE_STATES,
  SHADOW_RESULT_DEADZONE_PCT,
  SHADOW_TRADE_DISCLAIMER,
} from './constants.js'

export const SHADOW_HORIZONS_MS = Object.freeze({
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
})

export { SHADOW_TRADE_DISCLAIMER }

/**
 * @param {string} iso
 * @param {number} [windowMs]
 */
export function resolveShadowDedupBucket(
  iso,
  windowMs = SHADOW_DEDUP_WINDOW_MS,
) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms) || windowMs <= 0) return new Date(0).toISOString()
  return new Date(Math.floor(ms / windowMs) * windowMs).toISOString()
}

/**
 * @param {string} direction
 * @param {number} entryPrice
 * @param {number | null | undefined} price
 */
export function signedReturnPct(direction, entryPrice, price) {
  if (
    typeof entryPrice !== 'number' ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0
  ) {
    return null
  }
  if (typeof price !== 'number' || !Number.isFinite(price)) return null
  if (direction === 'LONG') return ((price - entryPrice) / entryPrice) * 100
  if (direction === 'SHORT') return ((entryPrice - price) / entryPrice) * 100
  return null
}

/**
 * 왕복 비용. 5bps + 3bps 를 진입/청산 양쪽에 적용 → 0.16%p.
 *
 * @param {number | null} rawPct
 * @param {{ feeBps?: number, slippageBps?: number }} [options]
 */
export function applyRoundTripCost(rawPct, options = {}) {
  if (typeof rawPct !== 'number' || !Number.isFinite(rawPct)) return null
  const feeBps = options.feeBps ?? SHADOW_ASSUMED_FEE_BPS
  const slippageBps = options.slippageBps ?? SHADOW_ASSUMED_SLIPPAGE_BPS
  const costPct = ((feeBps + slippageBps) * 2) / 100
  return rawPct - costPct
}

/**
 * @param {number | null} feeAdjustedReturnPct
 * @param {boolean} closed
 */
export function classifyShadowResult(feeAdjustedReturnPct, closed) {
  if (!closed || typeof feeAdjustedReturnPct !== 'number') return 'UNRESOLVED'
  if (feeAdjustedReturnPct >= SHADOW_RESULT_DEADZONE_PCT) return 'WIN'
  if (feeAdjustedReturnPct <= -SHADOW_RESULT_DEADZONE_PCT) return 'LOSS'
  return 'NEUTRAL'
}

/**
 * @param {{
 *   direction: string,
 *   entryPrice: number,
 *   candles?: Array<{ timestamp?: number, high?: number, low?: number }>,
 *   fromMs: number,
 *   toMs: number,
 * }} input
 */
export function computeMfeMae(input) {
  const { direction, entryPrice, fromMs, toMs } = input
  const candles = Array.isArray(input.candles) ? input.candles : []
  const window = candles.filter((candle) => {
    const ts = Number(candle.timestamp)
    return Number.isFinite(ts) && ts >= fromMs && ts <= toMs
  })
  if (window.length === 0 || !(entryPrice > 0)) {
    return { maxFavorableMovePct: null, maxAdverseMovePct: null }
  }

  let maxFav = null
  let maxAdv = null
  for (const candle of window) {
    const high = Number(candle.high)
    const low = Number(candle.low)
    if (!Number.isFinite(high) || !Number.isFinite(low)) continue
    if (direction === 'LONG') {
      const fav = signedReturnPct('LONG', entryPrice, high)
      const adv = signedReturnPct('LONG', entryPrice, low)
      if (fav != null) maxFav = maxFav == null ? fav : Math.max(maxFav, fav)
      if (adv != null) maxAdv = maxAdv == null ? adv : Math.min(maxAdv, adv)
    } else if (direction === 'SHORT') {
      const fav = signedReturnPct('SHORT', entryPrice, low)
      const adv = signedReturnPct('SHORT', entryPrice, high)
      if (fav != null) maxFav = maxFav == null ? fav : Math.max(maxFav, fav)
      if (adv != null) maxAdv = maxAdv == null ? adv : Math.min(maxAdv, adv)
    }
  }
  return { maxFavorableMovePct: maxFav, maxAdverseMovePct: maxAdv }
}

/**
 * 목표 시각 이후 첫 봉의 close. 없으면 현재가.
 *
 * @param {Array<{ timestamp?: number, close?: number }>} candles
 * @param {number} targetMs
 * @param {number | null} fallbackPrice
 */
export function priceAtHorizon(candles, targetMs, fallbackPrice = null) {
  const list = Array.isArray(candles) ? candles : []
  const next = list.find((candle) => Number(candle.timestamp) >= targetMs)
  if (next && Number.isFinite(Number(next.close))) return Number(next.close)
  const prev = [...list]
    .reverse()
    .find((candle) => Number(candle.timestamp) <= targetMs)
  if (prev && Number.isFinite(Number(prev.close))) return Number(prev.close)
  return typeof fallbackPrice === 'number' && Number.isFinite(fallbackPrice)
    ? fallbackPrice
    : null
}

/**
 * @param {{ primaryState?: string, strengthScore?: number, timeframe4h?: string | null }} input
 */
export function decideAutoShadowAction(input = {}) {
  const state = input.primaryState
  const strength = Number(input.strengthScore)
  const tf4h = input.timeframe4h || null

  if (SHADOW_OBSERVE_STATES.includes(state)) {
    return {
      action: 'observe',
      direction: state === 'SHORT_LIQUIDATION_DRIVEN' ? 'LONG' : 'SHORT',
      reason: '청산 주도 움직임은 추격 진입 위험이 있어 관찰만 기록합니다.',
    }
  }

  if (!Number.isFinite(strength) || strength < SHADOW_AUTO_STRENGTH_MIN) {
    return { action: 'skip', direction: null, reason: null }
  }

  if (SHADOW_AUTO_LONG_STATES.includes(state)) {
    if (tf4h === 'BEARISH') {
      return { action: 'skip', direction: 'LONG', reason: '4H 반대' }
    }
    return { action: 'enter', direction: 'LONG', reason: null }
  }
  if (SHADOW_AUTO_SHORT_STATES.includes(state)) {
    if (tf4h === 'BULLISH') {
      return { action: 'skip', direction: 'SHORT', reason: '4H 반대' }
    }
    return { action: 'enter', direction: 'SHORT', reason: null }
  }
  return { action: 'skip', direction: null, reason: null }
}

/**
 * @param {{
 *   recentClosedResults?: string[],
 *   sameDirectionCount30m?: number,
 *   noteEmpty?: boolean,
 * }} input
 */
export function buildShadowRiskWarnings(input = {}) {
  const warnings = []
  const recent = Array.isArray(input.recentClosedResults)
    ? input.recentClosedResults.slice(0, 3)
    : []
  if (recent.length >= 3 && recent.every((item) => item === 'LOSS')) {
    warnings.push(
      '연속 실패 구간입니다. 실전 진입 검토를 멈추고 복기하세요.',
    )
  }
  if ((Number(input.sameDirectionCount30m) || 0) >= 3) {
    warnings.push('과도한 재진입 패턴 가능성')
  }
  if (input.noteEmpty) {
    warnings.push('진입 이유가 비어 있습니다')
  }
  return warnings
}

/**
 * @param {{
 *   direction: string,
 *   entryPrice: number,
 *   createdAt: string,
 *   nowMs?: number,
 *   currentPrice?: number | null,
 *   candles?: Array<object>,
 *   feeBps?: number,
 *   slippageBps?: number,
 * }} input
 */
export function evaluateShadowOutcome(input) {
  const nowMs = input.nowMs ?? Date.now()
  const createdMs = Date.parse(input.createdAt)
  const entryPrice = input.entryPrice
  const direction = input.direction
  const candles = input.candles || []
  const currentPrice = input.currentPrice ?? null

  const prices = {}
  const returns = {}
  for (const [key, offset] of Object.entries(SHADOW_HORIZONS_MS)) {
    const due = createdMs + offset
    if (!Number.isFinite(createdMs) || nowMs < due) {
      prices[key] = null
      returns[key] = null
      continue
    }
    const price = priceAtHorizon(candles, due, currentPrice)
    prices[key] = price
    returns[key] = signedReturnPct(direction, entryPrice, price)
  }

  const closed = returns['24h'] != null
  const liveHorizon = closed
    ? '24h'
    : ['12h', '4h', '1h'].find((key) => returns[key] != null) || null
  const raw =
    (liveHorizon && returns[liveHorizon]) ??
    signedReturnPct(direction, entryPrice, currentPrice)
  const feeAdjusted = applyRoundTripCost(raw, {
    feeBps: input.feeBps,
    slippageBps: input.slippageBps,
  })
  const endMs = Math.min(nowMs, createdMs + SHADOW_HORIZONS_MS['24h'])
  const excursion = computeMfeMae({
    direction,
    entryPrice,
    candles,
    fromMs: createdMs,
    toMs: endMs,
  })

  let status = 'OPEN'
  if (closed) status = 'CLOSED'
  else if (returns['1h'] != null || returns['4h'] != null || returns['12h'] != null) {
    status = 'EVALUATING'
  }

  return {
    evaluatedAt: new Date(nowMs).toISOString(),
    price1h: prices['1h'],
    price4h: prices['4h'],
    price12h: prices['12h'],
    price24h: prices['24h'],
    return1hPct: returns['1h'],
    return4hPct: returns['4h'],
    return12hPct: returns['12h'],
    return24hPct: returns['24h'],
    maxFavorableMovePct: excursion.maxFavorableMovePct,
    maxAdverseMovePct: excursion.maxAdverseMovePct,
    feeAdjustedReturnPct: feeAdjusted,
    assumedFeeBps: input.feeBps ?? SHADOW_ASSUMED_FEE_BPS,
    assumedSlippageBps: input.slippageBps ?? SHADOW_ASSUMED_SLIPPAGE_BPS,
    result: classifyShadowResult(closed ? feeAdjusted : null, closed),
    status,
    currentReturnPct: signedReturnPct(direction, entryPrice, currentPrice),
    disclaimer: SHADOW_TRADE_DISCLAIMER,
  }
}
