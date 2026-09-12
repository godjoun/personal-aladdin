/**
 * validate.js — Trading Lab API 입력 재검증
 *
 * 원칙
 * - symbol / timeframe / bias / result / sourceType 은 allowlist 만 통과.
 * - 시장 지표는 "없음(null)" 이 정상값이다. 빈 문자열/undefined → null 로 정규화.
 * - funding, cvd, OI 변화량은 음수가 정상이므로 부호를 제한하지 않는다.
 */

import {
  TRADING_LAB_BIAS_SET,
  TRADING_LAB_DATA_STATUS_SET,
  TRADING_LAB_LIQUIDATION_SIDE_SET,
  TRADING_LAB_OUTCOME_RESULT_SET,
  TRADING_LAB_SCREENSHOT_STATUS_SET,
  TRADING_LAB_CVD_WINDOW_SET,
  TRADING_LAB_LIQUIDATION_WINDOW_SET,
  TRADING_LAB_SOURCE_TYPE_SET,
  TRADING_LAB_STRUCTURE_SET,
  TRADING_LAB_SYMBOL_SET,
  TRADING_LAB_TIMEFRAME_SET,
  SHADOW_TRADE_DIRECTION_SET,
  SHADOW_TRADE_SOURCE_SET,
  SHADOW_TRADE_TAG_SET,
} from './constants.js'

const MAX_NOTE = 1000
const MAX_REASON_ITEM = 200
const MAX_REASON_ITEMS = 20
const MAX_SOURCE = 40
const MAX_IMAGE_REF = 300
const NUMERIC_LIMIT = 1e15
const MAX_LIST_LIMIT = 200

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string | null}
 */
function optionalText(value, max) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > max) return null
  return trimmed
}

/**
 * 부호 제한 없는 nullable 수치 (funding/cvd/OI 변화량 등)
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function asOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (Math.abs(n) > NUMERIC_LIMIT) return null
  return n
}

/**
 * 가격류 nullable 수치 — 음수 가격은 거부
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function asOptionalPrice(value) {
  const n = asOptionalNumber(value)
  if (n === null) return null
  if (n < 0) return null
  return n
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asLabSymbol(value) {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return TRADING_LAB_SYMBOL_SET.has(upper) ? upper : null
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asLabTimeframe(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return TRADING_LAB_TIMEFRAME_SET.has(normalized) ? normalized : null
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asBias(value) {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return TRADING_LAB_BIAS_SET.has(upper) ? upper : null
}

/**
 * 0~100 정수. 미입력(null) 허용.
 *
 * @param {unknown} value
 * @returns {number | null | undefined} undefined = 잘못된 값
 */
export function asConfidence(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  if (n < 0 || n > 100) return undefined
  return Math.round(n)
}

/**
 * @param {unknown} value
 * @returns {string | null | undefined} undefined = 잘못된 값
 */
export function asStructureState(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  const upper = value.trim().toUpperCase()
  return TRADING_LAB_STRUCTURE_SET.has(upper) ? upper : undefined
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asOutcomeResult(value) {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return TRADING_LAB_OUTCOME_RESULT_SET.has(upper) ? upper : null
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asLiquidationSide(value) {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return TRADING_LAB_LIQUIDATION_SIDE_SET.has(upper) ? upper : null
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asSourceType(value) {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return TRADING_LAB_SOURCE_TYPE_SET.has(upper) ? upper : null
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asDataStatus(value) {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return TRADING_LAB_DATA_STATUS_SET.has(upper) ? upper : null
}

/**
 * 근거/주의 목록 — 문자열 배열
 *
 * @param {unknown} value
 * @returns {string[] | undefined} undefined = 잘못된 값
 */
export function asReasonList(value) {
  if (value === null || value === undefined || value === '') return []
  if (!Array.isArray(value)) return undefined
  if (value.length > MAX_REASON_ITEMS) return undefined

  const out = []
  for (const item of value) {
    if (typeof item !== 'string') return undefined
    const trimmed = item.trim()
    if (!trimmed) continue
    if (trimmed.length > MAX_REASON_ITEM) return undefined
    out.push(trimmed)
  }
  return out
}

/**
 * ISO timestamp. 미입력 허용.
 *
 * @param {unknown} value
 * @returns {string | null | undefined} undefined = 잘못된 값
 */
export function asIsoTimestamp(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length > 40) return undefined
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

/**
 * 관측 청산 집계 window
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function asLiquidationWindow(value) {
  if (value === null || value === undefined || value === '') return '15m'
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return TRADING_LAB_LIQUIDATION_WINDOW_SET.has(normalized) ? normalized : null
}

/**
 * CVD 집계 window (5m / 15m / 1h / 4h)
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function asCvdWindow(value) {
  if (value === null || value === undefined || value === '') return '15m'
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return TRADING_LAB_CVD_WINDOW_SET.has(normalized) ? normalized : null
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number | null} null = 잘못된 값
 */
export function asListLimit(value, fallback = 20) {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIST_LIMIT) return null
  return n
}

/**
 * 분석 생성 입력 정규화
 *
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, field: string }}
 */
export function sanitizeAnalysisInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, field: 'body' }
  }

  const symbol = asLabSymbol(raw.symbol)
  if (!symbol) return { ok: false, field: 'symbol' }

  const bias = asBias(raw.bias)
  if (!bias) return { ok: false, field: 'bias' }

  const confidence = asConfidence(raw.confidence)
  if (confidence === undefined) return { ok: false, field: 'confidence' }

  const timeframe15m = asStructureState(raw.timeframe15m)
  if (timeframe15m === undefined) return { ok: false, field: 'timeframe15m' }
  const timeframe1h = asStructureState(raw.timeframe1h)
  if (timeframe1h === undefined) return { ok: false, field: 'timeframe1h' }
  const timeframe4h = asStructureState(raw.timeframe4h)
  if (timeframe4h === undefined) return { ok: false, field: 'timeframe4h' }

  const reasoning = asReasonList(raw.reasoning)
  if (reasoning === undefined) return { ok: false, field: 'reasoning' }
  const cautions = asReasonList(raw.cautions)
  if (cautions === undefined) return { ok: false, field: 'cautions' }

  const snapshotRaw =
    raw.marketSnapshot && typeof raw.marketSnapshot === 'object'
      ? raw.marketSnapshot
      : raw

  const marketDataStatus = raw.marketDataStatus
    ? asDataStatus(raw.marketDataStatus)
    : null
  if (raw.marketDataStatus && !marketDataStatus) {
    return { ok: false, field: 'marketDataStatus' }
  }

  return {
    ok: true,
    value: {
      symbol,
      bias,
      confidence,
      referencePrice: asOptionalPrice(raw.referencePrice),
      timeframe15m,
      timeframe1h,
      timeframe4h,
      reasoning,
      cautions,
      invalidationPrice: asOptionalPrice(raw.invalidationPrice),
      notes: optionalText(raw.notes, MAX_NOTE),
      marketSnapshot: {
        volume: asOptionalNumber(snapshotRaw.volume),
        volumeZScore: asOptionalNumber(snapshotRaw.volumeZScore),
        openInterest: asOptionalNumber(snapshotRaw.openInterest),
        openInterestChange: asOptionalNumber(snapshotRaw.openInterestChange),
        fundingRate: asOptionalNumber(snapshotRaw.fundingRate),
        cvd: asOptionalNumber(snapshotRaw.cvd),
        liquidationAbove: asOptionalPrice(snapshotRaw.liquidationAbove),
        liquidationBelow: asOptionalPrice(snapshotRaw.liquidationBelow),
      },
      marketDataStatus,
      marketDataSource: optionalText(raw.marketDataSource, MAX_SOURCE),
    },
  }
}

/**
 * 결과 기록 입력 정규화
 *
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, field: string }}
 */
export function sanitizeOutcomeInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, field: 'body' }
  }

  const result = raw.result == null ? 'UNRESOLVED' : asOutcomeResult(raw.result)
  if (!result) return { ok: false, field: 'result' }

  const evaluatedAt = asIsoTimestamp(raw.evaluatedAt)
  if (evaluatedAt === undefined) return { ok: false, field: 'evaluatedAt' }

  return {
    ok: true,
    value: {
      result,
      evaluatedAt,
      price1h: asOptionalPrice(raw.price1h),
      price4h: asOptionalPrice(raw.price4h),
      price12h: asOptionalPrice(raw.price12h),
      price24h: asOptionalPrice(raw.price24h),
      maxFavorableMove: asOptionalNumber(raw.maxFavorableMove),
      maxAdverseMove: asOptionalNumber(raw.maxAdverseMove),
      notes: optionalText(raw.notes, MAX_NOTE),
    },
  }
}

/**
 * 청산 snapshot 입력 정규화
 *
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, field: string }}
 */
export function sanitizeLiquidationInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, field: 'body' }
  }

  const symbol = asLabSymbol(raw.symbol)
  if (!symbol) return { ok: false, field: 'symbol' }

  const side = asLiquidationSide(raw.side)
  if (!side) return { ok: false, field: 'side' }

  const sourceType = raw.sourceType == null ? 'MANUAL' : asSourceType(raw.sourceType)
  if (!sourceType) return { ok: false, field: 'sourceType' }

  const timestamp = asIsoTimestamp(raw.timestamp)
  if (timestamp === undefined) return { ok: false, field: 'timestamp' }

  return {
    ok: true,
    value: {
      symbol,
      side,
      sourceType,
      timestamp,
      referencePrice: asOptionalPrice(raw.referencePrice),
      priceLevel: asOptionalPrice(raw.priceLevel),
      estimatedValue: asOptionalNumber(raw.estimatedValue),
      source: optionalText(raw.source, MAX_SOURCE),
      note: optionalText(raw.note, MAX_NOTE),
    },
  }
}

/**
 * 차트 캡처 metadata 입력 정규화 (이미지 바이트는 저장하지 않는다)
 *
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, field: string }}
 */
export function sanitizeScreenshotInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, field: 'body' }
  }

  const symbol = asLabSymbol(raw.symbol)
  if (!symbol) return { ok: false, field: 'symbol' }

  const timeframe = asLabTimeframe(raw.timeframe)
  if (!timeframe) return { ok: false, field: 'timeframe' }

  const capturedAt = asIsoTimestamp(raw.capturedAt)
  if (capturedAt === undefined) return { ok: false, field: 'capturedAt' }

  const status =
    raw.status == null
      ? 'PENDING'
      : typeof raw.status === 'string' &&
          TRADING_LAB_SCREENSHOT_STATUS_SET.has(raw.status.trim().toUpperCase())
        ? raw.status.trim().toUpperCase()
        : null
  if (!status) return { ok: false, field: 'status' }

  return {
    ok: true,
    value: {
      symbol,
      timeframe,
      capturedAt,
      status,
      note: optionalText(raw.note, MAX_NOTE),
      imageRef: optionalText(raw.imageRef, MAX_IMAGE_REF),
    },
  }
}

const SHADOW_TAG_ALIASES = Object.freeze({
  support: 'support',
  resistance: 'resistance',
  support_ob: 'support_ob',
  'support ob': 'support_ob',
  resistance_ob: 'resistance_ob',
  'resistance ob': 'resistance_ob',
  fvg: 'fvg',
  trendline: 'trendline',
  fakeout: 'fakeout',
  liquidity_sweep: 'liquidity_sweep',
  'liquidity sweep': 'liquidity_sweep',
  volume_divergence: 'volume_divergence',
  'volume divergence': 'volume_divergence',
  fomo: 'fomo',
  has_stop: 'has_stop',
  has_target: 'has_target',
  '손절 기준 있음': 'has_stop',
  '목표 기준 있음': 'has_target',
})

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asShadowDirection(value) {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return SHADOW_TRADE_DIRECTION_SET.has(upper) ? upper : null
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asShadowSource(value) {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return SHADOW_TRADE_SOURCE_SET.has(upper) ? upper : null
}

/**
 * @param {unknown} value
 * @returns {string[] | undefined} undefined = 잘못된 값
 */
export function asShadowTags(value) {
  if (value === null || value === undefined || value === '') return []
  if (!Array.isArray(value)) return undefined
  if (value.length > SHADOW_TRADE_TAG_SET.size) return undefined
  const out = []
  for (const item of value) {
    if (typeof item !== 'string') return undefined
    const key = item.trim().toLowerCase()
    if (!key) continue
    const normalized = SHADOW_TAG_ALIASES[key]
    if (!normalized || !SHADOW_TRADE_TAG_SET.has(normalized)) return undefined
    if (!out.includes(normalized)) out.push(normalized)
  }
  return out
}

/**
 * 가상 포지션 생성 입력
 *
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, field: string }}
 */
export function sanitizeShadowTradeInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, field: 'body' }
  }

  const symbol = asLabSymbol(raw.symbol)
  if (!symbol) return { ok: false, field: 'symbol' }

  const direction = asShadowDirection(raw.direction)
  if (!direction) return { ok: false, field: 'direction' }

  const source =
    raw.source == null ? 'MANUAL_USER' : asShadowSource(raw.source)
  if (!source) return { ok: false, field: 'source' }

  let entryPrice = null
  if (raw.entryPrice !== null && raw.entryPrice !== undefined && raw.entryPrice !== '') {
    entryPrice = asOptionalPrice(raw.entryPrice)
    if (entryPrice == null || entryPrice <= 0) {
      return { ok: false, field: 'entryPrice' }
    }
  }

  const userTags = asShadowTags(raw.userTags ?? raw.tags)
  if (userTags === undefined) return { ok: false, field: 'userTags' }

  const userNote = optionalText(raw.userNote ?? raw.note, MAX_NOTE)
  if (
    (raw.userNote != null && raw.userNote !== '' && userNote === null) ||
    (raw.note != null && raw.note !== '' && raw.userNote == null && userNote === null)
  ) {
    return { ok: false, field: 'userNote' }
  }

  return {
    ok: true,
    value: {
      symbol,
      direction,
      source,
      entryPrice,
      userTags,
      userNote,
      quick: raw.quick === true,
    },
  }
}

/**
 * 메모/태그 보강
 *
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, field: string }}
 */
export function sanitizeShadowTradePatch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, field: 'body' }
  }

  const hasNote = Object.prototype.hasOwnProperty.call(raw, 'userNote')
    || Object.prototype.hasOwnProperty.call(raw, 'note')
  const hasTags =
    Object.prototype.hasOwnProperty.call(raw, 'userTags')
    || Object.prototype.hasOwnProperty.call(raw, 'tags')
  if (!hasNote && !hasTags) return { ok: false, field: 'body' }

  /** @type {{ userNote?: string | null, userTags?: string[] }} */
  const value = {}
  if (hasNote) {
    const rawNote = raw.userNote ?? raw.note
    if (rawNote === null || rawNote === undefined || rawNote === '') {
      value.userNote = null
    } else {
      const userNote = optionalText(rawNote, MAX_NOTE)
      if (userNote === null) return { ok: false, field: 'userNote' }
      value.userNote = userNote
    }
  }
  if (hasTags) {
    const userTags = asShadowTags(raw.userTags ?? raw.tags)
    if (userTags === undefined) return { ok: false, field: 'userTags' }
    value.userTags = userTags
  }
  return { ok: true, value }
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: { autoRecord: boolean } } | { ok: false, field: string }}
 */
export function sanitizeShadowSettingsInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, field: 'body' }
  }
  if (typeof raw.autoRecord !== 'boolean') {
    return { ok: false, field: 'autoRecord' }
  }
  return { ok: true, value: { autoRecord: raw.autoRecord } }
}
