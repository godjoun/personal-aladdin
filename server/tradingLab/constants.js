/**
 * Trading Lab — 허용 심볼·바이어스·타임프레임 상수
 *
 * 분석/기록 전용. 주문·매매 관련 상수는 두지 않는다.
 */

export const TRADING_LAB_SYMBOLS = Object.freeze(['BTCUSDT', 'ETHUSDT'])

export const TRADING_LAB_BIASES = Object.freeze(['LONG', 'SHORT', 'NEUTRAL'])

export const TRADING_LAB_OUTCOME_RESULTS = Object.freeze([
  'SUCCESS',
  'FAILURE',
  'NEUTRAL',
  'UNRESOLVED',
])

export const TRADING_LAB_TIMEFRAMES = Object.freeze(['15m', '1h', '4h', '12h', '1d'])

export const TRADING_LAB_STRUCTURE_STATES = Object.freeze([
  'BULLISH',
  'BEARISH',
  'RANGE',
  'UNKNOWN',
])

export const TRADING_LAB_LIQUIDATION_SIDES = Object.freeze(['LONG', 'SHORT'])

export const TRADING_LAB_SOURCE_TYPES = Object.freeze([
  'EXTERNAL',
  'ESTIMATED',
  'MANUAL',
])

/** Bybit public stream 에서 관측된 실제 청산. 수동 POST allowlist 에는 넣지 않는다. */
export const OBSERVED_LIQUIDATION_SOURCE_TYPE = 'OBSERVED_LIQUIDATION'
export const OBSERVED_LIQUIDATION_SOURCE = 'BYBIT'

export const TRADING_LAB_LIQUIDATION_WINDOWS = Object.freeze([
  '5m',
  '15m',
  '1h',
  '4h',
  '24h',
])

/** @type {Readonly<Record<string, number>>} */
export const TRADING_LAB_LIQUIDATION_WINDOW_MS = Object.freeze({
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
})

/** 시장 데이터 연결 상태 — provider 미설정 시 NOT_CONFIGURED */
export const TRADING_LAB_DATA_STATUSES = Object.freeze([
  'OK',
  'PARTIAL',
  'NOT_CONFIGURED',
  'ERROR',
])

/** 차트 캡처 metadata 상태 — AI 분석은 다음 단계 */
export const TRADING_LAB_SCREENSHOT_STATUSES = Object.freeze([
  'PENDING',
  'REVIEWED',
])

export const TRADING_LAB_SYMBOL_SET = new Set(TRADING_LAB_SYMBOLS)
export const TRADING_LAB_BIAS_SET = new Set(TRADING_LAB_BIASES)
export const TRADING_LAB_OUTCOME_RESULT_SET = new Set(TRADING_LAB_OUTCOME_RESULTS)
export const TRADING_LAB_TIMEFRAME_SET = new Set(TRADING_LAB_TIMEFRAMES)
export const TRADING_LAB_STRUCTURE_SET = new Set(TRADING_LAB_STRUCTURE_STATES)
export const TRADING_LAB_LIQUIDATION_SIDE_SET = new Set(TRADING_LAB_LIQUIDATION_SIDES)
export const TRADING_LAB_SOURCE_TYPE_SET = new Set(TRADING_LAB_SOURCE_TYPES)
export const TRADING_LAB_LIQUIDATION_WINDOW_SET = new Set(
  TRADING_LAB_LIQUIDATION_WINDOWS,
)

export const TRADING_LAB_CVD_WINDOWS = Object.freeze(['5m', '15m', '1h', '4h'])

/** @type {Readonly<Record<string, number>>} */
export const TRADING_LAB_CVD_WINDOW_MS = Object.freeze({
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
})

export const TRADE_FLOW_SOURCE = 'BYBIT'
export const TRADE_FLOW_BUCKET_INTERVAL_SECONDS = 60
/** 장기 연구용 15분 요약. 자동 삭제하지 않는다. */
export const TRADE_FLOW_AGGREGATE_INTERVAL_SECONDS = 15 * 60
/** 1분 bucket 보존 기간. prune 전에 15분 aggregate 로 올린다. */
export const TRADE_FLOW_RETENTION_MS = 48 * 60 * 60 * 1000
export const TRADE_FLOW_STALE_MS = 90 * 1000

export const TRADING_LAB_CVD_WINDOW_SET = new Set(TRADING_LAB_CVD_WINDOWS)
export const TRADING_LAB_DATA_STATUS_SET = new Set(TRADING_LAB_DATA_STATUSES)
export const TRADING_LAB_SCREENSHOT_STATUS_SET = new Set(
  TRADING_LAB_SCREENSHOT_STATUSES,
)
