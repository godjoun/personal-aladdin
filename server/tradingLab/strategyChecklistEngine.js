/**
 * strategyChecklistEngine.js — My Strategy v1 기준 충족 점검
 *
 * 매수/매도 추천이 아니며 진입가·손절가·익절가를 제시하지 않는다.
 * 사용자가 고른 방향과 태그가 자기 기준에 얼마나 맞는지 점수화한다.
 */

import {
  STRATEGY_CHECK_DISCLAIMER,
  STRATEGY_CHECK_RESULT_LABELS,
  STRATEGY_CHECKLIST_VERSION,
  STRATEGY_SCORE_LABEL,
  SHADOW_OBSERVE_STATES,
} from './constants.js'
import { STRATEGY_CHECKLIST_THRESHOLDS as T } from './strategyChecklistThresholds.js'

const LONG_PRIMARY_TAGS = Object.freeze(['support', 'support_ob'])
const SHORT_PRIMARY_TAGS = Object.freeze(['resistance', 'resistance_ob'])
const CONTEXT_TAGS = Object.freeze(['fvg', 'trendline'])
const OBSERVE_TAGS = Object.freeze(['fakeout', 'liquidity_sweep'])

function asFinite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function hasTag(tags, tag) {
  return Array.isArray(tags) && tags.includes(tag)
}

/**
 * @param {string} direction
 * @param {string | null | undefined} structure
 * @returns {'aligned' | 'mixed' | 'opposite' | 'unknown'}
 */
export function structureAlignment(direction, structure) {
  if (!structure || structure === 'UNKNOWN') return 'unknown'
  if (structure === 'RANGE') return 'mixed'
  if (direction === 'LONG') return structure === 'BULLISH' ? 'aligned' : 'opposite'
  if (direction === 'SHORT') return structure === 'BEARISH' ? 'aligned' : 'opposite'
  return 'unknown'
}

function clamp(score, max) {
  return Math.max(0, Math.min(max, score))
}

function formatVolumeEvidence(volumeRatio) {
  const value = asFinite(volumeRatio)
  if (value == null) return null
  return `거래량 평균 대비 ${value.toFixed(1)}배`
}

/**
 * @param {{
 *   direction: string,
 *   selectedTags?: string[],
 *   assembled?: object,
 *   primaryState?: string | null,
 *   sameDirectionCount30m?: number,
 *   recentClosedResults?: string[],
 * }} input
 */
export function evaluateStrategyChecklist(input) {
  const direction = input.direction === 'SHORT' ? 'SHORT' : 'LONG'
  const tags = Array.isArray(input.selectedTags) ? [...input.selectedTags] : []
  const assembled = input.assembled || {}
  const missingItems = []
  const confirmedEvidence = []
  const riskWarnings = []

  const tf4h = structureAlignment(direction, assembled.structure4h)
  const tf1h = structureAlignment(direction, assembled.structure1h)
  const tf15m = structureAlignment(direction, assembled.structure15m)
  const riseWord = direction === 'LONG' ? '상승' : '하락'

  let htf = 0
  if (tf4h === 'aligned') {
    htf += T.HTF_4H_ALIGNED
    confirmedEvidence.push(`4H 구조가 ${riseWord} 쪽에 가깝습니다`)
  } else if (tf4h === 'mixed') {
    htf += T.HTF_4H_MIXED
    confirmedEvidence.push('4H 구조는 혼조입니다')
  } else {
    missingItems.push(`4H 구조가 아직 명확히 ${riseWord}이 아닙니다.`)
  }

  if (tf1h === 'aligned') {
    htf += T.HTF_1H_ALIGNED
    confirmedEvidence.push(`1H 구조가 ${riseWord} 쪽에 가깝습니다`)
  } else if (tf1h === 'mixed') {
    htf += T.HTF_1H_MIXED
    confirmedEvidence.push('1H 구조는 혼조입니다')
  } else {
    missingItems.push(`1H 구조가 아직 명확히 ${riseWord}이 아닙니다.`)
  }

  if (tf4h === 'aligned' && tf1h === 'aligned') {
    htf += T.HTF_BOTH_ALIGNED_BONUS
    confirmedEvidence.push('큰 흐름이 선택 방향과 맞습니다')
  } else if (tf4h === 'opposite') {
    missingItems.push('큰 흐름이 선택 방향과 반대로 보입니다.')
  }
  htf = clamp(htf, T.HTF_MAX)

  const primaryTags = direction === 'LONG' ? LONG_PRIMARY_TAGS : SHORT_PRIMARY_TAGS
  let location = 0
  let primaryCount = 0
  for (const tag of primaryTags) {
    if (hasTag(tags, tag)) {
      location += T.LOCATION_PRIMARY
      primaryCount += 1
      confirmedEvidence.push(
        tag === 'support'
          ? 'support 태그 선택됨'
          : tag === 'support_ob'
            ? 'support OB 태그 선택됨'
            : tag === 'resistance'
              ? 'resistance 태그 선택됨'
              : 'resistance OB 태그 선택됨',
      )
    }
  }
  for (const tag of CONTEXT_TAGS) {
    if (hasTag(tags, tag)) {
      location += T.LOCATION_CONTEXT
      confirmedEvidence.push(
        tag === 'fvg' ? 'FVG 태그 선택됨' : 'trendline 태그 선택됨',
      )
    }
  }
  for (const tag of OBSERVE_TAGS) {
    if (hasTag(tags, tag)) {
      location += T.LOCATION_OBSERVE
      confirmedEvidence.push(
        tag === 'fakeout'
          ? 'fakeout 태그 선택됨 · 주의 관찰'
          : 'liquidity sweep 태그 선택됨 · 주의 관찰',
      )
    }
  }
  if (primaryCount === 0 && !CONTEXT_TAGS.some((tag) => hasTag(tags, tag))) {
    missingItems.push(
      direction === 'LONG'
        ? '진입 위치(support / support OB / FVG / trendline)가 없습니다.'
        : '진입 위치(resistance / resistance OB / FVG / trendline)가 없습니다.',
    )
  }
  location = clamp(location, T.LOCATION_MAX)

  let market = 0
  if (tf15m === 'aligned') {
    market += T.MARKET_15M_ALIGNED
    confirmedEvidence.push('15m 가격 흐름이 선택 방향과 맞습니다')
  } else if (tf15m === 'mixed') {
    market += T.MARKET_15M_MIXED
  } else {
    missingItems.push('15m 가격 흐름이 선택 방향과 아직 맞지 않습니다.')
  }

  const cvd = asFinite(assembled.cvdNotional)
  const buyShare = asFinite(assembled.buySharePct)
  const sellShare = asFinite(assembled.sellSharePct)
  const cvdAligned =
    direction === 'LONG'
      ? (cvd != null && cvd > 0) || (buyShare != null && buyShare >= T.BUY_SHARE_OK)
      : (cvd != null && cvd < 0) || (sellShare != null && sellShare >= T.SELL_SHARE_OK)
  if (cvdAligned) {
    market += T.MARKET_CVD_ALIGNED
    confirmedEvidence.push(
      direction === 'LONG' ? 'CVD 매수 우세' : 'CVD 매도 우세',
    )
  } else if (cvd != null || buyShare != null) {
    missingItems.push('CVD 방향이 선택 방향과 다릅니다.')
  }

  const volumeRatio = asFinite(assembled.volumeRatio)
  if (volumeRatio != null && volumeRatio >= T.VOLUME_RATIO_OK) {
    market += T.MARKET_VOLUME_OK
    const volumeEvidence = formatVolumeEvidence(volumeRatio)
    if (volumeEvidence) confirmedEvidence.push(volumeEvidence)
  } else if (volumeRatio != null) {
    missingItems.push('거래량이 평균보다 부족합니다.')
  }

  const oiChange = asFinite(assembled.oiChangePct)
  const priceChange =
    asFinite(assembled.priceChange15m) ?? asFinite(assembled.priceChange1h)
  if (oiChange != null && oiChange >= T.OI_CHANGE_OK && priceChange != null) {
    const oiAligned =
      (direction === 'LONG' && priceChange > 0)
      || (direction === 'SHORT' && priceChange < 0)
    if (oiAligned) {
      market += T.MARKET_OI_ALIGNED
      confirmedEvidence.push(
        direction === 'LONG'
          ? 'OI 증가와 가격 상승이 함께 보입니다'
          : 'OI 증가와 가격 하락이 함께 보입니다',
      )
    } else {
      missingItems.push('OI 증가와 가격 방향이 같지 않습니다.')
    }
  }

  const funding = asFinite(assembled.fundingRate)
  if (funding != null && Math.abs(funding) < T.FUNDING_EXTREME) {
    market += T.MARKET_FUNDING_OK
  }

  const liquidationWatch = SHADOW_OBSERVE_STATES.includes(input.primaryState)
  if (liquidationWatch) {
    riskWarnings.push('청산 주도 움직임은 주의 관찰입니다. 추격 진입으로 단정하지 않습니다.')
  }
  market = clamp(market, T.MARKET_MAX)

  const hasStop = hasTag(tags, 'has_stop')
  const hasTarget = hasTag(tags, 'has_target')
  const hasFomo = hasTag(tags, 'fomo')
  let risk = 0
  if (hasStop) {
    risk += T.RISK_HAS_STOP
    confirmedEvidence.push('손절 기준 있음')
  } else {
    missingItems.push('손절 기준이 없습니다.')
    riskWarnings.push('손절 기준이 없습니다.')
  }
  if (hasTarget) {
    risk += T.RISK_HAS_TARGET
    confirmedEvidence.push('목표 기준 있음')
  } else {
    missingItems.push('목표 기준이 없습니다.')
  }
  if (!hasFomo) {
    risk += T.RISK_NO_FOMO
  } else {
    riskWarnings.push('FOMO 태그가 선택되어 있습니다.')
  }
  risk = clamp(risk, T.RISK_MAX)

  const sameDirectionCount30m = Number(input.sameDirectionCount30m) || 0
  const excessiveReentry = sameDirectionCount30m >= T.REENTRY_MAX
  if (excessiveReentry) {
    riskWarnings.push('최근 30분 같은 방향 Shadow Trade 가 과다합니다.')
  }

  const recentClosed = Array.isArray(input.recentClosedResults)
    ? input.recentClosedResults.slice(0, T.CONSECUTIVE_LOSS_MIN)
    : []
  const consecutiveLoss =
    recentClosed.length >= T.CONSECUTIVE_LOSS_MIN
    && recentClosed.every((item) => item === 'LOSS')
  if (consecutiveLoss) {
    riskWarnings.push('최근 완료 Shadow Trade 가 연속 LOSS 입니다.')
  }

  const score = htf + location + market + risk
  let result = 'NOT_READY'
  if (hasFomo || !hasStop || excessiveReentry || consecutiveLoss) {
    result = 'RISK_HIGH'
  } else if (score >= T.READY_MIN) {
    result = 'READY'
  }

  return {
    strategyVersion: STRATEGY_CHECKLIST_VERSION,
    direction,
    score,
    result,
    resultLabel: STRATEGY_CHECK_RESULT_LABELS[result],
    scoreLabel: STRATEGY_SCORE_LABEL,
    categories: {
      higherTimeframe: { label: '큰 흐름', score: htf, max: T.HTF_MAX },
      location: { label: '진입 위치', score: location, max: T.LOCATION_MAX },
      market: { label: '시장 확인', score: market, max: T.MARKET_MAX },
      risk: { label: '리스크 관리', score: risk, max: T.RISK_MAX },
    },
    selectedTags: tags,
    missingItems,
    confirmedEvidence,
    riskWarnings,
    autoEvidence: {
      structure4h: assembled.structure4h ?? null,
      structure1h: assembled.structure1h ?? null,
      structure15m: assembled.structure15m ?? null,
      priceChange15m: asFinite(assembled.priceChange15m),
      cvdNotional: cvd,
      buySharePct: buyShare,
      sellSharePct: sellShare,
      oiChangePct: oiChange,
      volumeRatio,
      fundingRate: funding,
      longLiquidationNotional: asFinite(assembled.longLiquidationNotional),
      shortLiquidationNotional: asFinite(assembled.shortLiquidationNotional),
      primaryState: input.primaryState ?? null,
      sameDirectionCount30m,
      recentClosedResults: Array.isArray(input.recentClosedResults)
        ? input.recentClosedResults
        : [],
      liquidationWatch,
    },
    disclaimer: STRATEGY_CHECK_DISCLAIMER,
  }
}

/**
 * @param {object} evaluation
 */
export function buildStrategyShadowNote(evaluation) {
  const resultLabel = evaluation.resultLabel || STRATEGY_CHECK_RESULT_LABELS[evaluation.result]
  return `My Strategy v1 ${evaluation.direction} · ${resultLabel} · ${STRATEGY_SCORE_LABEL} ${evaluation.score}/100`
}
