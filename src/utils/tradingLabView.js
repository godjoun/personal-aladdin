/**
 * tradingLabView.js — Trading Lab 화면 표시 helper
 *
 * 데이터가 없는 상태를 숨기거나 임의값으로 채우지 않고
 * "데이터 연결 전"으로 명시한다.
 */

export const NOT_CONNECTED_LABEL = '데이터 연결 전'
export const NO_DATA_LABEL = '—'

const BIAS_LABELS = {
  LONG: 'LONG BIAS',
  SHORT: 'SHORT BIAS',
  NEUTRAL: 'NEUTRAL',
}

const STRUCTURE_LABELS = {
  BULLISH: '상승 구조',
  BEARISH: '하락 구조',
  RANGE: '횡보',
  UNKNOWN: '확인 필요',
}

const OUTCOME_LABELS = {
  SUCCESS: '성공',
  FAILURE: '실패',
  NEUTRAL: '중립',
  UNRESOLVED: '미확정',
}

/**
 * @param {string | null | undefined} bias
 */
export function getBiasLabel(bias) {
  return BIAS_LABELS[bias] || NO_DATA_LABEL
}

/**
 * @param {string | null | undefined} bias
 */
export function getBiasModifier(bias) {
  if (bias === 'LONG') return 'long'
  if (bias === 'SHORT') return 'short'
  if (bias === 'NEUTRAL') return 'neutral'
  return 'unknown'
}

/**
 * @param {string | null | undefined} state
 */
export function getStructureLabel(state) {
  if (!state) return NOT_CONNECTED_LABEL
  return STRUCTURE_LABELS[state] || STRUCTURE_LABELS.UNKNOWN
}

/**
 * @param {string | null | undefined} result
 */
export function getOutcomeLabel(result) {
  if (!result) return OUTCOME_LABELS.UNRESOLVED
  return OUTCOME_LABELS[result] || OUTCOME_LABELS.UNRESOLVED
}

/**
 * @param {number | null | undefined} value
 */
export function formatConfidence(value) {
  if (value === null || value === undefined) return NO_DATA_LABEL
  const num = Number(value)
  if (!Number.isFinite(num)) return NO_DATA_LABEL
  return `${Math.round(num)}%`
}

/**
 * @param {number | null | undefined} value
 * @param {{ digits?: number }} [options]
 */
export function formatPriceValue(value, options = {}) {
  const { digits = 2 } = options
  if (value === null || value === undefined || value === '') return NO_DATA_LABEL
  const num = Number(value)
  if (!Number.isFinite(num)) return NO_DATA_LABEL
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(num)
}

/**
 * @param {number | null | undefined} value
 * @param {{ digits?: number, suffix?: string }} [options]
 */
export function formatSignedValue(value, options = {}) {
  const { digits = 2, suffix = '' } = options
  if (value === null || value === undefined || value === '') return NO_DATA_LABEL
  const num = Number(value)
  if (!Number.isFinite(num)) return NO_DATA_LABEL
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(digits)}${suffix}`
}

/**
 * 서버 metric ({ status, value }) 을 표시 문자열로 변환한다.
 *
 * @param {{ status?: string, value?: number | null } | null | undefined} metric
 * @param {{ digits?: number, suffix?: string, signed?: boolean }} [options]
 */
export function formatMetric(metric, options = {}) {
  if (!metric) return NOT_CONNECTED_LABEL
  if (metric.value === null || metric.value === undefined) {
    return metric.status === 'OK' ? NO_DATA_LABEL : NOT_CONNECTED_LABEL
  }
  const { suffix = '' } = options
  const formatted = options.signed
    ? formatSignedValue(metric.value, options)
    : formatPriceValue(metric.value, options)
  return options.signed ? formatted : `${formatted}${suffix}`
}

/**
 * @param {{ configured?: boolean, status?: string } | null | undefined} market
 */
export function isMarketDataConnected(market) {
  return Boolean(market?.configured) && market?.status !== 'NOT_CONFIGURED'
}

/**
 * @param {{ status?: string } | null | undefined} market
 */
export function getMarketStatusLabel(market) {
  if (!market) return NOT_CONNECTED_LABEL
  if (market.status === 'OK') return '연결됨'
  if (market.status === 'PARTIAL') return '일부 연결'
  if (market.status === 'ERROR') return '조회 실패'
  return NOT_CONNECTED_LABEL
}

/**
 * @param {string | null | undefined} iso
 */
export function formatAnalysisTimestamp(iso) {
  if (!iso) return NO_DATA_LABEL
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return NO_DATA_LABEL

  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/**
 * 최근 분석 목록용 행 데이터
 *
 * @param {Array<object>} analyses
 */
export function buildRecentAnalysisRows(analyses) {
  if (!Array.isArray(analyses)) return []
  return analyses.map((analysis) => ({
    id: analysis.id,
    symbol: analysis.symbol,
    biasLabel: getBiasLabel(analysis.bias),
    biasModifier: getBiasModifier(analysis.bias),
    confidenceLabel: formatConfidence(analysis.confidence),
    createdAtLabel: formatAnalysisTimestamp(analysis.createdAt),
    outcomeLabel: getOutcomeLabel(analysis.outcome?.result),
    hasOutcome: Boolean(analysis.outcome),
  }))
}
