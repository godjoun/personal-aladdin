/**
 * marketDataProvider.js — 거래소 provider 추상화
 *
 * Trading Lab UI/DB 가 특정 거래소에 종속되지 않도록 하는 경계.
 * provider 미설정 시 모든 호출이 NOT_CONFIGURED 를 정상 반환한다.
 * 실제 구현체(Bybit 공개 API)는 createBybitMarketDataProvider 로 등록한다.
 *
 * 조회 전용 interface 다. 주문/포지션/레버리지 메서드는 정의하지 않는다.
 */

import { TRADING_LAB_SYMBOL_SET, TRADING_LAB_TIMEFRAME_SET } from './constants.js'

export const PROVIDER_STATUS = Object.freeze({
  OK: 'OK',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  UNSUPPORTED: 'UNSUPPORTED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  ERROR: 'ERROR',
})

/**
 * MarketDataProvider 가 반드시 구현해야 하는 조회 메서드.
 * 실제 거래소 연결은 이 목록을 채우는 것으로 시작한다.
 */
export const MARKET_DATA_METHODS = Object.freeze([
  'getTicker',
  'getCandles',
  'getOpenInterest',
  'getFundingRate',
  'getLiquidations',
  'getOrderFlow',
])

/**
 * @param {string} status
 * @param {object} [extra]
 */
function providerResult(status, extra = {}) {
  return {
    status,
    data: null,
    provider: null,
    fetchedAt: null,
    ...extra,
  }
}

/**
 * @param {string} method
 */
export function notConfiguredResult(method) {
  return providerResult(PROVIDER_STATUS.NOT_CONFIGURED, {
    method,
    message: '시장 데이터 provider가 설정되지 않았습니다.',
  })
}

/**
 * @param {string} method
 * @param {string} field
 */
export function invalidRequestResult(method, field) {
  return providerResult(PROVIDER_STATUS.INVALID_REQUEST, {
    method,
    field,
    message: '허용되지 않은 요청 파라미터입니다.',
  })
}

/**
 * provider 미설정 상태를 나타내는 기본 구현.
 * 호출측이 null 검사 없이 동일한 결과 형태를 다룰 수 있게 한다.
 *
 * @returns {Record<string, (...args: unknown[]) => Promise<object>>}
 */
export function createNotConfiguredProvider() {
  /** @type {Record<string, Function>} */
  const provider = {
    id: null,
    configured: false,
  }

  for (const method of MARKET_DATA_METHODS) {
    provider[method] = async () => notConfiguredResult(method)
  }

  return provider
}

/**
 * provider 구현체가 interface 를 만족하는지 검사
 *
 * @param {object} candidate
 * @returns {{ ok: true } | { ok: false, missing: string[] }}
 */
export function validateProviderShape(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, missing: [...MARKET_DATA_METHODS] }
  }
  const missing = MARKET_DATA_METHODS.filter(
    (method) => typeof candidate[method] !== 'function',
  )
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

/** @type {object | null} */
let activeProvider = null

const notConfiguredProvider = createNotConfiguredProvider()

/**
 * 거래소 구현체 등록 지점.
 * 다음 단계에서 다른 거래소 adapter 를 추가하면 여기에 등록한다.
 *
 * @param {object} provider
 */
export function registerMarketDataProvider(provider) {
  const shape = validateProviderShape(provider)
  if (!shape.ok) {
    throw new Error(
      `MarketDataProvider is missing methods: ${shape.missing.join(', ')}`,
    )
  }
  activeProvider = provider
  return provider
}

export function resetMarketDataProvider() {
  activeProvider = null
}

/**
 * @returns {object}
 */
export function getMarketDataProvider() {
  return activeProvider || notConfiguredProvider
}

export function isMarketDataConfigured() {
  return activeProvider !== null
}

/**
 * provider 호출 wrapper — symbol/timeframe allowlist 와 예외를 여기서 흡수한다.
 * provider 내부 오류 메시지는 호출측으로 전달하지 않는다.
 *
 * @param {string} method
 * @param {{ symbol?: string, timeframe?: string }} [params]
 */
export async function callMarketData(method, params = {}) {
  if (!MARKET_DATA_METHODS.includes(method)) {
    return providerResult(PROVIDER_STATUS.UNSUPPORTED, { method })
  }

  if (params.symbol !== undefined && !TRADING_LAB_SYMBOL_SET.has(params.symbol)) {
    return invalidRequestResult(method, 'symbol')
  }

  if (
    params.timeframe !== undefined &&
    !TRADING_LAB_TIMEFRAME_SET.has(params.timeframe)
  ) {
    return invalidRequestResult(method, 'timeframe')
  }

  const provider = getMarketDataProvider()

  try {
    const result = await provider[method](params)
    if (!result || typeof result !== 'object' || typeof result.status !== 'string') {
      return providerResult(PROVIDER_STATUS.ERROR, { method })
    }
    return result
  } catch {
    console.error(`[TradingLab] market data call failed method=${method}`)
    return providerResult(PROVIDER_STATUS.ERROR, { method })
  }
}
