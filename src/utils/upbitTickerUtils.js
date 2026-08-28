/**
 * upbitTickerUtils.js — 업비트 공개 ticker 유틸
 */

export const UPBIT_WEBSOCKET_URL = 'wss://api.upbit.com/websocket/v1'
export const UPBIT_TICKER_STALE_MS = 15_000
export const UPBIT_MAX_RECONNECT_ATTEMPTS = 5
export const UPBIT_RECONNECT_DELAY_MS = 3_000

/** @type {Readonly<Record<string, string>>} */
export const UPBIT_SYMBOL_MARKET_MAP = Object.freeze({
  BTC: 'KRW-BTC',
  ETH: 'KRW-ETH',
  SOL: 'KRW-SOL',
})

/**
 * @typedef {'CONNECTED' | 'STALE' | 'DISCONNECTED'} UpbitConnectionState
 * @typedef {'loading' | 'live' | 'stale' | 'unavailable' | 'unsupported'} UpbitQuoteState
 */

/**
 * @param {string} symbol
 * @returns {string | null}
 */
export function mapSymbolToUpbitMarket(symbol) {
  const key = String(symbol ?? '').trim().toUpperCase()
  if (!key) return null
  return UPBIT_SYMBOL_MARKET_MAP[key] ?? null
}

/**
 * @param {string[]} symbols
 * @returns {string[]}
 */
export function getUpbitMarketsFromSymbols(symbols) {
  if (!Array.isArray(symbols)) return []
  const markets = symbols
    .map((symbol) => mapSymbolToUpbitMarket(symbol))
    .filter(Boolean)
  return [...new Set(markets)]
}

/**
 * @param {string[]} markets
 * @param {string} [ticket]
 */
export function buildUpbitSubscribePayload(markets, ticket = 'aladdin-trading-plan') {
  return [
    { ticket },
    { type: 'ticker', codes: markets },
  ]
}

/**
 * @param {unknown} value
 * @returns {{ market: string, tradePrice: number, tradeTimestamp: number | null } | null}
 */
export function parseUpbitTickerMessage(value) {
  if (!value || typeof value !== 'object') return null
  if (String(value.type ?? '') !== 'ticker') return null

  const market = String(value.code ?? value.market ?? '').trim()
  const tradePrice = Number(value.trade_price)
  const tradeTimestampRaw = Number(value.trade_timestamp ?? value.timestamp)

  if (!market || !Number.isFinite(tradePrice) || tradePrice <= 0) {
    return null
  }

  return {
    market,
    tradePrice,
    tradeTimestamp: Number.isFinite(tradeTimestampRaw)
      ? tradeTimestampRaw
      : null,
  }
}

/**
 * @param {number | null | undefined} lastReceivedAt
 * @param {number} [now]
 */
export function isTickerStale(lastReceivedAt, now = Date.now()) {
  if (!Number.isFinite(lastReceivedAt) || lastReceivedAt <= 0) return true
  return now - lastReceivedAt > UPBIT_TICKER_STALE_MS
}

/**
 * @param {{
 *   isConnected: boolean,
 *   connectionFailed: boolean,
 *   lastReceivedAt: number | null,
 *   now?: number,
 * }} input
 * @returns {UpbitConnectionState}
 */
export function resolveConnectionState(input) {
  const now = input.now ?? Date.now()

  if (!input.isConnected || input.connectionFailed) {
    return 'DISCONNECTED'
  }

  if (isTickerStale(input.lastReceivedAt, now)) {
    return 'STALE'
  }

  return 'CONNECTED'
}

/**
 * @param {UpbitConnectionState} state
 */
export function formatConnectionStateLabel(state) {
  if (state === 'CONNECTED') return '● 실시간 시세'
  if (state === 'STALE') return '시세 갱신 지연'
  return '시세 연결 끊김'
}

/**
 * @param {{
 *   supported: boolean,
 *   isConnected: boolean,
 *   connectionFailed: boolean,
 *   lastReceivedAt: number | null,
 *   now?: number,
 * }} input
 * @returns {UpbitQuoteState}
 */
export function resolveQuoteState(input) {
  if (!input.supported) return 'unsupported'
  if (input.connectionFailed) return 'unavailable'
  if (!input.isConnected) return 'loading'

  if (!Number.isFinite(input.lastReceivedAt)) {
    return 'loading'
  }

  if (isTickerStale(input.lastReceivedAt, input.now)) {
    return 'stale'
  }

  return 'live'
}

/**
 * @param {UpbitQuoteState} state
 * @param {number | null | undefined} tradePrice
 * @param {(value: number) => string} formatPrice
 */
export function formatCurrentPriceLabel(state, tradePrice, formatPrice) {
  if (state === 'unsupported') return '실시간 시세 미지원'
  if (state === 'loading') return '불러오는 중'
  if (state === 'unavailable') return '확인할 수 없음'
  if (!Number.isFinite(tradePrice)) return '확인할 수 없음'
  return formatPrice(tradePrice)
}

/**
 * @param {unknown} data
 * @returns {Promise<unknown | null>}
 */
export async function parseUpbitWebSocketPayload(data) {
  if (data == null) return null

  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  if (typeof data === 'object' && !(data instanceof Blob)) {
    return data
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const text = await data.text()
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  return null
}
