/** Journal vocabulary shared by the form and the server allowlists. */
export const JOURNAL_TIMEFRAMES = ['15m', '1h', '4h']
export const JOURNAL_REASON_TAGS = [
  'support', 'resistance', 'support OB', 'resistance OB', 'FVG', 'trendline',
  'liquidity sweep', 'fakeout', 'volume', 'CVD', 'OI', 'funding', 'liquidation',
]
export const JOURNAL_EMOTIONS = ['차분함', '망설임', '조급함', '불안', '과신', '아쉬움']
export const JOURNAL_RECORD_TYPES = { STRATEGY: '기준', IMPULSE: '충동', OBSERVATION: '관찰' }
export const JOURNAL_IMAGE_TYPES = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'] }
export const JOURNAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const JOURNAL_IMAGE_MAX_COUNT = 4
export const JOURNAL_HORIZONS = ['1h', '4h', '12h', '24h']
