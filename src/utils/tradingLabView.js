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
export const CVD_COLLECTING_LABEL = '수집 중 · 데이터 부족'
export const CVD_RECONNECTING_LABEL = '연결 끊김 · 재연결 중'
export const CVD_OK_LABEL = '정상'
export const CVD_SOURCE_LABEL = 'Bybit 관측 체결 기준'
export const MARKET_STATE_DISCLAIMER =
  '시장 관찰 지표이며 매수·매도 추천이 아닙니다.'
export const SHADOW_TRADE_DISCLAIMER =
  '가상 계산이며 실제 체결과 다를 수 있습니다. 실제 주문은 없습니다.'
export const SHADOW_QUICK_SECTION_HINT =
  '실제 주문 없이 현재 시장 상태를 기준으로 가상 진입만 기록합니다.'
export const SHADOW_QUICK_HINT =
  '먼저 1초 기록하고, 이유는 나중에 보강해도 됩니다.'
export const SHADOW_QUICK_TAGS = Object.freeze([
  'support',
  'resistance',
  'support_ob',
  'resistance_ob',
  'fvg',
  'trendline',
  'fakeout',
  'liquidity_sweep',
  'volume_divergence',
  'fomo',
])

const MARKET_STATE_LABELS = {
  BULLISH_PRESSURE: '상승 압력 확대 가능성',
  BEARISH_PRESSURE: '하락 압력 확대 가능성',
  NEW_LONG_BUILDUP: '신규 롱 유입 가능성',
  NEW_SHORT_BUILDUP: '신규 숏 유입 가능성',
  SHORT_LIQUIDATION_DRIVEN: '숏 청산 영향 상승 가능성',
  LONG_LIQUIDATION_DRIVEN: '롱 청산 영향 하락 가능성',
  PRICE_CVD_BEARISH_DIVERGENCE: '가격 상승 대비 매수 체결 확인 약함',
  PRICE_CVD_BULLISH_DIVERGENCE: '가격 하락 대비 매도 체결 확인 약함',
  MIXED: '방향 불명확',
  DATA_INSUFFICIENT: '데이터 부족',
}

const MARKET_STATE_SHORT_LABELS = {
  BULLISH_PRESSURE: '상승 압력',
  BEARISH_PRESSURE: '하락 압력',
  NEW_LONG_BUILDUP: '신규 롱 유입 가능성',
  NEW_SHORT_BUILDUP: '신규 숏 유입 가능성',
  SHORT_LIQUIDATION_DRIVEN: '숏 청산 영향',
  LONG_LIQUIDATION_DRIVEN: '롱 청산 영향',
  PRICE_CVD_BEARISH_DIVERGENCE: '가격-CVD 약세 다이버전스',
  PRICE_CVD_BULLISH_DIVERGENCE: '가격-CVD 강세 다이버전스',
  MIXED: '혼조',
  DATA_INSUFFICIENT: '데이터 부족',
}

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
 * @param {string | null | undefined} state
 */
export function getMarketStateLabel(state) {
  if (!state) return NO_DATA_LABEL
  return MARKET_STATE_LABELS[state] || NO_DATA_LABEL
}

/**
 * @param {string | null | undefined} state
 */
export function getMarketStateShortLabel(state) {
  if (!state) return NO_DATA_LABEL
  return MARKET_STATE_SHORT_LABELS[state] || getMarketStateLabel(state)
}

/**
 * @param {string | null | undefined} state
 */
export function getMarketStateModifier(state) {
  if (
    state === 'BULLISH_PRESSURE' ||
    state === 'NEW_LONG_BUILDUP' ||
    state === 'SHORT_LIQUIDATION_DRIVEN' ||
    state === 'PRICE_CVD_BULLISH_DIVERGENCE'
  ) {
    return 'bullish'
  }
  if (
    state === 'BEARISH_PRESSURE' ||
    state === 'NEW_SHORT_BUILDUP' ||
    state === 'LONG_LIQUIDATION_DRIVEN' ||
    state === 'PRICE_CVD_BEARISH_DIVERGENCE'
  ) {
    return 'bearish'
  }
  if (state === 'MIXED') return 'mixed'
  if (state === 'DATA_INSUFFICIENT') return 'insufficient'
  return 'unknown'
}

/**
 * 신호 강도. 확률이 아니므로 % 를 붙이지 않는다.
 *
 * @param {number | null | undefined} value
 */
export function formatSignalStrength(value) {
  if (value === null || value === undefined) return NO_DATA_LABEL
  const num = Number(value)
  if (!Number.isFinite(num)) return NO_DATA_LABEL
  return `신호 강도 ${Math.round(num)} / 100`
}

/**
 * @param {string | null | undefined} iso
 */
export function formatMarketStateClock(iso) {
  if (!iso) return NO_DATA_LABEL
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return NO_DATA_LABEL
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * @param {Array<object> | null | undefined} observations
 */
export function buildMarketStateHistoryRows(observations) {
  if (!Array.isArray(observations)) return []
  return observations.map((item) => ({
    id: item.id,
    evaluatedAt: item.evaluatedAt,
    timeLabel: formatMarketStateClock(item.evaluatedAt || item.bucketStart),
    stateLabel: getMarketStateShortLabel(item.primaryState),
    strength: Number.isFinite(Number(item.strengthScore))
      ? Math.round(Number(item.strengthScore))
      : null,
  }))
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
 */
export function formatSignedCompactUsd(value) {
  if (value === null || value === undefined || value === '') return NO_DATA_LABEL
  const num = Number(value)
  if (!Number.isFinite(num)) return NO_DATA_LABEL
  if (num > 0) return `+${formatCompactUsd(num)}`
  return formatCompactUsd(num)
}

/**
 * @param {number | null | undefined} value
 */
export function formatSharePct(value) {
  if (value === null || value === undefined || value === '') return NO_DATA_LABEL
  const num = Number(value)
  if (!Number.isFinite(num)) return NO_DATA_LABEL
  return `${Math.round(num)}%`
}

/**
 * @param {object | null | undefined} collector
 * @param {{ tradeCount?: number, buyVolume?: number, sellVolume?: number } | null | undefined} summary
 */
export function getCvdCollectorStatus(collector, summary) {
  const tradeCount = Number(summary?.tradeCount) || 0
  const volume = (Number(summary?.buyVolume) || 0) + (Number(summary?.sellVolume) || 0)
  if (tradeCount > 0 || volume > 0) return 'HAS_DATA'
  if (collector?.connected) return 'COLLECTING'
  return 'RECONNECTING'
}

/**
 * CVD 해석. LONG/SHORT 추천이 아니다.
 *
 * @param {{ cvd?: number | null, priceChange?: number | null }} input
 */
export function getCvdInterpretation(input = {}) {
  const cvd = Number(input.cvd)
  const priceChange = Number(input.priceChange)
  const hasCvd = typeof input.cvd === 'number' && Number.isFinite(cvd)
  const hasPrice =
    typeof input.priceChange === 'number' && Number.isFinite(priceChange)

  if (!hasCvd) {
    return {
      code: 'CVD_INSUFFICIENT_DATA',
      label: '데이터 부족',
      detail: 'Bybit 관측 체결 기준 CVD 데이터가 없습니다.',
    }
  }
  if (cvd > 0 && hasPrice && priceChange > 0) {
    return {
      code: 'CVD_PRICE_UP_WITH_BUY',
      label: '가격 상승과 매수 체결이 함께 증가',
      detail: '가격과 Bybit 관측 CVD가 함께 올랐습니다.',
    }
  }
  if (cvd < 0 && hasPrice && priceChange > 0) {
    return {
      code: 'CVD_PRICE_UP_WEAK_BUY',
      label: '가격 상승 대비 매수 체결 확인 약함',
      detail: '가격은 올랐지만 Bybit 관측 CVD는 하락했습니다.',
    }
  }
  if (cvd > 0) {
    return {
      code: 'CVD_BUY_PRESSURE',
      label: '공격적 매수 체결 우세 가능성',
      detail: 'Bybit 관측 체결 기준 CVD가 상승했습니다.',
    }
  }
  if (cvd < 0) {
    return {
      code: 'CVD_SELL_PRESSURE',
      label: '공격적 매도 체결 우세 가능성',
      detail: 'Bybit 관측 체결 기준 CVD가 하락했습니다.',
    }
  }
  return {
    code: 'CVD_NEUTRAL',
    label: 'CVD 방향 확인 어려움',
    detail: 'Bybit 관측 체결 기준 CVD 변화가 작습니다.',
  }
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

const SHADOW_TAG_LABELS = {
  support: 'support',
  resistance: 'resistance',
  support_ob: 'support OB',
  resistance_ob: 'resistance OB',
  fvg: 'FVG',
  trendline: 'trendline',
  fakeout: 'fakeout',
  liquidity_sweep: 'liquidity sweep',
  volume_divergence: 'volume divergence',
  fomo: 'FOMO',
}

const SHADOW_RESULT_LABELS = {
  WIN: 'WIN',
  LOSS: 'LOSS',
  NEUTRAL: 'NEUTRAL',
  UNRESOLVED: '미확정',
}

/**
 * @param {string | null | undefined} tag
 */
export function getShadowTagLabel(tag) {
  return SHADOW_TAG_LABELS[tag] || tag || NO_DATA_LABEL
}

/**
 * @param {string | null | undefined} result
 */
export function getShadowResultLabel(result) {
  return SHADOW_RESULT_LABELS[result] || SHADOW_RESULT_LABELS.UNRESOLVED
}

/**
 * @param {number | null | undefined} value
 */
export function formatShadowPrice(value) {
  if (value === null || value === undefined) return NO_DATA_LABEL
  const num = Number(value)
  if (!Number.isFinite(num)) return NO_DATA_LABEL
  return `$${formatPriceValue(num)}`
}

/**
 * @param {number | null | undefined} value
 */
export function formatShadowReturnPct(value, fallback = '대기') {
  if (value === null || value === undefined) return fallback
  return formatSignedValue(value, { digits: 1, suffix: '%' })
}

/**
 * @param {object | null | undefined} outcome
 * @param {'1h'|'4h'|'12h'|'24h'} horizon
 */
export function formatShadowHorizon(outcome, horizon) {
  const key = {
    '1h': 'return1hPct',
    '4h': 'return4hPct',
    '12h': 'return12hPct',
    '24h': 'return24hPct',
  }[horizon]
  const value = outcome?.[key]
  if (value === null || value === undefined) return `${horizon} 대기`
  return `${horizon} ${formatSignedValue(value, { digits: 1, suffix: '%' })}`
}

/**
 * @param {Array<object> | null | undefined} trades
 */
export function splitShadowTrades(trades) {
  const list = Array.isArray(trades) ? trades : []
  return {
    open: list.filter((item) => item.status === 'OPEN' || item.status === 'EVALUATING'),
    closed: list.filter((item) => item.status === 'CLOSED'),
  }
}

/**
 * @param {object | null | undefined} stats
 */
export function formatShadowResultShare(stats) {
  if (!stats) return NO_DATA_LABEL
  const share = stats.resultShare || {}
  return `완료 결과 비율 WIN ${share.WIN || 0} · LOSS ${share.LOSS || 0} · NEUTRAL ${share.NEUTRAL || 0}`
}
