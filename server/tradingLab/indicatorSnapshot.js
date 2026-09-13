import { callMarketData } from './marketDataProvider.js'
import { getMarketSnapshot } from './marketSnapshotService.js'
import { getCvdSummary } from './tradeFlowRepository.js'
import { getObservedLiquidationSummary } from './liquidationRepository.js'
import { assembleMarketStateInput } from './marketStateService.js'
import { evaluateMarketState } from './marketStateEngine.js'
import { listChartAnnotations } from './chartAnnotationRepository.js'

const INTERVAL = { '15m': 900000, '1h': 3600000, '4h': 14400000 }
const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

export function ema(values, period) {
  if (values.length < period) return null
  let result = average(values.slice(0, period))
  const alpha = 2 / (period + 1)
  for (const value of values.slice(period)) result = value * alpha + result * (1 - alpha)
  return result
}

export function rsi(values, period = 14) {
  if (values.length <= period) return null
  const changes = values.slice(1).map((value, i) => value - values[i])
  let gain = average(changes.slice(0, period).map((v) => Math.max(v, 0)))
  let loss = average(changes.slice(0, period).map((v) => Math.max(-v, 0)))
  for (const delta of changes.slice(period)) {
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period
  }
  return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss)
}

/** Only closed, consecutive candles. No partial candle or future information. */
export function calculateIndicators(candles, timeframe, nowMs = Date.now()) {
  const interval = INTERVAL[timeframe]
  const sorted = [...new Map((candles || []).filter((c) =>
    Number.isFinite(c.timestamp) && c.timestamp + interval <= nowMs && finite(c.close) > 0,
  ).map((c) => [c.timestamp, c])).values()].sort((a, b) => a.timestamp - b.timestamp)
  let tail = []
  for (const candle of sorted) {
    if (tail.length && candle.timestamp - tail.at(-1).timestamp !== interval) tail = []
    tail.push(candle)
  }
  const values = tail.map((c) => c.close)
  const previousVolumes = tail.slice(-21, -1).map((c) => finite(c.volume))
  const volumeMa20 = previousVolumes.length === 20 && previousVolumes.every((v) => v !== null && v >= 0) ? average(previousVolumes) : null
  const volume = finite(tail.at(-1)?.volume)
  return {
    ema20: ema(values, 20), ema50: ema(values, 50), ema200: ema(values, 200), rsi14: rsi(values),
    volumeMa20, volume, volumeRatio: volumeMa20 > 0 && volume !== null ? volume / volumeMa20 : null,
    candleCount: tail.length,
    lastClosedAt: tail.length ? new Date(tail.at(-1).timestamp + interval).toISOString() : null,
    stale: !tail.length || nowMs - (tail.at(-1).timestamp + interval) >= interval,
  }
}

export async function captureIndicatorSnapshot(symbol, timeframe, { db, nowMs = Date.now() } = {}) {
  const [market, candleResult] = await Promise.all([
    getMarketSnapshot(symbol).catch(() => null),
    callMarketData('getCandles', { symbol, timeframe, limit: 250 }).catch(() => null),
  ])
  const cvd = getCvdSummary({ symbol, window: '15m', nowMs }, db)
  const liquidations = getObservedLiquidationSummary({ symbol, window: '15m', nowMs }, db)
  const assembled = await assembleMarketStateInput(symbol, { nowMs, snapshot: market, cvd, liquidations })
  const indicators = calculateIndicators(candleResult?.status === 'OK' ? candleResult?.data?.candles : [], timeframe, nowMs)
  return {
    version: 1, kind: 'ENTRY_CAPTURE', symbol, timeframe, capturedAt: new Date(nowMs).toISOString(),
    provider: market?.provider ?? null,
    marketStatus: market?.status ?? 'ERROR', marketFetchedAt: market?.fetchedAt ?? null,
    marketStale: Boolean(market?.stale),
    candleStatus: candleResult?.status ?? 'ERROR', candleFetchedAt: candleResult?.fetchedAt ?? null,
    candleStale: Boolean(candleResult?.stale) || indicators.stale,
    indicators,
    marketMetrics: market?.metrics ?? {},
    referencePrice: finite(market?.metrics?.price?.value),
    orderFlow: {
      window: '15m', cvdNotional: assembled.cvdNotional, stale: cvd.stale, updatedAt: cvd.updatedAt,
      direction: assembled.cvdNotional == null ? null : assembled.cvdNotional > 0 ? 'BUY_DOMINANT' : assembled.cvdNotional < 0 ? 'SELL_DOMINANT' : 'BALANCED',
      buySharePct: assembled.buySharePct, sellSharePct: assembled.sellSharePct,
      tradeCount: assembled.tradeCount,
    },
    openInterest: market?.openInterest ?? null, funding: market?.funding ?? null,
    liquidations, marketState: evaluateMarketState(assembled),
    annotations: listChartAnnotations({ symbol }, db),
  }
}

/** Old trades retain only information actually saved at entry. No live backfill. */
export function historicalIndicatorSnapshot(trade, check) {
  return {
    version: 1, kind: 'HISTORICAL_PARTIAL', symbol: trade.symbol, timeframe: null,
    capturedAt: trade.createdAt, provider: null, marketStatus: 'HISTORICAL_PARTIAL',
    indicators: null, referencePrice: trade.entryPrice,
    orderFlow: { window: '15m', cvdNotional: trade.cvdNotional, buySharePct: trade.buySharePct, sellSharePct: trade.sellSharePct },
    openInterest: { changePct: trade.oiChangePct }, funding: { rate: trade.fundingRate },
    liquidations: { long: { estimatedNotional: trade.longLiquidationNotional }, short: { estimatedNotional: trade.shortLiquidationNotional } },
    marketState: check?.marketStateSnapshot ?? { primaryState: trade.primaryState },
    annotations: check?.autoEvidence?.linkedAnnotations ?? [],
  }
}
