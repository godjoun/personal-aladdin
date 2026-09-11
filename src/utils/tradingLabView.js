/**
 * tradingLabView.js — Trading Lab 화면 표시 helper
 *
 * 데이터가 없는 상태를 숨기거나 임의값으로 채우지 않고
 * "데이터 연결 전"으로 명시한다.
 */

export const NOT_CONNECTED_LABEL = '데이터 연결 전'
export const NOT_COLLECTED_LABEL = '데이터 수집 전'
export const NO_DATA_LABEL = '—'
export const LIQUIDATION_COLLECTING_LABEL = '수집 중 · 아직 관측된 청산 없음'
export const LIQUIDATION_RECONNECTING_LABEL = '청산 스트림 재연결 중'

const BIAS_LABELS = {
  LONG: 'LONG BIAS',
  SHORT: 'SHORT BIAS',
  NEUTRAL: 'NEUTRAL',
}

const STRUCTURE_LABELS = {
  BULLISH: '상승 구조 가능성',
  BEARISH: '하락 구조 가능성',
  RANGE: '혼조',
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
 * @param {{ digits?: number, prefix?: string }} [options]
 */
export function formatUsdValue(value, options = {}) {
  const { digits = 2, prefix = '$' } = options
  const formatted = formatPriceValue(value, { digits })
  if (formatted === NO_DATA_LABEL) return NO_DATA_LABEL
  return `${prefix}${formatted}`
}

/**
 * 추정 청산 금액 표시. 실제 계좌 손실이 아니다.
 *
 * @param {number | null | undefined} value
 */
export function formatCompactUsd(value) {
  if (value === null || value === undefined || value === '') return NO_DATA_LABEL
  const num = Number(value)
  if (!Number.isFinite(num)) return NO_DATA_LABEL
  const abs = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return formatUsdValue(num)
}

/**
 * @param {{ count?: number, estimatedNotional?: number } | null | undefined} side
 */
export function formatObservedLiquidationSide(side) {
  const count = Number(side?.count) || 0
  const notional = Number(side?.estimatedNotional) || 0
  return `${formatCompactUsd(notional)} · ${count}건`
}

/**
 * @param {object | null | undefined} collector
 * @param {{ long?: { count?: number }, short?: { count?: number } } | null | undefined} summary
 */
export function getObservedLiquidationStatus(collector, summary) {
  const eventCount =
    (Number(summary?.long?.count) || 0) + (Number(summary?.short?.count) || 0)
  if (eventCount > 0) return 'HAS_DATA'
  if (collector?.connected) return 'COLLECTING'
  return 'RECONNECTING'
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
  const formatted = num.toFixed(digits)
  // -0.0% 같이 반올림 후 0이 되는 값은 부호 없이 0으로 표시
  if (Number(formatted) === 0) {
    return `${(0).toFixed(digits)}${suffix}`
  }
  const sign = num > 0 ? '+' : ''
  return `${sign}${formatted}${suffix}`
}

/**
 * Bybit funding rate(소수) → 퍼센트 표시.
 * 0.0001 → +0.0100%
 *
 * @param {{ status?: string, value?: number | null } | null | undefined} metric
 * @param {{ digits?: number }} [options]
 */
export function formatFundingMetric(metric, options = {}) {
  const { digits = 4 } = options
  if (!metric) return NOT_CONNECTED_LABEL
  if (metric.value === null || metric.value === undefined) {
    return metric.status === 'OK' ? NO_DATA_LABEL : NOT_CONNECTED_LABEL
  }
  const num = Number(metric.value)
  if (!Number.isFinite(num)) return NO_DATA_LABEL
  const pct = num * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(digits)}%`
}

/**
 * @param {number | null | undefined} ratio
 */
export function formatVolumeRatio(ratio) {
  if (ratio === null || ratio === undefined) return null
  const num = Number(ratio)
  if (!Number.isFinite(num)) return null
  return `평균 대비 ${num.toFixed(1)}배`
}

/**
 * @param {string | null | undefined} iso
 */
export function formatFundingClock(iso) {
  if (!iso) return NO_DATA_LABEL
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return NO_DATA_LABEL
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 서버 metric ({ status, value }) 을 표시 문자열로 변환한다.
 *
 * @param {{ status?: string, value?: number | null } | null | undefined} metric
 * @param {{ digits?: number, suffix?: string, signed?: boolean, usd?: boolean }} [options]
 */
export function formatMetric(metric, options = {}) {
  if (!metric) return NOT_CONNECTED_LABEL
  if (metric.value === null || metric.value === undefined) {
    return metric.status === 'OK' ? NO_DATA_LABEL : NOT_CONNECTED_LABEL
  }
  const { suffix = '' } = options
  if (options.usd) {
    return `${formatUsdValue(metric.value, options)}${suffix}`
  }
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
 * @param {{ status?: string, stale?: boolean, message?: string | null } | null | undefined} market
 */
export function getMarketStatusLabel(market) {
  if (!market) return NOT_CONNECTED_LABEL
  if (market.stale) return '시장 데이터 일시 지연'
  if (market.status === 'OK') return '연결됨'
  if (market.status === 'PARTIAL') return '일부 연결'
  if (market.status === 'ERROR') return '조회 실패'
  return NOT_CONNECTED_LABEL
}

/**
 * @param {string | null | undefined} iso
 * @param {number} [nowMs]
 */
export function formatRelativeUpdatedAt(iso, nowMs = Date.now()) {
  if (!iso) return NO_DATA_LABEL
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return NO_DATA_LABEL
  const diff = Math.max(0, nowMs - date.getTime())
  if (diff < 15_000) return '방금 전'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}초 전`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  return formatAnalysisTimestamp(iso)
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
