/**
 * shadowRecordType.js — 가상 기록 분류 (기준 / 충동 / 관찰)
 *
 * 화면 표시와 통계용이다. 실제 주문 판단이 아니다.
 */

export const SHADOW_RECORD_TYPES = Object.freeze([
  'STRATEGY',
  'IMPULSE',
  'OBSERVATION',
])

export const SHADOW_RECORD_TYPE_SET = new Set(SHADOW_RECORD_TYPES)

export const SHADOW_RECORD_TYPE_LABELS = Object.freeze({
  STRATEGY: '기준 기록',
  IMPULSE: '충동 기록',
  OBSERVATION: '관찰 기록',
})

const LOW_SCORE_MAX = 50

/**
 * @param {{
 *   result?: string | null,
 *   selectedTags?: string[] | null,
 *   userTags?: string[] | null,
 *   score?: number | null,
 * }} [input]
 * @returns {'STRATEGY' | 'IMPULSE' | 'OBSERVATION'}
 */
export function classifyShadowRecordType(input = {}) {
  const result = input.result || null
  const tags = Array.isArray(input.selectedTags)
    ? input.selectedTags
    : Array.isArray(input.userTags)
      ? input.userTags
      : []
  const hasFomo = tags.includes('fomo')
  const hasStop = tags.includes('has_stop')
  const hasTarget = tags.includes('has_target')
  const score = Number(input.score)
  const lowScore = Number.isFinite(score) && score < LOW_SCORE_MAX

  if (result === 'READY' && !hasFomo && hasStop && hasTarget) {
    return 'STRATEGY'
  }
  if (result === 'RISK_HIGH' || hasFomo || !hasStop) {
    return 'IMPULSE'
  }
  if (result === 'NOT_READY') {
    return 'OBSERVATION'
  }
  if (lowScore) return 'IMPULSE'
  return 'OBSERVATION'
}

/**
 * @param {string | null | undefined} recordType
 */
export function getShadowRecordTypeLabel(recordType) {
  return SHADOW_RECORD_TYPE_LABELS[recordType] || SHADOW_RECORD_TYPE_LABELS.OBSERVATION
}
