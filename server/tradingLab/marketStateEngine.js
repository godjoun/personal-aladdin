/**
 * marketStateEngine.js — 결정론적 시장 상태 판정 v1
 *
 * 입력: 정규화된 시장 snapshot
 * 출력: primary/secondary 상태, 0~100 신호 강도, 숫자 근거
 *
 * 하지 않는 것: 주문, LONG/SHORT 추천, 승률, 가격 예측, 머신러닝.
 * 단 하나의 지표만으로 상태를 확정하지 않는다.
 */

import {
  MARKET_STATES,
  MARKET_STATE_LABELS,
  MARKET_STATE_SHORT_LABELS,
  MARKET_STATE_DISCLAIMER,
  MARKET_STATE_BUCKET_SECONDS,
} from './constants.js'
import { MARKET_STATE_THRESHOLDS as T } from './marketStateThresholds.js'

export {
  MARKET_STATES,
  MARKET_STATE_LABELS,
  MARKET_STATE_SHORT_LABELS,
  MARKET_STATE_DISCLAIMER,
}

const BULLISH_STATES = new Set([
  'BULLISH_PRESSURE',
  'NEW_LONG_BUILDUP',
  'SHORT_LIQUIDATION_DRIVEN',
  'PRICE_CVD_BULLISH_DIVERGENCE',
])

const BEARISH_STATES = new Set([
  'BEARISH_PRESSURE',
  'NEW_SHORT_BUILDUP',
  'LONG_LIQUIDATION_DRIVEN',
  'PRICE_CVD_BEARISH_DIVERGENCE',
])

const PRIMARY_PRIORITY = Object.freeze([
  'SHORT_LIQUIDATION_DRIVEN',
  'LONG_LIQUIDATION_DRIVEN',
  'NEW_LONG_BUILDUP',
  'NEW_SHORT_BUILDUP',
  'PRICE_CVD_BEARISH_DIVERGENCE',
  'PRICE_CVD_BULLISH_DIVERGENCE',
  'BULLISH_PRESSURE',
  'BEARISH_PRESSURE',
  'MIXED',
  'DATA_INSUFFICIENT',
])

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNum(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * @param {unknown} value
 * @param {number} threshold
 * @returns {-1 | 0 | 1}
 */
function signedDirection(value, threshold) {
  if (!isNum(value) || !isNum(threshold) || threshold <= 0) return 0
  if (value >= threshold) return 1
  if (value <= -threshold) return -1
  return 0
}

/**
 * @param {string} iso
 * @param {number} [intervalSeconds]
 */
export function resolveMarketStateBucketStart(
  iso,
  intervalSeconds = MARKET_STATE_BUCKET_SECONDS,
) {
  const ms = Date.parse(iso)
  const intervalMs = intervalSeconds * 1000
  if (!Number.isFinite(ms) || intervalMs <= 0) {
    return new Date(0).toISOString()
  }
  return new Date(Math.floor(ms / intervalMs) * intervalMs).toISOString()
}

/**
 * @param {number | null | undefined} value
 * @param {number} [digits]
 */
export function formatSignedPct(value, digits = 1) {
  if (!isNum(value)) return null
  const fixed = Number(value.toFixed(digits))
  if (fixed === 0) return `${(0).toFixed(digits)}%`
  const sign = fixed > 0 ? '+' : ''
  return `${sign}${fixed.toFixed(digits)}%`
}

/**
 * @param {number | null | undefined} value
 */
export function formatSignedUsdCompact(value) {
  if (!isNum(value)) return null
  const abs = Math.abs(value)
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

/**
 * @param {number | null | undefined} rate
 */
export function formatFundingRatePct(rate) {
  if (!isNum(rate)) return null
  const pct = rate * 100
  const fixed = Number(pct.toFixed(4))
  if (fixed === 0) return '0.0000%'
  const sign = fixed > 0 ? '+' : ''
  return `${sign}${fixed.toFixed(4)}%`
}

/**
 * @param {string | null | undefined} code
 */
export function getMarketStateLabel(code) {
  return MARKET_STATE_LABELS[code] || MARKET_STATE_LABELS.DATA_INSUFFICIENT
}

/**
 * @param {string | null | undefined} code
 */
export function getMarketStateShortLabel(code) {
  return MARKET_STATE_SHORT_LABELS[code] || MARKET_STATE_SHORT_LABELS.DATA_INSUFFICIENT
}

/**
 * @param {object} input
 */
function hasCvdData(input) {
  const trades = Number(input.tradeCount) || 0
  if (trades > 0 && isNum(input.cvdNotional)) return true
  return isNum(input.cvdNotional) && input.cvdNotional !== 0
}

/**
 * |CVD| / (buy+sell) * 100. buy/sell share 차이도 동등하다.
 *
 * @param {object} input
 * @returns {number | null}
 */
export function computeCvdImbalancePct(input = {}) {
  if (isNum(input.cvdImbalancePct)) return Math.abs(input.cvdImbalancePct)
  const buy = isNum(input.buyNotional) ? input.buyNotional : null
  const sell = isNum(input.sellNotional) ? input.sellNotional : null
  const total =
    isNum(input.totalTradeNotional) && input.totalTradeNotional > 0
      ? input.totalTradeNotional
      : (buy || 0) + (sell || 0)
  if (total > 0 && isNum(input.cvdNotional)) {
    return (Math.abs(input.cvdNotional) / total) * 100
  }
  if (isNum(input.buySharePct) && isNum(input.sellSharePct)) {
    return Math.abs(input.buySharePct - input.sellSharePct)
  }
  if (isNum(input.buySharePct)) {
    return Math.abs(input.buySharePct - (100 - input.buySharePct))
  }
  return null
}

/**
 * @param {object} input
 */
function readCvd(input) {
  if (!hasCvdData(input)) {
    return { dir: 0, large: false, present: false, imbalancePct: null }
  }
  const imbalancePct = computeCvdImbalancePct(input)
  const large =
    isNum(imbalancePct) && imbalancePct >= T.CVD_LARGE_IMBALANCE_PCT
  let dir = 0
  if (isNum(imbalancePct) && imbalancePct >= T.CVD_IMBALANCE_PCT) {
    if (isNum(input.cvdNotional) && input.cvdNotional !== 0) {
      dir = Math.sign(input.cvdNotional)
    } else if (isNum(input.buySharePct)) {
      dir = input.buySharePct > 50 ? 1 : input.buySharePct < 50 ? -1 : 0
    }
  }
  return { dir, large, present: true, imbalancePct }
}

/**
 * 청산 유의성. 절대 달러가 아니라 비중·건수·체결 대비 규모.
 *
 * @param {{
 *   sideNotional?: number | null,
 *   sideCount?: number | null,
 *   totalNotional?: number | null,
 *   totalTradeNotional?: number | null,
 * }} params
 */
export function isLiquidationSignificant(params = {}) {
  const sideNotional = isNum(params.sideNotional) ? params.sideNotional : 0
  if (sideNotional <= 0) return false
  const totalNotional = isNum(params.totalNotional) ? params.totalNotional : 0
  if (totalNotional <= 0) return false
  const share = (sideNotional / totalNotional) * 100
  if (share < T.LIQUIDATION_SIDE_SHARE_PCT) return false

  const totalTrade =
    isNum(params.totalTradeNotional) && params.totalTradeNotional > 0
      ? params.totalTradeNotional
      : null
  if (totalTrade !== null) {
    return (sideNotional / totalTrade) * 100 >= T.LIQUIDATION_VS_TRADE_PCT
  }
  const count = Number(params.sideCount) || 0
  return count >= T.LIQUIDATION_MIN_EVENTS
}

/**
 * @param {object} input
 */
export function readMarketSignals(input) {
  const price15 = signedDirection(input.priceChange15m, T.PRICE_CHANGE_PCT_15M)
  const price1h = signedDirection(input.priceChange1h, T.PRICE_CHANGE_PCT_1H)
  const price4h = signedDirection(input.priceChange4h, T.PRICE_CHANGE_PCT_4H)
  const oi = signedDirection(input.oiChangePct, T.OI_CHANGE_PCT)
  const cvd = readCvd(input)
  const volumeElevated =
    isNum(input.volumeRatio) && input.volumeRatio >= T.VOLUME_RATIO_ELEVATED
  const volumeStrong =
    isNum(input.volumeRatio) && input.volumeRatio >= T.VOLUME_RATIO_STRONG
  const longNotional = isNum(input.longLiquidationNotional)
    ? input.longLiquidationNotional
    : 0
  const shortNotional = isNum(input.shortLiquidationNotional)
    ? input.shortLiquidationNotional
    : 0
  const totalLiq = longNotional + shortNotional
  const totalTrade = isNum(input.totalTradeNotional)
    ? input.totalTradeNotional
    : (isNum(input.buyNotional) ? input.buyNotional : 0) +
      (isNum(input.sellNotional) ? input.sellNotional : 0)
  const longLiq = isLiquidationSignificant({
    sideNotional: longNotional,
    sideCount: input.longLiquidationCount,
    totalNotional: totalLiq,
    totalTradeNotional: totalTrade > 0 ? totalTrade : null,
  })
  const shortLiq = isLiquidationSignificant({
    sideNotional: shortNotional,
    sideCount: input.shortLiquidationCount,
    totalNotional: totalLiq,
    totalTradeNotional: totalTrade > 0 ? totalTrade : null,
  })
  const fundingExtreme =
    isNum(input.fundingRate) &&
    Math.abs(input.fundingRate) >= T.FUNDING_EXTREME_RATE
      ? Math.sign(input.fundingRate)
      : 0

  const hasPrice = isNum(input.priceChange15m)
  const hasOi = isNum(input.oiChangePct)
  const hasVolume = isNum(input.volumeRatio)
  const hasLiq =
    (isNum(input.longLiquidationNotional) && input.longLiquidationNotional > 0) ||
    (isNum(input.shortLiquidationNotional) && input.shortLiquidationNotional > 0)

  const usableCount = [
    hasPrice,
    hasOi,
    cvd.present,
    hasVolume,
    hasLiq,
  ].filter(Boolean).length

  return {
    price15,
    price1h,
    price4h,
    oi,
    cvd,
    volumeElevated,
    volumeStrong,
    longLiq,
    shortLiq,
    fundingExtreme,
    hasPrice,
    hasOi,
    hasVolume,
    hasLiq,
    usableCount,
  }
}

/**
 * @param {object} signals
 */
function collectCandidateStates(signals) {
  const candidates = []
  const { price15, oi, cvd, volumeElevated, shortLiq, longLiq } = signals

  if (price15 > 0 && oi < 0 && shortLiq) {
    candidates.push('SHORT_LIQUIDATION_DRIVEN')
  }
  if (price15 < 0 && oi < 0 && longLiq) {
    candidates.push('LONG_LIQUIDATION_DRIVEN')
  }
  if (price15 > 0 && oi > 0 && cvd.dir > 0) {
    candidates.push('NEW_LONG_BUILDUP')
  }
  if (price15 < 0 && oi > 0 && cvd.dir < 0) {
    candidates.push('NEW_SHORT_BUILDUP')
  }
  if (price15 > 0 && cvd.dir < 0 && cvd.large) {
    candidates.push('PRICE_CVD_BEARISH_DIVERGENCE')
  }
  if (price15 < 0 && cvd.dir > 0 && cvd.large) {
    candidates.push('PRICE_CVD_BULLISH_DIVERGENCE')
  }
  if (
    price15 > 0 &&
    (cvd.dir > 0 || oi > 0 || (volumeElevated && (cvd.present || signals.hasOi)))
  ) {
    candidates.push('BULLISH_PRESSURE')
  }
  if (
    price15 < 0 &&
    (cvd.dir < 0 || oi > 0 || (volumeElevated && (cvd.present || signals.hasOi)))
  ) {
    candidates.push('BEARISH_PRESSURE')
  }

  return [...new Set(candidates)]
}

/**
 * @param {string} state
 */
function stateLeaning(state) {
  if (BULLISH_STATES.has(state)) return 1
  if (BEARISH_STATES.has(state)) return -1
  return 0
}

/**
 * @param {string | null | undefined} structure
 * @param {-1 | 0 | 1} priceDir
 */
function structureLeaning(structure, priceDir = 0) {
  if (structure === 'BULLISH') return 1
  if (structure === 'BEARISH') return -1
  if (structure === 'RANGE' || structure === 'UNKNOWN') return 0
  return priceDir
}

/**
 * @param {object} input
 * @param {object} signals
 */
function resolveContext(input, signals) {
  return {
    timeframe15m:
      input.structure15m ||
      (signals.price15 > 0
        ? 'BULLISH'
        : signals.price15 < 0
          ? 'BEARISH'
          : 'UNKNOWN'),
    timeframe1h:
      input.structure1h ||
      (signals.price1h > 0
        ? 'BULLISH'
        : signals.price1h < 0
          ? 'BEARISH'
          : 'UNKNOWN'),
    timeframe4h:
      input.structure4h ||
      (signals.price4h > 0
        ? 'BULLISH'
        : signals.price4h < 0
          ? 'BEARISH'
          : 'UNKNOWN'),
  }
}

/**
 * @param {object} input
 * @param {object} signals
 * @param {string} primary
 */
function buildEvidence(input, signals, primary) {
  const evidence = []
  const counterEvidence = []
  const leaning = stateLeaning(primary)

  if (isNum(input.priceChange15m)) {
    const line = `15분 가격 ${formatSignedPct(input.priceChange15m)}`
    const agrees =
      (leaning > 0 && input.priceChange15m > 0) ||
      (leaning < 0 && input.priceChange15m < 0) ||
      primary === 'PRICE_CVD_BEARISH_DIVERGENCE' ||
      primary === 'PRICE_CVD_BULLISH_DIVERGENCE' ||
      leaning === 0
    if (agrees) evidence.push(line)
    else counterEvidence.push(line)
  }

  if (isNum(input.oiChangePct) && signals.oi !== 0) {
    const line = `OI ${formatSignedPct(input.oiChangePct)}`
    const agrees =
      (primary === 'NEW_LONG_BUILDUP' && signals.oi > 0) ||
      (primary === 'NEW_SHORT_BUILDUP' && signals.oi > 0) ||
      (primary === 'SHORT_LIQUIDATION_DRIVEN' && signals.oi < 0) ||
      (primary === 'LONG_LIQUIDATION_DRIVEN' && signals.oi < 0) ||
      (primary === 'BULLISH_PRESSURE' && signals.oi >= 0) ||
      (primary === 'BEARISH_PRESSURE' && signals.oi >= 0) ||
      leaning === 0
    if (primary.startsWith('PRICE_CVD_')) {
      if (signals.oi !== 0 && Math.sign(signals.oi) !== leaning) {
        counterEvidence.push(line)
      } else {
        evidence.push(line)
      }
    } else if (agrees) {
      evidence.push(line)
    } else {
      counterEvidence.push(line)
    }
  }

  if (signals.cvd.present && isNum(input.cvdNotional)) {
    const line = `CVD ${formatSignedUsdCompact(input.cvdNotional)}`
    const agrees =
      (leaning > 0 && signals.cvd.dir >= 0) ||
      (leaning < 0 && signals.cvd.dir <= 0) ||
      primary === 'PRICE_CVD_BEARISH_DIVERGENCE' ||
      primary === 'PRICE_CVD_BULLISH_DIVERGENCE' ||
      leaning === 0
    if (agrees) evidence.push(line)
    else counterEvidence.push(line)
  }

  if (isNum(input.volumeRatio)) {
    const line = `거래량 평균 대비 ${input.volumeRatio.toFixed(1)}배`
    if (signals.volumeElevated || leaning === 0) evidence.push(line)
    else if (input.volumeRatio < 1 && leaning !== 0) {
      counterEvidence.push(line)
    } else {
      evidence.push(line)
    }
  }

  if (signals.shortLiq && isNum(input.shortLiquidationNotional)) {
    const line = `숏 청산 ${formatSignedUsdCompact(input.shortLiquidationNotional)}`
    if (
      primary === 'SHORT_LIQUIDATION_DRIVEN' ||
      leaning > 0 ||
      leaning === 0
    ) {
      evidence.push(line)
    } else {
      counterEvidence.push(line)
    }
  }

  if (signals.longLiq && isNum(input.longLiquidationNotional)) {
    const line = `롱 청산 ${formatSignedUsdCompact(input.longLiquidationNotional)}`
    if (
      primary === 'LONG_LIQUIDATION_DRIVEN' ||
      leaning < 0 ||
      leaning === 0
    ) {
      evidence.push(line)
    } else {
      counterEvidence.push(line)
    }
  }

  if (isNum(input.buySharePct) && isNum(input.sellSharePct) && signals.cvd.present) {
    evidence.push(
      `Buy ${Math.round(input.buySharePct)}% / Sell ${Math.round(input.sellSharePct)}%`,
    )
  }

  if (isNum(input.fundingRate)) {
    const line = `Funding ${formatFundingRatePct(input.fundingRate)}`
    if (signals.fundingExtreme && leaning !== 0) {
      const fundingLeaning = Math.sign(input.fundingRate)
      if (fundingLeaning === leaning) counterEvidence.push(line)
      else if (fundingLeaning === -leaning) evidence.push(line)
      else counterEvidence.push(line)
    } else if (signals.fundingExtreme) {
      counterEvidence.push(line)
    }
  }

  return { evidence, counterEvidence }
}

/**
 * @param {object} input
 * @param {object} signals
 * @param {string} primary
 * @param {object} context
 */
function applyTimeframeContext(input, signals, primary, context) {
  const extraEvidence = []
  const extraCounter = []
  const leaning = stateLeaning(primary)
  if (leaning === 0) {
    return { extraEvidence, extraCounter, align1h: 0, align4h: 0 }
  }

  const lean1h = structureLeaning(context.timeframe1h, signals.price1h)
  const lean4h = structureLeaning(context.timeframe4h, signals.price4h)

  let align1h = 0
  let align4h = 0

  if (lean1h === leaning) {
    align1h = 1
    extraEvidence.push(
      `1시간 구조 ${context.timeframe1h === 'BULLISH' ? '상승' : '하락'}`,
    )
  } else if (lean1h === -leaning) {
    align1h = -1
    extraCounter.push(
      `1시간 구조 ${context.timeframe1h === 'BULLISH' ? '상승' : '하락'}`,
    )
  } else if (context.timeframe1h === 'RANGE') {
    extraCounter.push('1시간 구조 혼조')
  }

  if (lean4h === leaning) {
    align4h = 1
    extraEvidence.push(
      `4시간 구조 ${context.timeframe4h === 'BULLISH' ? '상승' : '하락'}`,
    )
  } else if (lean4h === -leaning) {
    align4h = -1
    extraCounter.push(
      `4시간 구조 ${context.timeframe4h === 'BEARISH' ? '하락' : '상승'}`,
    )
  } else if (context.timeframe4h === 'RANGE') {
    extraCounter.push('4시간 구조 혼조')
  }

  if (isNum(input.priceChange1h) && align1h === 0 && signals.price1h === -leaning) {
    extraCounter.push(`1시간 가격 ${formatSignedPct(input.priceChange1h)}`)
    align1h = -1
  }
  if (isNum(input.priceChange4h) && align4h === 0 && signals.price4h === -leaning) {
    extraCounter.push(`4시간 가격 ${formatSignedPct(input.priceChange4h)}`)
    align4h = -1
  }

  return { extraEvidence, extraCounter, align1h, align4h }
}

/**
 * @param {string} primary
 * @param {object} signals
 * @param {{ align1h: number, align4h: number }} alignment
 */
export function computeStrengthScore(primary, signals, alignment) {
  if (primary === 'DATA_INSUFFICIENT') return T.STRENGTH_INSUFFICIENT

  if (primary === 'MIXED') {
    const confirm = [signals.price15, signals.oi, signals.cvd.dir].filter(
      (v) => v !== 0,
    ).length
    const conflict =
      (signals.price15 !== 0 &&
        signals.cvd.dir !== 0 &&
        signals.price15 !== signals.cvd.dir) ||
      (signals.price15 !== 0 &&
        signals.oi !== 0 &&
        Math.sign(signals.price15) !== Math.sign(signals.oi) &&
        !(signals.oi < 0))
        ? 1
        : 0
    return clamp(T.STRENGTH_MIXED_BASE + confirm * 2 - conflict * 4, 0, 100)
  }

  let score = T.STRENGTH_CLASSIFIED_BASE

  if (isNum(signals.rawPriceAbs)) {
    const extra = Math.max(
      0,
      signals.rawPriceAbs / T.PRICE_CHANGE_PCT_15M - 1,
    )
    score += Math.min(T.STRENGTH_PRICE_MAGNITUDE_MAX, 4 + extra * 3)
  }

  const leaning = stateLeaning(primary)
  if (signals.oi !== 0 && (primary.includes('BUILDUP') || primary.includes('LIQUIDATION') || signals.oi === leaning || (primary.includes('SHORT_BUILDUP') && signals.oi > 0))) {
    score += T.STRENGTH_OI_CONFIRM
  } else if (signals.oi === leaning && leaning !== 0) {
    score += T.STRENGTH_OI_CONFIRM
  }

  if (signals.cvd.dir !== 0) {
    const cvdAgrees =
      primary.startsWith('PRICE_CVD_') ||
      (leaning > 0 && signals.cvd.dir > 0) ||
      (leaning < 0 && signals.cvd.dir < 0)
    if (cvdAgrees) score += T.STRENGTH_CVD_CONFIRM
    if (signals.cvd.large && cvdAgrees) score += T.STRENGTH_CVD_LARGE
  }

  if (signals.volumeElevated) score += T.STRENGTH_VOLUME_ELEVATED
  if (
    (primary === 'SHORT_LIQUIDATION_DRIVEN' && signals.shortLiq) ||
    (primary === 'LONG_LIQUIDATION_DRIVEN' && signals.longLiq)
  ) {
    score += T.STRENGTH_LIQUIDATION_CONFIRM
  }

  if (alignment.align1h > 0) score += T.STRENGTH_ALIGN_1H
  if (alignment.align1h < 0) score -= T.STRENGTH_OPPOSE_1H
  if (alignment.align4h > 0) score += T.STRENGTH_ALIGN_4H
  if (alignment.align4h < 0) score -= T.STRENGTH_OPPOSE_4H

  if (signals.fundingExtreme && leaning !== 0) {
    if (signals.fundingExtreme === leaning) {
      score -= T.STRENGTH_FUNDING_AGAINST
    }
  }

  return clamp(Math.round(score), 0, 100)
}

/**
 * 정규화된 snapshot 을 판정한다.
 *
 * @param {object} input
 */
export function evaluateMarketState(input = {}) {
  const evaluatedAt = input.evaluatedAt || new Date().toISOString()
  const symbol = input.symbol || null
  const signals = readMarketSignals(input)
  signals.rawPriceAbs = isNum(input.priceChange15m)
    ? Math.abs(input.priceChange15m)
    : null

  if (!signals.hasPrice || signals.usableCount < 2) {
    return {
      symbol,
      evaluatedAt,
      bucketStart: resolveMarketStateBucketStart(evaluatedAt),
      primaryState: 'DATA_INSUFFICIENT',
      secondaryStates: [],
      strengthScore: T.STRENGTH_INSUFFICIENT,
      evidence: signals.hasPrice
        ? [`15분 가격 ${formatSignedPct(input.priceChange15m)}`]
        : ['15분 가격 또는 보조 지표가 부족합니다.'],
      counterEvidence: [],
      context: resolveContext(input, signals),
      disclaimer: MARKET_STATE_DISCLAIMER,
    }
  }

  const candidates = collectCandidateStates(signals)
  const specific = candidates.filter(
    (code) => code !== 'BULLISH_PRESSURE' && code !== 'BEARISH_PRESSURE',
  )
  let primary = PRIMARY_PRIORITY.find((code) => candidates.includes(code))

  const hasConflict =
    signals.price15 !== 0 &&
    signals.cvd.present &&
    signals.cvd.dir !== 0 &&
    signals.cvd.dir !== signals.price15 &&
    !signals.cvd.large &&
    specific.length === 0

  if (!primary || hasConflict) {
    primary = 'MIXED'
  }

  const secondaryStates = candidates.filter(
    (code) =>
      code !== primary &&
      code !== 'MIXED' &&
      code !== 'DATA_INSUFFICIENT',
  )

  const context = resolveContext(input, signals)
  const { evidence, counterEvidence } = buildEvidence(input, signals, primary)
  const alignment = applyTimeframeContext(input, signals, primary, context)
  for (const line of alignment.extraEvidence) {
    if (!evidence.includes(line)) evidence.push(line)
  }
  for (const line of alignment.extraCounter) {
    if (!counterEvidence.includes(line)) counterEvidence.push(line)
  }

  const strengthScore = computeStrengthScore(primary, signals, alignment)

  return {
    symbol,
    evaluatedAt,
    bucketStart: resolveMarketStateBucketStart(evaluatedAt),
    primaryState: primary,
    secondaryStates,
    strengthScore,
    evidence,
    counterEvidence,
    context,
    disclaimer: MARKET_STATE_DISCLAIMER,
  }
}
