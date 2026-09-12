/**
 * chartAnnotationMatch.js — 현재 가격과 저장된 차트 표시의 근접 판정
 *
 * 자동 인식이 아니라 사용자가 저장한 구간만 본다.
 * 매수/매도 추천 문구는 만들지 않는다.
 */

import {
  CHART_ANNOTATION_LABELS,
  CHART_BOX_TYPE_SET,
  CHART_LINE_TYPE_SET,
} from './constants.js'

export const CHART_LINE_NEAR_PCT = 0.003
export const CHART_ZONE_NEAR_PCT = 0.005

const LONG_FAVORABLE = new Set([
  'SUPPORT',
  'SUPPORT_OB',
  'FVG',
  'LIQUIDITY_ZONE',
])
const SHORT_FAVORABLE = new Set([
  'RESISTANCE',
  'RESISTANCE_OB',
  'FVG',
  'LIQUIDITY_ZONE',
])

/**
 * @param {string | null | undefined} annotationType
 */
export function isChartLineType(annotationType) {
  return CHART_LINE_TYPE_SET.has(annotationType)
}

/**
 * @param {string | null | undefined} annotationType
 */
export function isChartBoxType(annotationType) {
  return CHART_BOX_TYPE_SET.has(annotationType)
}

/**
 * @param {string | null | undefined} annotationType
 */
export function getChartAnnotationLabel(annotationType) {
  return CHART_ANNOTATION_LABELS[annotationType] || annotationType || ''
}

function asPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

function priceNear(price, target, pct) {
  const left = asPrice(price)
  const right = asPrice(target)
  if (left == null || right == null) return false
  return Math.abs(left - right) / right <= pct
}

/**
 * @param {object} annotation
 * @param {number | null} price
 * @returns {{ relation: 'inside' | 'near' } | null}
 */
export function matchAnnotationToPrice(annotation, price) {
  const current = asPrice(price)
  if (!annotation || current == null) return null

  if (isChartLineType(annotation.annotationType)) {
    return priceNear(current, annotation.price, CHART_LINE_NEAR_PCT)
      ? { relation: 'near' }
      : null
  }

  if (!isChartBoxType(annotation.annotationType)) return null
  const top = asPrice(annotation.topPrice)
  const bottom = asPrice(annotation.bottomPrice)
  if (top == null || bottom == null) return null
  const lo = Math.min(top, bottom)
  const hi = Math.max(top, bottom)
  if (current >= lo && current <= hi) return { relation: 'inside' }

  const pct =
    annotation.annotationType === 'LIQUIDITY_ZONE'
      ? CHART_ZONE_NEAR_PCT
      : CHART_LINE_NEAR_PCT
  if (priceNear(current, lo, pct) || priceNear(current, hi, pct)) {
    return { relation: 'near' }
  }
  return null
}

/**
 * @param {string} annotationType
 * @param {'inside' | 'near'} relation
 * @param {string} direction
 */
export function formatChartAnnotationEvidence(annotationType, relation, direction) {
  const label = getChartAnnotationLabel(annotationType)
  const where = relation === 'inside' ? '안' : '근처'
  const favorable =
    direction === 'SHORT'
      ? SHORT_FAVORABLE.has(annotationType)
      : LONG_FAVORABLE.has(annotationType)
  return favorable
    ? `검토 가능 근거 · ${label} ${where}`
    : `근거로 감지됨 · ${label} ${where}`
}

/**
 * @param {{
 *   annotations?: object[],
 *   price?: number | null,
 *   direction?: string,
 * }} input
 */
export function matchChartAnnotations(input = {}) {
  const price = asPrice(input.price)
  const direction = input.direction === 'SHORT' ? 'SHORT' : 'LONG'
  const rows = Array.isArray(input.annotations) ? input.annotations : []
  const matched = []

  for (const annotation of rows) {
    if (!annotation || annotation.deletedAt) continue
    const hit = matchAnnotationToPrice(annotation, price)
    if (!hit) continue
    matched.push({
      id: annotation.id,
      annotationType: annotation.annotationType,
      timeframe: annotation.timeframe ?? null,
      label: getChartAnnotationLabel(annotation.annotationType),
      relation: hit.relation,
      evidence: formatChartAnnotationEvidence(
        annotation.annotationType,
        hit.relation,
        direction,
      ),
    })
  }

  return matched
}
