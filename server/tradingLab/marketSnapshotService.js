/**
 * marketSnapshotService.js — provider 호출 결과를 화면용 시장 상태로 합성
 *
 * provider 미연결이 정상 상태이므로, 각 지표는 값 대신
 * { status, value } 형태로 반환해 UI 가 "데이터 연결 전"을 표현할 수 있게 한다.
 * fake 데이터는 생성하지 않는다.
 */

import {
  PROVIDER_STATUS,
  callMarketData,
  isMarketDataConfigured,
  getMarketDataProvider,
} from './marketDataProvider.js'
import { buildMarketObservations } from './marketInterpretation.js'
import {
  BYBIT_PROVIDER_ID,
  formatFundingRatePercent,
} from './bybitMarketDataProvider.js'

/**
 * @param {object} result
 * @param {string} field
 */
function pickMetric(result, field) {
  if (!result || result.status !== PROVIDER_STATUS.OK || !result.data) {
    return {
      status: result?.status || PROVIDER_STATUS.NOT_CONFIGURED,
      value: null,
      stale: Boolean(result?.stale),
    }
  }
  const value = result.data[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { status: PROVIDER_STATUS.OK, value: null, stale: Boolean(result.stale) }
  }
  return { status: PROVIDER_STATUS.OK, value, stale: Boolean(result.stale) }
}

/**
 * 아직 수집하지 않는 지표(청산/CVD 등)는 집계에서 제외한다.
 * UNSUPPORTED 때문에 전체가 PARTIAL 로 고정되지 않게 한다.
 *
 * @param {Array<{ status: string }>} results
 */
function aggregateStatus(results) {
  const relevant = results.filter(
    (r) =>
      r &&
      r.status !== PROVIDER_STATUS.UNSUPPORTED &&
      r.status !== PROVIDER_STATUS.INVALID_REQUEST,
  )
  if (relevant.length === 0) return PROVIDER_STATUS.NOT_CONFIGURED
  const okCount = relevant.filter((r) => r.status === PROVIDER_STATUS.OK).length
  if (okCount === relevant.length) return PROVIDER_STATUS.OK
  if (okCount > 0) return 'PARTIAL'
  if (relevant.some((r) => r.status === PROVIDER_STATUS.ERROR)) {
    return PROVIDER_STATUS.ERROR
  }
  return PROVIDER_STATUS.NOT_CONFIGURED
}

/**
 * @param {Array<{ stale?: boolean }>} results
 */
function anyStale(results) {
  return results.some((r) => Boolean(r?.stale))
}

/**
 * @param {object | null} provider
 */
function resolveProviderId(provider) {
  if (!provider || !provider.id) return null
  return String(provider.id)
}

/**
 * @param {PromiseSettledResult<object>} settled
 */
function unwrapSettled(settled) {
  return settled.status === 'fulfilled'
    ? settled.value
    : { status: PROVIDER_STATUS.ERROR, data: null, stale: false }
}

/**
 * funding 은 ticker.fundingRate 를 사용한다.
 *
 * @param {object} ticker
 */
function fundingFromTicker(ticker) {
  if (!ticker || ticker.status !== PROVIDER_STATUS.OK || !ticker.data) {
    return {
      status: ticker?.status || PROVIDER_STATUS.NOT_CONFIGURED,
      rate: null,
      ratePercent: null,
      nextFundingTime: null,
      stale: Boolean(ticker?.stale),
    }
  }

  const rate = ticker.data.fundingRate
  const usable = typeof rate === 'number' && Number.isFinite(rate)
  return {
    status: PROVIDER_STATUS.OK,
    rate: usable ? rate : null,
    ratePercent: usable ? formatFundingRatePercent(rate) : null,
    nextFundingTime: ticker.data.nextFundingTime ?? null,
    stale: Boolean(ticker.stale),
  }
}

/**
 * @param {object} result
 * @param {string} timeframe
 */
function openInterestEntry(result, timeframe) {
  if (result?.status === PROVIDER_STATUS.OK && result.data) {
    return {
      status: result.status,
      timeframe,
      current: result.data.currentOpenInterest ?? null,
      previous: result.data.previousOpenInterest ?? null,
      change: result.data.openInterestChange ?? null,
      changePct: result.data.openInterestChangePct ?? null,
      stale: Boolean(result.stale),
    }
  }
  return {
    status: result?.status || PROVIDER_STATUS.NOT_CONFIGURED,
    timeframe,
    current: null,
    previous: null,
    change: null,
    changePct: null,
    stale: Boolean(result?.stale),
  }
}

/**
 * @param {object} candles
 * @param {string} timeframe
 */
function structureFromCandles(candles, timeframe) {
  const state =
    candles.status === PROVIDER_STATUS.OK && candles.data?.structure
      ? candles.data.structure
      : null
  const changePct =
    candles.status === PROVIDER_STATUS.OK &&
    typeof candles.data?.changePct === 'number' &&
    Number.isFinite(candles.data.changePct)
      ? candles.data.changePct
      : null
  const volumeRatio =
    candles.status === PROVIDER_STATUS.OK &&
    typeof candles.data?.volumeRatio === 'number' &&
    Number.isFinite(candles.data.volumeRatio)
      ? candles.data.volumeRatio
      : null

  return {
    timeframe,
    status: candles.status,
    state,
    changePct,
    volumeRatio,
    stale: Boolean(candles.stale),
    candleCount:
      candles.status === PROVIDER_STATUS.OK && Array.isArray(candles.data?.candles)
        ? candles.data.candles.length
        : 0,
  }
}

/**
 * 심볼별 현재 시장 상태 조회.
 *
 * @param {string} symbol allowlist 통과한 심볼
 * @returns {Promise<object>}
 */
export async function getMarketSnapshot(symbol) {
  const provider = getMarketDataProvider()
  const providerId = resolveProviderId(provider)

  const [
    tickerSettled,
    oi15Settled,
    oi1hSettled,
    oi4hSettled,
    candles15Settled,
    candles1hSettled,
    candles4hSettled,
    liquidationsSettled,
    orderFlowSettled,
  ] = await Promise.allSettled([
    callMarketData('getTicker', { symbol }),
    callMarketData('getOpenInterest', { symbol, timeframe: '15m' }),
    callMarketData('getOpenInterest', { symbol, timeframe: '1h' }),
    callMarketData('getOpenInterest', { symbol, timeframe: '4h' }),
    callMarketData('getCandles', { symbol, timeframe: '15m' }),
    callMarketData('getCandles', { symbol, timeframe: '1h' }),
    callMarketData('getCandles', { symbol, timeframe: '4h' }),
    callMarketData('getLiquidations', { symbol }),
    callMarketData('getOrderFlow', { symbol }),
  ])

  const ticker = unwrapSettled(tickerSettled)
  const openInterest = unwrapSettled(oi15Settled)
  const oiByTimeframe = {
    '15m': openInterestEntry(openInterest, '15m'),
    '1h': openInterestEntry(unwrapSettled(oi1hSettled), '1h'),
    '4h': openInterestEntry(unwrapSettled(oi4hSettled), '4h'),
  }
  const liquidations = unwrapSettled(liquidationsSettled)
  const orderFlow = unwrapSettled(orderFlowSettled)

  const structure = [
    structureFromCandles(unwrapSettled(candles15Settled), '15m'),
    structureFromCandles(unwrapSettled(candles1hSettled), '1h'),
    structureFromCandles(unwrapSettled(candles4hSettled), '4h'),
  ]

  const timeframes = Object.fromEntries(
    structure.map((item) => [
      item.timeframe,
      {
        status: item.status,
        structure: item.state,
        changePct: item.changePct,
        volumeRatio: item.volumeRatio,
        stale: item.stale,
        candleCount: item.candleCount,
      },
    ]),
  )

  const volumeRatio15m = structure.find((item) => item.timeframe === '15m')?.volumeRatio
  const fundingPayload = fundingFromTicker(ticker)
  const openInterestPayload = {
    ...oiByTimeframe['15m'],
    value: pickMetric(ticker, 'openInterestValue').value,
    byTimeframe: oiByTimeframe,
  }

  const metrics = {
    price: pickMetric(ticker, 'price'),
    markPrice: pickMetric(ticker, 'markPrice'),
    indexPrice: pickMetric(ticker, 'indexPrice'),
    priceChange: pickMetric(ticker, 'priceChange'),
    volume: pickMetric(ticker, 'volume'),
    turnover: pickMetric(ticker, 'turnover'),
    volumeRatio: {
      status:
        typeof volumeRatio15m === 'number'
          ? PROVIDER_STATUS.OK
          : structure.find((item) => item.timeframe === '15m')?.status ||
            PROVIDER_STATUS.NOT_CONFIGURED,
      value: typeof volumeRatio15m === 'number' ? volumeRatio15m : null,
      stale: Boolean(structure.find((item) => item.timeframe === '15m')?.stale),
    },
    volumeZScore: pickMetric(orderFlow, 'volumeZScore'),
    openInterest: pickMetric(openInterest, 'openInterest'),
    openInterestChange: pickMetric(openInterest, 'openInterestChange'),
    openInterestChangePct: pickMetric(openInterest, 'openInterestChangePct'),
    openInterestValue: pickMetric(ticker, 'openInterestValue'),
    fundingRate: {
      status: fundingPayload.status,
      value: fundingPayload.rate,
      stale: fundingPayload.stale,
    },
    cvd: pickMetric(orderFlow, 'cvd'),
    liquidationAbove: pickMetric(liquidations, 'liquidationAbove'),
    liquidationBelow: pickMetric(liquidations, 'liquidationBelow'),
  }

  const flatSnapshot = Object.fromEntries(
    Object.entries(metrics).map(([key, entry]) => [key, entry.value]),
  )

  // 1h/4h OI 는 보조 정보 — 실패해도 전체 상태를 PARTIAL 로 고정하지 않는다.
  const coreResults = [
    ticker,
    openInterest,
    {
      status:
        fundingPayload.status === PROVIDER_STATUS.OK
          ? PROVIDER_STATUS.OK
          : ticker.status,
    },
    ...structure,
  ]
  const stale = anyStale([ticker, openInterest, fundingPayload, ...structure])
  const status = aggregateStatus(coreResults)
  const resolvedProvider =
    providerId || (isMarketDataConfigured() ? BYBIT_PROVIDER_ID : null)

  return {
    symbol,
    provider: resolvedProvider,
    providerDisplayName: resolvedProvider === BYBIT_PROVIDER_ID ? 'Bybit' : resolvedProvider,
    configured: isMarketDataConfigured(),
    status,
    stale,
    message: stale || status === PROVIDER_STATUS.ERROR ? '시장 데이터 일시 지연' : null,
    fetchedAt:
      ticker.fetchedAt ||
      openInterest.fetchedAt ||
      new Date().toISOString(),
    metrics,
    structure,
    timeframes,
    openInterest: openInterestPayload,
    funding: fundingPayload,
    ticker:
      ticker.status === PROVIDER_STATUS.OK && ticker.data
        ? {
            status: ticker.status,
            stale: Boolean(ticker.stale),
            ...ticker.data,
          }
        : {
            status: ticker.status || PROVIDER_STATUS.NOT_CONFIGURED,
            stale: Boolean(ticker.stale),
          },
    observations: buildMarketObservations({
      ...flatSnapshot,
      referencePrice: flatSnapshot.price,
    }),
  }
}
