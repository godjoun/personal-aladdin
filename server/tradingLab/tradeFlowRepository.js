/**
 * tradeFlowRepository.js — 1분 bucket + 15분 장기 aggregate
 *
 * raw publicTrade 는 저장하지 않는다.
 * 실시간 CVD 는 1분 bucket, 장기 연구 는 trade_flow_aggregate.
 * prune 전에 닫힌 15분 구간을 aggregate 로 REPLACE upsert 한다.
 */

import { getDb } from '../db.js'
import {
  TRADE_FLOW_AGGREGATE_INTERVAL_SECONDS,
  TRADE_FLOW_BUCKET_INTERVAL_SECONDS,
  TRADE_FLOW_RETENTION_MS,
  TRADE_FLOW_SOURCE,
  TRADE_FLOW_STALE_MS,
  TRADING_LAB_CVD_WINDOW_MS,
} from './constants.js'
import {
  alignedPruneBeforeMs,
  groupMinuteBucketsToAggregates,
  summarizeCvdWindow,
} from './cvdService.js'
import { refreshTradeFlowBucketDeltas } from './tradeEvent.js'

const BUCKET_COLUMNS = `symbol, bucketStart, intervalSeconds,
      buyVolume, sellVolume, buyNotional, sellNotional,
      tradeCount, deltaVolume, deltaNotional, updatedAt`

/**
 * @param {object} row
 */
export function mapTradeFlowBucket(row) {
  if (!row) return null
  return refreshTradeFlowBucketDeltas({
    symbol: row.symbol,
    bucketStart: row.bucketStart,
    intervalSeconds: Number(row.intervalSeconds) || TRADE_FLOW_BUCKET_INTERVAL_SECONDS,
    buyVolume: Number(row.buyVolume) || 0,
    sellVolume: Number(row.sellVolume) || 0,
    buyNotional: Number(row.buyNotional) || 0,
    sellNotional: Number(row.sellNotional) || 0,
    tradeCount: Number(row.tradeCount) || 0,
    deltaVolume: Number(row.deltaVolume) || 0,
    deltaNotional: Number(row.deltaNotional) || 0,
    updatedAt: row.updatedAt,
  })
}

/**
 * @param {string} table
 * @param {object} bucket
 * @param {import('better-sqlite3').Database} db
 */
function upsertFlowRow(table, bucket, db) {
  const next = refreshTradeFlowBucketDeltas({ ...bucket })
  const updatedAt = next.updatedAt || new Date().toISOString()
  db.prepare(
    `INSERT INTO ${table} (
      ${BUCKET_COLUMNS}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, bucketStart, intervalSeconds) DO UPDATE SET
      buyVolume = excluded.buyVolume,
      sellVolume = excluded.sellVolume,
      buyNotional = excluded.buyNotional,
      sellNotional = excluded.sellNotional,
      tradeCount = excluded.tradeCount,
      deltaVolume = excluded.deltaVolume,
      deltaNotional = excluded.deltaNotional,
      updatedAt = excluded.updatedAt`,
  ).run(
    next.symbol,
    next.bucketStart,
    next.intervalSeconds,
    next.buyVolume,
    next.sellVolume,
    next.buyNotional,
    next.sellNotional,
    next.tradeCount,
    next.deltaVolume,
    next.deltaNotional,
    updatedAt,
  )
  return mapTradeFlowBucket(
    db
      .prepare(
        `SELECT * FROM ${table}
         WHERE symbol = ? AND bucketStart = ? AND intervalSeconds = ?`,
      )
      .get(next.symbol, next.bucketStart, next.intervalSeconds),
  )
}

/**
 * 메모리 집계 결과를 절대값으로 upsert 한다 (replace).
 *
 * @param {object} bucket
 * @param {import('better-sqlite3').Database} [db]
 */
export function upsertTradeFlowBucket(bucket, db = getDb()) {
  return upsertFlowRow('trade_flow_bucket', bucket, db)
}

/**
 * 15분 장기 요약. REPLACE 이므로 같은 구간 재집계가 누적되지 않는다.
 *
 * @param {object} bucket
 * @param {import('better-sqlite3').Database} [db]
 */
export function upsertTradeFlowAggregate(bucket, db = getDb()) {
  return upsertFlowRow(
    'trade_flow_aggregate',
    {
      ...bucket,
      intervalSeconds:
        bucket.intervalSeconds ?? TRADE_FLOW_AGGREGATE_INTERVAL_SECONDS,
    },
    db,
  )
}

/**
 * @param {{
 *   table: string,
 *   symbol?: string,
 *   since?: string,
 *   before?: string,
 *   intervalSeconds?: number,
 * }} filter
 * @param {import('better-sqlite3').Database} db
 */
function listFlowRows(filter, db) {
  const conditions = ['intervalSeconds = ?']
  const params = [filter.intervalSeconds]
  if (filter.symbol) {
    conditions.push('symbol = ?')
    params.push(filter.symbol)
  }
  if (filter.since) {
    conditions.push('bucketStart >= ?')
    params.push(filter.since)
  }
  if (filter.before) {
    conditions.push('bucketStart < ?')
    params.push(filter.before)
  }
  return db
    .prepare(
      `SELECT * FROM ${filter.table}
       WHERE ${conditions.join(' AND ')}
       ORDER BY bucketStart ASC`,
    )
    .all(...params)
    .map(mapTradeFlowBucket)
}

/**
 * @param {{ symbol?: string, since?: string, before?: string, intervalSeconds?: number }} [filter]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listTradeFlowBuckets(filter = {}, db = getDb()) {
  return listFlowRows(
    {
      table: 'trade_flow_bucket',
      intervalSeconds: filter.intervalSeconds ?? TRADE_FLOW_BUCKET_INTERVAL_SECONDS,
      symbol: filter.symbol,
      since: filter.since,
      before: filter.before,
    },
    db,
  )
}

/**
 * 장기 통계/백테스트용 15분 aggregate 조회.
 *
 * @param {{ symbol?: string, since?: string, before?: string, intervalSeconds?: number }} [filter]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listTradeFlowAggregates(filter = {}, db = getDb()) {
  return listFlowRows(
    {
      table: 'trade_flow_aggregate',
      intervalSeconds:
        filter.intervalSeconds ?? TRADE_FLOW_AGGREGATE_INTERVAL_SECONDS,
      symbol: filter.symbol,
      since: filter.since,
      before: filter.before,
    },
    db,
  )
}

/**
 * 닫힌 1분 bucket 을 15분 aggregate 로 REPLACE upsert 한다.
 *
 * @param {{ before?: string, nowMs?: number, intervalSeconds?: number }} [options]
 * @param {import('better-sqlite3').Database} [db]
 */
export function rollupTradeFlowAggregates(options = {}, db = getDb()) {
  const intervalSeconds =
    options.intervalSeconds ?? TRADE_FLOW_AGGREGATE_INTERVAL_SECONDS
  const minuteBuckets = listTradeFlowBuckets({ before: options.before }, db)
  const aggregates = groupMinuteBucketsToAggregates(minuteBuckets, {
    intervalSeconds,
    nowMs: options.nowMs,
  })
  for (const aggregate of aggregates) {
    upsertTradeFlowAggregate(aggregate, db)
  }
  return aggregates
}

/**
 * prune 전에 15분 aggregate 를 만들고, 1분 bucket 만 삭제한다.
 * aggregate 는 삭제하지 않는다.
 *
 * @param {{ olderThanMs?: number, nowMs?: number }} [options]
 * @param {import('better-sqlite3').Database} [db]
 * @returns {{ deleted: number, rolledUp: number }}
 */
export function pruneTradeFlowBuckets(options = {}, db = getDb()) {
  const nowMs = options.nowMs ?? Date.now()
  const olderThanMs = options.olderThanMs ?? TRADE_FLOW_RETENTION_MS
  const deleteBeforeMs = alignedPruneBeforeMs(nowMs, olderThanMs)
  const deleteBeforeIso = new Date(deleteBeforeMs).toISOString()
  const rolled = rollupTradeFlowAggregates(
    { before: deleteBeforeIso, nowMs },
    db,
  )
  const result = db
    .prepare('DELETE FROM trade_flow_bucket WHERE bucketStart < ?')
    .run(deleteBeforeIso)
  return { deleted: result.changes || 0, rolledUp: rolled.length }
}

/**
 * raw trade 테이블이 생기면 안 된다.
 *
 * @param {import('better-sqlite3').Database} [db]
 */
export function listTradeFlowTables(db = getDb()) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name LIKE '%trade%'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name)
}

/**
 * 실시간 Trading Lab CVD. 1분 bucket 만 사용한다.
 *
 * @param {{
 *   symbol: string,
 *   window?: string,
 *   nowMs?: number,
 *   intervalSeconds?: number,
 * }} params
 * @param {import('better-sqlite3').Database} [db]
 */
export function getCvdSummary(params, db = getDb()) {
  const window = params.window || '15m'
  const windowMs = TRADING_LAB_CVD_WINDOW_MS[window]
  const nowMs = params.nowMs ?? Date.now()
  const intervalSeconds =
    params.intervalSeconds ?? TRADE_FLOW_BUCKET_INTERVAL_SECONDS
  const since = new Date(nowMs - windowMs).toISOString()
  const buckets = listTradeFlowBuckets(
    { symbol: params.symbol, since, intervalSeconds },
    db,
  )
  const summary = summarizeCvdWindow(buckets)
  const updatedAt = buckets.reduce((latest, bucket) => {
    if (!bucket.updatedAt) return latest
    if (!latest || bucket.updatedAt > latest) return bucket.updatedAt
    return latest
  }, null)
  const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN
  const stale =
    !Number.isFinite(updatedMs) || nowMs - updatedMs > TRADE_FLOW_STALE_MS

  return {
    symbol: params.symbol,
    provider: TRADE_FLOW_SOURCE,
    window,
    ...summary,
    updatedAt,
    stale,
    bucketCount: buckets.length,
  }
}

/**
 * 장기 통계/백테스트용. 15분 aggregate 만 사용한다.
 * 실시간 CVD API 는 이 함수를 쓰지 않는다.
 *
 * @param {{
 *   symbol: string,
 *   since?: string,
 *   before?: string,
 * }} params
 * @param {import('better-sqlite3').Database} [db]
 */
export function getHistoricalCvdSummary(params, db = getDb()) {
  const rows = listTradeFlowAggregates(
    { symbol: params.symbol, since: params.since, before: params.before },
    db,
  )
  return {
    symbol: params.symbol,
    provider: TRADE_FLOW_SOURCE,
    source: 'aggregate',
    intervalSeconds: TRADE_FLOW_AGGREGATE_INTERVAL_SECONDS,
    ...summarizeCvdWindow(rows),
    bucketCount: rows.length,
    updatedAt: rows.reduce((latest, row) => {
      if (!row.updatedAt) return latest
      if (!latest || row.updatedAt > latest) return row.updatedAt
      return latest
    }, null),
  }
}
