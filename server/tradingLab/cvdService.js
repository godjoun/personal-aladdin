/**
 * cvdService.js — bucket / aggregate 로 window CVD 계산
 *
 * CVD volume = Σ(buyVolume - sellVolume)
 * CVD notional = Σ(buyNotional - sellNotional)
 * 실시간 API 는 1분 bucket, 장기 연구 는 15분 aggregate.
 * 자동 매매/방향 추천은 하지 않는다.
 */

import { TRADE_FLOW_AGGREGATE_INTERVAL_SECONDS } from './constants.js'
import {
  bucketStartMs,
  createEmptyTradeFlowBucket,
  refreshTradeFlowBucketDeltas,
} from './tradeEvent.js'

/**
 * @param {unknown} value
 */
function asFinite(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/**
 * @param {number} part
 * @param {number} total
 * @returns {number | null}
 */
export function sharePct(part, total) {
  if (!(total > 0)) return null
  return (part / total) * 100
}

/**
 * @param {Array<object>} buckets
 */
export function summarizeCvdWindow(buckets) {
  const list = Array.isArray(buckets) ? buckets : []
  let buyVolume = 0
  let sellVolume = 0
  let buyNotional = 0
  let sellNotional = 0
  let tradeCount = 0

  for (const bucket of list) {
    buyVolume += asFinite(bucket.buyVolume)
    sellVolume += asFinite(bucket.sellVolume)
    buyNotional += asFinite(bucket.buyNotional)
    sellNotional += asFinite(bucket.sellNotional)
    tradeCount += asFinite(bucket.tradeCount)
  }

  const deltaVolume = buyVolume - sellVolume
  const deltaNotional = buyNotional - sellNotional
  const totalNotional = buyNotional + sellNotional
  const totalVolume = buyVolume + sellVolume
  const buySharePct =
    totalNotional > 0
      ? sharePct(buyNotional, totalNotional)
      : sharePct(buyVolume, totalVolume)
  const sellSharePct =
    totalNotional > 0
      ? sharePct(sellNotional, totalNotional)
      : sharePct(sellVolume, totalVolume)

  return {
    buyVolume,
    sellVolume,
    deltaVolume,
    cvd: deltaVolume,
    buyNotional,
    sellNotional,
    deltaNotional,
    cvdNotional: deltaNotional,
    buySharePct,
    sellSharePct,
    tradeCount,
  }
}

/**
 * 1분 bucket 을 15분(기본) 구간으로 합친다. ADD 가 아니라 구간 합계를 새로 계산한다.
 *
 * @param {Array<object>} minuteBuckets
 * @param {{
 *   intervalSeconds?: number,
 *   nowMs?: number,
 * }} [options]
 */
export function groupMinuteBucketsToAggregates(minuteBuckets, options = {}) {
  const intervalSeconds =
    options.intervalSeconds ?? TRADE_FLOW_AGGREGATE_INTERVAL_SECONDS
  const nowMs = options.nowMs
  const intervalMs = intervalSeconds * 1000
  /** @type {Map<string, object>} */
  const groups = new Map()

  for (const bucket of Array.isArray(minuteBuckets) ? minuteBuckets : []) {
    const startMs = Date.parse(bucket.bucketStart)
    if (!Number.isFinite(startMs)) continue
    const aggStartMs = bucketStartMs(startMs, intervalSeconds)
    if (nowMs != null && aggStartMs + intervalMs > nowMs) continue

    const symbol = bucket.symbol
    const key = `${symbol}:${aggStartMs}`
    let current = groups.get(key)
    if (!current) {
      current = createEmptyTradeFlowBucket({
        symbol,
        bucketStart: new Date(aggStartMs).toISOString(),
        intervalSeconds,
      })
      groups.set(key, current)
    }
    current.buyVolume += asFinite(bucket.buyVolume)
    current.sellVolume += asFinite(bucket.sellVolume)
    current.buyNotional += asFinite(bucket.buyNotional)
    current.sellNotional += asFinite(bucket.sellNotional)
    current.tradeCount += asFinite(bucket.tradeCount)
    if (bucket.updatedAt && bucket.updatedAt > current.updatedAt) {
      current.updatedAt = bucket.updatedAt
    }
    refreshTradeFlowBucketDeltas(current)
  }

  return [...groups.values()].sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol)
    return a.bucketStart.localeCompare(b.bucketStart)
  })
}

/**
 * 1분 prune 경계를 15분 구간에 맞춰 내린다.
 * 한 15분 창을 반만 지우면 aggregate REPLACE 가 깨진다.
 *
 * @param {number} nowMs
 * @param {number} olderThanMs
 * @param {number} [intervalSeconds]
 */
export function alignedPruneBeforeMs(
  nowMs,
  olderThanMs,
  intervalSeconds = TRADE_FLOW_AGGREGATE_INTERVAL_SECONDS,
) {
  return bucketStartMs(nowMs - olderThanMs, intervalSeconds)
}
