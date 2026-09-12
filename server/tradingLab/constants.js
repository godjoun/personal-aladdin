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

/** 자동 시장 상태 판정. 수동 trade_analysis 와 구분한다. */
export const MARKET_STATES = Object.freeze([
  'BULLISH_PRESSURE',
  'BEARISH_PRESSURE',
  'NEW_LONG_BUILDUP',
  'NEW_SHORT_BUILDUP',
  'SHORT_LIQUIDATION_DRIVEN',
  'LONG_LIQUIDATION_DRIVEN',
  'PRICE_CVD_BEARISH_DIVERGENCE',
  'PRICE_CVD_BULLISH_DIVERGENCE',
  'MIXED',
  'DATA_INSUFFICIENT',
])

export const MARKET_STATE_SET = new Set(MARKET_STATES)

export const MARKET_STATE_LABELS = Object.freeze({
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
})

export const MARKET_STATE_SHORT_LABELS = Object.freeze({
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
})

export const MARKET_STATE_DISCLAIMER =
  '시장 관찰 지표이며 매수·매도 추천이 아닙니다.'

/** 자동 판정 저장 주기. 같은 symbol + 5분 bucket 은 한 번만 기록한다. */
export const MARKET_STATE_BUCKET_SECONDS = 5 * 60
export const MARKET_STATE_HISTORY_LIMIT = 20

export const SHADOW_TRADE_DIRECTIONS = Object.freeze(['LONG', 'SHORT'])
export const SHADOW_TRADE_SOURCES = Object.freeze([
  'AUTO_MARKET_STATE',
  'MANUAL_USER',
])
export const SHADOW_TRADE_STATUSES = Object.freeze([
  'OPEN',
  'EVALUATING',
  'CLOSED',
])
export const SHADOW_TRADE_RESULTS = Object.freeze([
  'WIN',
  'LOSS',
  'NEUTRAL',
  'UNRESOLVED',
])
export const SHADOW_TRADE_TAGS = Object.freeze([
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
  'has_stop',
  'has_target',
])
export const SHADOW_TRADE_TAG_LABELS = Object.freeze({
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
  has_stop: '손절 기준 있음',
  has_target: '목표 기준 있음',
})

export const SHADOW_TRADE_DIRECTION_SET = new Set(SHADOW_TRADE_DIRECTIONS)
export const SHADOW_TRADE_SOURCE_SET = new Set(SHADOW_TRADE_SOURCES)
export const SHADOW_TRADE_STATUS_SET = new Set(SHADOW_TRADE_STATUSES)
export const SHADOW_TRADE_RESULT_SET = new Set(SHADOW_TRADE_RESULTS)
export const SHADOW_TRADE_TAG_SET = new Set(SHADOW_TRADE_TAGS)

export const SHADOW_STRATEGY_VERSION = 'shadow-v1'
export const SHADOW_QUICK_ENTRY_REASON = 'quick_manual'
export const SHADOW_QUICK_DEDUP_WINDOW_MS = 60 * 1000
export const SHADOW_TRADE_DISCLAIMER =
  '가상 계산이며 실제 체결과 다를 수 있습니다. 실제 주문은 없습니다.'
export const SHADOW_QUICK_HINT =
  '먼저 1초 기록하고, 이유는 나중에 보강해도 됩니다.'
export const SHADOW_QUICK_SECTION_HINT =
  '실제 주문 없이 현재 시장 상태를 기준으로 가상 진입만 기록합니다.'
export const SHADOW_ASSUMED_FEE_BPS = 5
export const SHADOW_ASSUMED_SLIPPAGE_BPS = 3
export const SHADOW_AUTO_STRENGTH_MIN = 65
export const SHADOW_DEDUP_WINDOW_MS = 30 * 60 * 1000
export const SHADOW_RESULT_DEADZONE_PCT = 0.15
export const SHADOW_TRADE_EVAL_INTERVAL_MS = 5 * 60 * 1000
export const SHADOW_AUTO_LONG_STATES = Object.freeze([
  'BULLISH_PRESSURE',
  'NEW_LONG_BUILDUP',
])
export const SHADOW_AUTO_SHORT_STATES = Object.freeze([
  'BEARISH_PRESSURE',
  'NEW_SHORT_BUILDUP',
])
export const SHADOW_OBSERVE_STATES = Object.freeze([
  'SHORT_LIQUIDATION_DRIVEN',
  'LONG_LIQUIDATION_DRIVEN',
])
