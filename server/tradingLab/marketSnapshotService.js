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
} from './marketDataProvider.js'
import { buildMarketObservations } from './marketInterpretation.js'

/**
 * @param {object} result
 * @param {string} field
 */
function pickMetric(result, field) {
  if (!result || result.status !== PROVIDER_STATUS.OK || !result.data) {
    return { status: result?.status || PROVIDER_STATUS.NOT_CONFIGURED, value: null }
  }
  const value = result.data[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { status: PROVIDER_STATUS.OK, value: null }
  }
  return { status: PROVIDER_STATUS.OK, value }
}

/**
 * @param {Array<{ status: string }>} results
 */
function aggregateStatus(results) {
  if (results.length === 0) return PROVIDER_STATUS.NOT_CONFIGURED
  const okCount = results.filter((r) => r.status === PROVIDER_STATUS.OK).length
  if (okCount === results.length) return PROVIDER_STATUS.OK
  if (okCount > 0) return 'PARTIAL'
  if (results.some((r) => r.status === PROVIDER_STATUS.ERROR)) {
    return PROVIDER_STATUS.ERROR
  }
  return PROVIDER_STATUS.NOT_CONFIGURED
}

/**
 * 심볼별 현재 시장 상태 조회.
 *
 * @param {string} symbol allowlist 통과한 심볼
 * @returns {Promise<object>}
 */
export async function getMarketSnapshot(symbol) {
  const [ticker, openInterest, funding, liquidations, orderFlow] = await Promise.all([
    callMarketData('getTicker', { symbol }),
    callMarketData('getOpenInterest', { symbol }),
    callMarketData('getFundingRate', { symbol }),
    callMarketData('getLiquidations', { symbol }),
    callMarketData('getOrderFlow', { symbol }),
  ])

  const structure = await Promise.all(
    ['15m', '1h', '4h'].map(async (timeframe) => {
      const candles = await callMarketData('getCandles', { symbol, timeframe })
      return {
        timeframe,
        status: candles.status,
        // 구조 판정은 실제 캔들 데이터가 연결된 다음 단계에서 계산한다.
        state: null,
      }
    }),
  )

  const metrics = {
    price: pickMetric(ticker, 'price'),
    priceChange: pickMetric(ticker, 'priceChange'),
    volume: pickMetric(ticker, 'volume'),
    volumeZScore: pickMetric(orderFlow, 'volumeZScore'),
    openInterest: pickMetric(openInterest, 'openInterest'),
    openInterestChange: pickMetric(openInterest, 'openInterestChange'),
    fundingRate: pickMetric(funding, 'fundingRate'),
    cvd: pickMetric(orderFlow, 'cvd'),
    liquidationAbove: pickMetric(liquidations, 'liquidationAbove'),
    liquidationBelow: pickMetric(liquidations, 'liquidationBelow'),
  }

  const flatSnapshot = Object.fromEntries(
    Object.entries(metrics).map(([key, entry]) => [key, entry.value]),
  )

  return {
    symbol,
    configured: isMarketDataConfigured(),
    status: aggregateStatus([
      ticker,
      openInterest,
      funding,
      liquidations,
      orderFlow,
    ]),
    fetchedAt: new Date().toISOString(),
    metrics,
    structure,
    observations: buildMarketObservations({
      ...flatSnapshot,
      referencePrice: flatSnapshot.price,
    }),
  }
}
