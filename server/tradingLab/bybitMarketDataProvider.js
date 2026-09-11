/**
 * bybitMarketDataProvider.js — Bybit V5 Public Market API (READ ONLY)
 *
 * BTCUSDT / ETHUSDT linear perpetual 공개 시세만 조회한다.
 * API key / secret / 주문 / 포지션 / 잔고 endpoint 는 사용하지 않는다.
 */

import { TRADING_LAB_SYMBOL_SET } from './constants.js'
import { PROVIDER_STATUS } from './marketDataProvider.js'
import { fetchWithTimeout } from '../utils/fetchTimeout.js'

export const BYBIT_PROVIDER_ID = 'BYBIT'
export const BYBIT_BASE_URL = 'https://api.bybit.com'
export const BYBIT_CATEGORY = 'linear'
export const BYBIT_TIMEOUT_MS = 8_000
export const BYBIT_CANDLE_LIMIT = 100
export const BYBIT_OI_LIMIT = 8
export const BYBIT_VOLUME_LOOKBACK = 20

/** @type {Readonly<Record<string, number>>} */
export const BYBIT_CACHE_TTL_MS = Object.freeze({
  ticker: 8_000,
  openInterest: 45_000,
  funding: 60_000,
  candles15m: 30_000,
  candles1h: 60_000,
  candles4h: 120_000,
})

/** Trading Lab timeframe → Bybit kline interval */
export const BYBIT_KLINE_INTERVAL = Object.freeze({
  '15m': '15',
  '1h': '60',
  '4h': '240',
})

/** Trading Lab timeframe → Bybit open-interest intervalTime */
export const BYBIT_OI_INTERVAL = Object.freeze({
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
})

/** @type {Readonly<Record<string, number>>} */
export const BYBIT_INTERVAL_MS = Object.freeze({
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
})

/**
 * Bybit 숫자 문자열을 finite number 로 변환. NaN/Infinity 거부.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseBybitNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * funding rate(소수) → 퍼센트 표시 문자열.
 * 예: 0.0001 → "0.0100%"
 *
 * @param {unknown} rate
 * @param {{ digits?: number }} [options]
 * @returns {string | null}
 */
export function formatFundingRatePercent(rate, options = {}) {
  const { digits = 4 } = options
  const num = parseBybitNumber(rate)
  if (num === null) return null
  const pct = num * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(digits)}%`
}

/**
 * @param {unknown} raw
 * @param {string} fetchedAt
 */
export function normalizeBybitTicker(raw, fetchedAt) {
  if (!raw || typeof raw !== 'object') return null

  const symbol = String(raw.symbol || '').trim().toUpperCase()
  if (!TRADING_LAB_SYMBOL_SET.has(symbol)) return null

  const lastPrice = parseBybitNumber(raw.lastPrice)
  const markPrice = parseBybitNumber(raw.markPrice)
  const indexPrice = parseBybitNumber(raw.indexPrice)
  const price24hPcnt = parseBybitNumber(raw.price24hPcnt)
  const highPrice24h = parseBybitNumber(raw.highPrice24h)
  const lowPrice24h = parseBybitNumber(raw.lowPrice24h)
  const volume24h = parseBybitNumber(raw.volume24h)
  const turnover24h = parseBybitNumber(raw.turnover24h)
  const openInterest = parseBybitNumber(raw.openInterest)
  const openInterestValue = parseBybitNumber(raw.openInterestValue)
  const fundingRate = parseBybitNumber(raw.fundingRate)
  const bid1Price = parseBybitNumber(raw.bid1Price)
  const ask1Price = parseBybitNumber(raw.ask1Price)

  const nextFundingRaw = raw.nextFundingTime
  const nextFundingMs = parseBybitNumber(nextFundingRaw)
  const nextFundingTime =
    nextFundingMs !== null && nextFundingMs > 0
      ? new Date(nextFundingMs).toISOString()
      : null

  if (lastPrice === null) return null

  return {
    symbol,
    lastPrice,
    markPrice,
    indexPrice,
    price24hPcnt,
    highPrice24h,
    lowPrice24h,
    volume24h,
    turnover24h,
    openInterest,
    openInterestValue,
    fundingRate,
    nextFundingTime,
    nextFundingTimeMs: nextFundingMs,
    bid1Price,
    ask1Price,
    fetchedAt,
    // snapshot / interpretation 호환 필드
    price: lastPrice,
    priceChange: price24hPcnt,
    volume: volume24h,
    turnover: turnover24h,
  }
}

/**
 * Bybit kline list(최신순) → 시간 오름차순 candle 배열
 *
 * @param {unknown} list
 * @param {number} intervalMs
 * @param {number} [nowMs]
 */
export function normalizeBybitCandles(list, intervalMs, nowMs = Date.now()) {
  if (!Array.isArray(list)) return []

  const candles = []
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue
    const timestamp = parseBybitNumber(row[0])
    const open = parseBybitNumber(row[1])
    const high = parseBybitNumber(row[2])
    const low = parseBybitNumber(row[3])
    const close = parseBybitNumber(row[4])
    const volume = parseBybitNumber(row[5])
    const turnover = row.length > 6 ? parseBybitNumber(row[6]) : null

    if (
      timestamp === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null
    ) {
      continue
    }

    const closed = timestamp + intervalMs <= nowMs
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      turnover,
      closed,
    })
  }

  candles.sort((a, b) => a.timestamp - b.timestamp)
  return candles
}

/**
 * OI 시계열(최신순 또는 임의 순)에서 변화량 계산. 0 division 안전.
 *
 * @param {Array<{ openInterest: number, timestamp?: number }>} points
 */
export function computeOpenInterestChange(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      currentOpenInterest: null,
      previousOpenInterest: null,
      openInterestChange: null,
      openInterestChangePct: null,
    }
  }

  const sorted = [...points]
    .filter((p) => p && typeof p.openInterest === 'number' && Number.isFinite(p.openInterest))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

  if (sorted.length === 0) {
    return {
      currentOpenInterest: null,
      previousOpenInterest: null,
      openInterestChange: null,
      openInterestChangePct: null,
    }
  }

  const current = sorted[sorted.length - 1]
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null
  const currentOpenInterest = current.openInterest
  const previousOpenInterest = previous ? previous.openInterest : null
  const openInterestChange =
    previousOpenInterest === null ? null : currentOpenInterest - previousOpenInterest

  let openInterestChangePct = null
  if (
    openInterestChange !== null &&
    previousOpenInterest !== null &&
    previousOpenInterest !== 0
  ) {
    openInterestChangePct = (openInterestChange / previousOpenInterest) * 100
  } else if (
    openInterestChange !== null &&
    previousOpenInterest === 0 &&
    openInterestChange === 0
  ) {
    openInterestChangePct = 0
  }

  return {
    currentOpenInterest,
    previousOpenInterest,
    openInterestChange,
    openInterestChangePct,
  }
}

/**
 * @param {unknown} list
 */
export function normalizeBybitOpenInterestList(list) {
  if (!Array.isArray(list)) return []
  const points = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const openInterest = parseBybitNumber(row.openInterest)
    const timestamp = parseBybitNumber(row.timestamp)
    if (openInterest === null) continue
    points.push({
      openInterest,
      timestamp: timestamp === null ? 0 : timestamp,
    })
  }
  return points
}

/**
 * 최근 고점/저점 구조로 기초 판정. 확정 신호가 아니라 가능성 수준.
 *
 * @param {Array<{ high: number, low: number, close: number, closed?: boolean }>} candles
 * @returns {'BULLISH' | 'BEARISH' | 'RANGE' | 'UNKNOWN'}
 */
export function inferCandleStructure(candles) {
  if (!Array.isArray(candles) || candles.length < 8) return 'UNKNOWN'

  const closed = candles.filter((c) => c.closed !== false)
  const series = closed.length >= 8 ? closed : candles
  if (series.length < 8) return 'UNKNOWN'

  const recent = series.slice(-6)
  const earlier = series.slice(-12, -6)
  if (earlier.length < 4) return 'UNKNOWN'

  const recentHigh = Math.max(...recent.map((c) => c.high))
  const recentLow = Math.min(...recent.map((c) => c.low))
  const earlierHigh = Math.max(...earlier.map((c) => c.high))
  const earlierLow = Math.min(...earlier.map((c) => c.low))

  const higherHigh = recentHigh > earlierHigh
  const higherLow = recentLow > earlierLow
  const lowerHigh = recentHigh < earlierHigh
  const lowerLow = recentLow < earlierLow

  if (higherHigh && higherLow) return 'BULLISH'
  if (lowerHigh && lowerLow) return 'BEARISH'
  return 'RANGE'
}

/**
 * 최근 완료 candle 변화율 (%)
 *
 * @param {Array<{ close: number, closed?: boolean }>} candles
 * @returns {number | null}
 */
export function computeRecentChangePct(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null
  const closed = candles.filter((c) => c.closed !== false)
  const series = closed.length >= 2 ? closed : candles
  if (series.length < 2) return null

  const latest = series[series.length - 1]
  const prev = series[series.length - 2]
  if (!Number.isFinite(latest.close) || !Number.isFinite(prev.close) || prev.close === 0) {
    return null
  }
  return ((latest.close - prev.close) / prev.close) * 100
}

/**
 * 최근 완료 volume / 이전 N개 평균
 *
 * @param {Array<{ volume: number, closed?: boolean }>} candles
 * @param {number} [lookback]
 * @returns {number | null}
 */
export function computeVolumeRatio(candles, lookback = BYBIT_VOLUME_LOOKBACK) {
  if (!Array.isArray(candles) || candles.length < 3) return null

  const closed = candles.filter((c) => c.closed !== false)
  if (closed.length < 3) return null

  const latest = closed[closed.length - 1]
  const previous = closed.slice(-(lookback + 1), -1)
  if (previous.length === 0) return null

  const avg =
    previous.reduce((sum, c) => sum + c.volume, 0) / previous.length
  if (!Number.isFinite(avg) || avg === 0) return null
  if (!Number.isFinite(latest.volume)) return null
  return latest.volume / avg
}

/**
 * @param {string} status
 * @param {object} [extra]
 */
function result(status, extra = {}) {
  return {
    status,
    data: null,
    provider: BYBIT_PROVIDER_ID,
    fetchedAt: null,
    stale: false,
    ...extra,
  }
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   now?: () => number,
 *   cache?: Map<string, object>,
 * }} [options]
 * base URL 은 외부 입력으로 받지 않는다.
 */
export function createBybitMarketDataProvider(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const baseUrl = BYBIT_BASE_URL
  const timeoutMs = options.timeoutMs ?? BYBIT_TIMEOUT_MS
  const now = options.now ?? (() => Date.now())
  /** @type {Map<string, { expiresAt: number, payload: object }>} */
  const cache = options.cache ?? new Map()

  /**
   * @param {string} key
   * @param {number} ttlMs
   * @param {() => Promise<object>} loader
   */
  async function withCache(key, ttlMs, loader) {
    const hit = cache.get(key)
    const ts = now()
    if (hit && hit.expiresAt > ts) {
      return { ...hit.payload, stale: false, cached: true }
    }

    try {
      const payload = await loader()
      if (payload?.status === PROVIDER_STATUS.OK) {
        cache.set(key, { expiresAt: ts + ttlMs, payload })
        return { ...payload, stale: false, cached: false }
      }
      if (hit?.payload) {
        return { ...hit.payload, stale: true, cached: true }
      }
      return payload
    } catch {
      if (hit?.payload) {
        return { ...hit.payload, stale: true, cached: true }
      }
      return result(PROVIDER_STATUS.ERROR, {
        fetchedAt: new Date(ts).toISOString(),
        message: '시장 데이터 일시 지연',
      })
    }
  }

  /**
   * @param {string} path
   * @param {Record<string, string>} params
   */
  async function bybitGet(path, params) {
    const url = new URL(path, baseUrl)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }

    const response = await fetchWithTimeout(
      fetchImpl,
      url.toString(),
      { method: 'GET', headers: { Accept: 'application/json' } },
      { timeoutMs },
    )

    if (!response.ok) {
      throw new Error(`bybit_http_${response.status}`)
    }

    const body = await response.json()
    if (!body || body.retCode !== 0) {
      throw new Error(`bybit_ret_${body?.retCode ?? 'unknown'}`)
    }
    return body
  }

  /**
   * @param {{ symbol?: string }} params
   */
  async function getTicker(params = {}) {
    const symbol = String(params.symbol || '').trim().toUpperCase()
    if (!TRADING_LAB_SYMBOL_SET.has(symbol)) {
      return result(PROVIDER_STATUS.INVALID_REQUEST, {
        method: 'getTicker',
        field: 'symbol',
      })
    }

    return withCache(`ticker:${symbol}`, BYBIT_CACHE_TTL_MS.ticker, async () => {
      const fetchedAt = new Date(now()).toISOString()
      const body = await bybitGet('/v5/market/tickers', {
        category: BYBIT_CATEGORY,
        symbol,
      })
      const raw = body?.result?.list?.[0]
      const data = normalizeBybitTicker(raw, fetchedAt)
      if (!data) {
        return result(PROVIDER_STATUS.ERROR, {
          method: 'getTicker',
          fetchedAt,
          message: '시장 데이터 일시 지연',
        })
      }
      return result(PROVIDER_STATUS.OK, { data, fetchedAt })
    })
  }

  /**
   * @param {{ symbol?: string, timeframe?: string, limit?: number }} params
   */
  async function getCandles(params = {}) {
    const symbol = String(params.symbol || '').trim().toUpperCase()
    const timeframe = String(params.timeframe || '').trim()
    if (!TRADING_LAB_SYMBOL_SET.has(symbol)) {
      return result(PROVIDER_STATUS.INVALID_REQUEST, {
        method: 'getCandles',
        field: 'symbol',
      })
    }
    const interval = BYBIT_KLINE_INTERVAL[timeframe]
    const intervalMs = BYBIT_INTERVAL_MS[timeframe]
    if (!interval || !intervalMs) {
      return result(PROVIDER_STATUS.INVALID_REQUEST, {
        method: 'getCandles',
        field: 'timeframe',
      })
    }

    const ttlKey =
      timeframe === '15m'
        ? 'candles15m'
        : timeframe === '1h'
          ? 'candles1h'
          : 'candles4h'
    const limit = Math.min(
      Math.max(Number(params.limit) || BYBIT_CANDLE_LIMIT, 1),
      200,
    )

    return withCache(
      `candles:${symbol}:${timeframe}:${limit}`,
      BYBIT_CACHE_TTL_MS[ttlKey],
      async () => {
        const fetchedAt = new Date(now()).toISOString()
        const body = await bybitGet('/v5/market/kline', {
          category: BYBIT_CATEGORY,
          symbol,
          interval,
          limit: String(limit),
        })
        const candles = normalizeBybitCandles(
          body?.result?.list,
          intervalMs,
          now(),
        )
        if (candles.length === 0) {
          return result(PROVIDER_STATUS.ERROR, {
            method: 'getCandles',
            fetchedAt,
            message: '시장 데이터 일시 지연',
          })
        }

        const structure = inferCandleStructure(candles)
        const changePct = computeRecentChangePct(candles)
        const volumeRatio =
          timeframe === '15m' ? computeVolumeRatio(candles) : null

        return result(PROVIDER_STATUS.OK, {
          fetchedAt,
          data: {
            symbol,
            timeframe,
            candles,
            structure,
            changePct,
            volumeRatio,
          },
        })
      },
    )
  }

  /**
   * @param {{ symbol?: string, timeframe?: string }} params
   */
  async function getOpenInterest(params = {}) {
    const symbol = String(params.symbol || '').trim().toUpperCase()
    const timeframe = String(params.timeframe || '15m').trim()
    if (!TRADING_LAB_SYMBOL_SET.has(symbol)) {
      return result(PROVIDER_STATUS.INVALID_REQUEST, {
        method: 'getOpenInterest',
        field: 'symbol',
      })
    }
    const intervalTime = BYBIT_OI_INTERVAL[timeframe]
    if (!intervalTime) {
      return result(PROVIDER_STATUS.INVALID_REQUEST, {
        method: 'getOpenInterest',
        field: 'timeframe',
      })
    }

    return withCache(
      `oi:${symbol}:${timeframe}`,
      BYBIT_CACHE_TTL_MS.openInterest,
      async () => {
        const fetchedAt = new Date(now()).toISOString()
        const body = await bybitGet('/v5/market/open-interest', {
          category: BYBIT_CATEGORY,
          symbol,
          intervalTime,
          limit: String(BYBIT_OI_LIMIT),
        })
        const points = normalizeBybitOpenInterestList(body?.result?.list)
        const change = computeOpenInterestChange(points)
        if (change.currentOpenInterest === null) {
          return result(PROVIDER_STATUS.ERROR, {
            method: 'getOpenInterest',
            fetchedAt,
            message: '시장 데이터 일시 지연',
          })
        }

        return result(PROVIDER_STATUS.OK, {
          fetchedAt,
          data: {
            symbol,
            timeframe,
            ...change,
            // snapshot 호환
            openInterest: change.currentOpenInterest,
            openInterestChange: change.openInterestChange,
            points,
          },
        })
      },
    )
  }

  /**
   * 현재 funding 은 ticker 의 fundingRate 를 사용한다.
   *
   * @param {{ symbol?: string }} params
   */
  async function getFundingRate(params = {}) {
    const symbol = String(params.symbol || '').trim().toUpperCase()
    if (!TRADING_LAB_SYMBOL_SET.has(symbol)) {
      return result(PROVIDER_STATUS.INVALID_REQUEST, {
        method: 'getFundingRate',
        field: 'symbol',
      })
    }

    return withCache(`funding:${symbol}`, BYBIT_CACHE_TTL_MS.funding, async () => {
      const tickerResult = await getTicker({ symbol })
      if (tickerResult.status !== PROVIDER_STATUS.OK || !tickerResult.data) {
        return result(PROVIDER_STATUS.ERROR, {
          method: 'getFundingRate',
          fetchedAt: tickerResult.fetchedAt,
          stale: Boolean(tickerResult.stale),
          message: '시장 데이터 일시 지연',
        })
      }

      const { fundingRate, nextFundingTime, nextFundingTimeMs } = tickerResult.data
      if (fundingRate === null) {
        return result(PROVIDER_STATUS.ERROR, {
          method: 'getFundingRate',
          fetchedAt: tickerResult.fetchedAt,
          message: '시장 데이터 일시 지연',
        })
      }

      return result(PROVIDER_STATUS.OK, {
        fetchedAt: tickerResult.fetchedAt,
        stale: Boolean(tickerResult.stale),
        data: {
          symbol,
          fundingRate,
          nextFundingTime,
          nextFundingTimeMs,
          fundingRatePercent: formatFundingRatePercent(fundingRate),
        },
      })
    })
  }

  /**
   * settled funding history — UI 미연결. service 준비만.
   *
   * @param {{ symbol?: string, limit?: number }} params
   */
  async function getFundingHistory(params = {}) {
    const symbol = String(params.symbol || '').trim().toUpperCase()
    if (!TRADING_LAB_SYMBOL_SET.has(symbol)) {
      return result(PROVIDER_STATUS.INVALID_REQUEST, {
        method: 'getFundingHistory',
        field: 'symbol',
      })
    }
    const limit = Math.min(Math.max(Number(params.limit) || 5, 1), 50)
    const fetchedAt = new Date(now()).toISOString()
    try {
      const body = await bybitGet('/v5/market/funding/history', {
        category: BYBIT_CATEGORY,
        symbol,
        limit: String(limit),
      })
      const list = Array.isArray(body?.result?.list) ? body.result.list : []
      const items = list
        .map((row) => {
          const fundingRate = parseBybitNumber(row?.fundingRate)
          const fundingRateTimestamp = parseBybitNumber(row?.fundingRateTimestamp)
          if (fundingRate === null) return null
          return {
            fundingRate,
            fundingRateTimestamp,
            fundingRatePercent: formatFundingRatePercent(fundingRate),
          }
        })
        .filter(Boolean)

      return result(PROVIDER_STATUS.OK, {
        fetchedAt,
        data: { symbol, items },
      })
    } catch {
      return result(PROVIDER_STATUS.ERROR, {
        method: 'getFundingHistory',
        fetchedAt,
        message: '시장 데이터 일시 지연',
      })
    }
  }

  async function getLiquidations() {
    return result(PROVIDER_STATUS.UNSUPPORTED, {
      method: 'getLiquidations',
      message: '청산 데이터 수집 전',
    })
  }

  async function getOrderFlow() {
    return result(PROVIDER_STATUS.UNSUPPORTED, {
      method: 'getOrderFlow',
      message: 'CVD 데이터 수집 전',
    })
  }

  return {
    id: BYBIT_PROVIDER_ID,
    configured: true,
    getTicker,
    getCandles,
    getOpenInterest,
    getFundingRate,
    getFundingHistory,
    getLiquidations,
    getOrderFlow,
    /** @internal test helper */
    _cache: cache,
  }
}
