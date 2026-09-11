/**
 * tradeFlowRepository.test.js — 1분 bucket SQLite / CVD window
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db.js'
import {
  getCvdSummary,
  getHistoricalCvdSummary,
  listTradeFlowAggregates,
  listTradeFlowBuckets,
  listTradeFlowTables,
  pruneTradeFlowBuckets,
  rollupTradeFlowAggregates,
  upsertTradeFlowAggregate,
  upsertTradeFlowBucket,
} from './tradeFlowRepository.js'
import {
  applyTradeToBucket,
  createEmptyTradeFlowBucket,
  normalizeBybitPublicTrade,
} from './tradeEvent.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-cvd-'))
  closeDb()
  return { db: getDb({ dbPath: path.join(dir, 'lab.sqlite') }), dbPath: path.join(dir, 'lab.sqlite') }
}

function bucketFromTrades(trades, bucketStartMs = 1_700_000_000_000) {
  const bucket = createEmptyTradeFlowBucket({
    symbol: trades[0]?.s || 'BTCUSDT',
    bucketStart: new Date(bucketStartMs).toISOString(),
  })
  for (const raw of trades) {
    const parsed = normalizeBybitPublicTrade({
      T: bucketStartMs + 1_000,
      s: 'BTCUSDT',
      S: 'Buy',
      v: '1',
      p: '100',
      i: 'x',
      ...raw,
    })
    applyTradeToBucket(bucket, parsed.value)
  }
  return bucket
}

afterEach(() => {
  closeDb()
})

describe('trade_flow_bucket persistence', () => {
  it('1분 bucket 을 upsert 하고 재시작 후에도 CVD 를 계산한다', () => {
    const { db, dbPath } = makeTempDb()
    const first = bucketFromTrades([
      { i: 'b1', S: 'Buy', v: '2', p: '100' },
      { i: 's1', S: 'Sell', v: '0.5', p: '100' },
    ])
    upsertTradeFlowBucket(first, db)
    db.close()

    const db2 = getDb({ dbPath })
    const rows = listTradeFlowBuckets({ symbol: 'BTCUSDT' }, db2)
    expect(rows).toHaveLength(1)
    expect(rows[0].buyVolume).toBe(2)
    expect(rows[0].sellVolume).toBe(0.5)
    expect(rows[0].buyNotional).toBe(200)
    expect(rows[0].sellNotional).toBe(50)
    expect(rows[0].deltaVolume).toBe(1.5)
    expect(rows[0].tradeCount).toBe(2)

    const nowMs = 1_700_000_000_000 + 60_000
    const summary = getCvdSummary(
      { symbol: 'BTCUSDT', window: '5m', nowMs },
      db2,
    )
    expect(summary.provider).toBe('BYBIT')
    expect(summary.window).toBe('5m')
    expect(summary.buyVolume).toBe(2)
    expect(summary.sellVolume).toBe(0.5)
    expect(summary.deltaVolume).toBe(1.5)
    expect(summary.cvd).toBe(1.5)
    expect(summary.cvdNotional).toBe(150)
    expect(summary.buySharePct).toBe(80)
    expect(summary.sellSharePct).toBe(20)
    db2.close()
  })

  it('같은 bucket 키는 한 행만 유지해 DB 폭증을 막는다', () => {
    const { db } = makeTempDb()
    const bucket = bucketFromTrades([{ i: 'a', S: 'Buy', v: '1', p: '10' }])
    upsertTradeFlowBucket(bucket, db)
    bucket.buyVolume = 5
    bucket.buyNotional = 50
    bucket.tradeCount = 5
    upsertTradeFlowBucket(bucket, db)
    expect(listTradeFlowBuckets({ symbol: 'BTCUSDT' }, db)).toHaveLength(1)
    expect(listTradeFlowBuckets({ symbol: 'BTCUSDT' }, db)[0].buyVolume).toBe(5)
    const tableNames = listTradeFlowTables(db)
    expect(tableNames).toContain('trade_flow_bucket')
    expect(tableNames).toContain('trade_flow_aggregate')
    expect(tableNames.some((name) => /raw|tick|public_trade/i.test(name))).toBe(false)
  })

  it('5m/15m/1h window CVD 를 누적한다', () => {
    const { db } = makeTempDb()
    const nowMs = 1_700_004_000_000
    upsertTradeFlowBucket(
      bucketFromTrades([{ i: 'a', S: 'Buy', v: '1', p: '10' }], nowMs - 2 * 60_000),
      db,
    )
    upsertTradeFlowBucket(
      bucketFromTrades([{ i: 'b', S: 'Sell', v: '1', p: '10' }], nowMs - 10 * 60_000),
      db,
    )
    upsertTradeFlowBucket(
      bucketFromTrades([{ i: 'c', S: 'Buy', v: '3', p: '10' }], nowMs - 40 * 60_000),
      db,
    )
    const five = getCvdSummary({ symbol: 'BTCUSDT', window: '5m', nowMs }, db)
    expect(five.buyVolume).toBe(1)
    expect(five.sellVolume).toBe(0)
    expect(five.cvd).toBe(1)
    const fifteen = getCvdSummary({ symbol: 'BTCUSDT', window: '15m', nowMs }, db)
    expect(fifteen.buyVolume).toBe(1)
    expect(fifteen.sellVolume).toBe(1)
    expect(fifteen.cvd).toBe(0)
    const hour = getCvdSummary({ symbol: 'BTCUSDT', window: '1h', nowMs }, db)
    expect(hour.buyVolume).toBe(4)
    expect(hour.sellVolume).toBe(1)
    expect(hour.cvd).toBe(3)
  })

  it('zero volume 과 오래된 bucket prune 을 처리한다', () => {
    const { db } = makeTempDb()
    const oldStart = new Date(1_000_000_000_000).toISOString()
    upsertTradeFlowBucket(
      createEmptyTradeFlowBucket({ symbol: 'ETHUSDT', bucketStart: oldStart }),
      db,
    )
    const now = getCvdSummary(
      { symbol: 'ETHUSDT', window: '15m', nowMs: 1_700_000_000_000 },
      db,
    )
    expect(now.tradeCount).toBe(0)
    expect(now.cvd).toBe(0)
    expect(now.stale).toBe(true)

    const pruned = pruneTradeFlowBuckets(
      { nowMs: 1_700_000_000_000, olderThanMs: 48 * 60 * 60 * 1000 },
      db,
    )
    expect(pruned.deleted).toBe(1)
    expect(listTradeFlowBuckets({ symbol: 'ETHUSDT' }, db)).toHaveLength(0)
    expect(listTradeFlowAggregates({ symbol: 'ETHUSDT' }, db).length).toBeGreaterThan(0)
  })
})

describe('trade_flow_aggregate long-term rollup', () => {
  const WINDOW_START = 1_700_000_100_000
  const WINDOW_END = WINDOW_START + 15 * 60_000

  it('여러 1분 bucket 을 15분 aggregate 로 합친다', () => {
    const { db } = makeTempDb()
    upsertTradeFlowBucket(
      bucketFromTrades([{ i: 'a', S: 'Buy', v: '2', p: '10' }], WINDOW_START),
      db,
    )
    upsertTradeFlowBucket(
      bucketFromTrades(
        [{ i: 'b', S: 'Sell', v: '1', p: '10' }],
        WINDOW_START + 60_000,
      ),
      db,
    )
    upsertTradeFlowBucket(
      bucketFromTrades(
        [{ i: 'c', S: 'Buy', v: '3', p: '10' }],
        WINDOW_START + 8 * 60_000,
      ),
      db,
    )
    const rolled = rollupTradeFlowAggregates({ nowMs: WINDOW_END }, db)
    expect(rolled).toHaveLength(1)
    expect(rolled[0].intervalSeconds).toBe(900)
    expect(rolled[0].symbol).toBe('BTCUSDT')
    expect(rolled[0].bucketStart).toBe(new Date(WINDOW_START).toISOString())
    expect(rolled[0].buyVolume).toBe(5)
    expect(rolled[0].sellVolume).toBe(1)
    expect(rolled[0].buyNotional).toBe(50)
    expect(rolled[0].sellNotional).toBe(10)
    expect(rolled[0].deltaVolume).toBe(4)
    expect(rolled[0].deltaNotional).toBe(40)
    expect(rolled[0].tradeCount).toBe(3)
  })

  it('같은 구간 재집계는 중복되지 않는다', () => {
    const { db } = makeTempDb()
    upsertTradeFlowBucket(
      bucketFromTrades([{ i: 'a', S: 'Buy', v: '2', p: '10' }], WINDOW_START),
      db,
    )
    rollupTradeFlowAggregates({ nowMs: WINDOW_END }, db)
    rollupTradeFlowAggregates({ nowMs: WINDOW_END }, db)
    const rows = listTradeFlowAggregates({ symbol: 'BTCUSDT' }, db)
    expect(rows).toHaveLength(1)
    expect(rows[0].buyVolume).toBe(2)
    expect(rows[0].tradeCount).toBe(1)
  })

  it('prune 후 1분은 사라지고 15분 aggregate 는 남는다', () => {
    const { db } = makeTempDb()
    upsertTradeFlowBucket(
      bucketFromTrades([{ i: 'a', S: 'Buy', v: '2', p: '10' }], WINDOW_START),
      db,
    )
    const pruned = pruneTradeFlowBuckets(
      { nowMs: WINDOW_END + 48 * 60 * 60 * 1000, olderThanMs: 48 * 60 * 60 * 1000 },
      db,
    )
    expect(pruned.deleted).toBe(1)
    expect(pruned.rolledUp).toBe(1)
    expect(listTradeFlowBuckets({ symbol: 'BTCUSDT' }, db)).toHaveLength(0)
    const aggregates = listTradeFlowAggregates({ symbol: 'BTCUSDT' }, db)
    expect(aggregates).toHaveLength(1)
    expect(aggregates[0].buyVolume).toBe(2)
    expect(aggregates[0].intervalSeconds).toBe(900)
  })

  it('SQLite 재시작 후에도 15분 aggregate 가 유지된다', () => {
    const { db, dbPath } = makeTempDb()
    upsertTradeFlowBucket(
      bucketFromTrades([{ i: 'a', S: 'Buy', v: '4', p: '10' }], WINDOW_START),
      db,
    )
    rollupTradeFlowAggregates({ nowMs: WINDOW_END }, db)
    db.close()

    const db2 = getDb({ dbPath })
    const rows = listTradeFlowAggregates({ symbol: 'BTCUSDT' }, db2)
    expect(rows).toHaveLength(1)
    expect(rows[0].buyVolume).toBe(4)
    expect(getHistoricalCvdSummary({ symbol: 'BTCUSDT' }, db2).cvd).toBe(4)
    db2.close()
  })

  it('BTC/ETH 는 같은 시각이어도 분리된다', () => {
    const { db } = makeTempDb()
    upsertTradeFlowBucket(
      bucketFromTrades([{ i: 'btc', s: 'BTCUSDT', S: 'Buy', v: '1', p: '10' }], WINDOW_START),
      db,
    )
    upsertTradeFlowBucket(
      bucketFromTrades(
        [{ i: 'eth', s: 'ETHUSDT', S: 'Sell', v: '8', p: '5' }],
        WINDOW_START + 60_000,
      ),
      db,
    )
    rollupTradeFlowAggregates({ nowMs: WINDOW_END }, db)
    const btc = listTradeFlowAggregates({ symbol: 'BTCUSDT' }, db)
    const eth = listTradeFlowAggregates({ symbol: 'ETHUSDT' }, db)
    expect(btc).toHaveLength(1)
    expect(eth).toHaveLength(1)
    expect(btc[0].buyVolume).toBe(1)
    expect(eth[0].sellVolume).toBe(8)
    expect(btc[0].bucketStart).toBe(eth[0].bucketStart)
  })

  it('실시간 CVD API 는 1분 bucket 만 보고 aggregate 는 무시한다', () => {
    const { db } = makeTempDb()
    const recentStart = WINDOW_END + 60_000
    upsertTradeFlowAggregate(
      {
        symbol: 'BTCUSDT',
        bucketStart: new Date(WINDOW_START).toISOString(),
        intervalSeconds: 900,
        buyVolume: 999,
        sellVolume: 0,
        buyNotional: 9990,
        sellNotional: 0,
        tradeCount: 50,
        updatedAt: new Date(WINDOW_START).toISOString(),
      },
      db,
    )
    upsertTradeFlowBucket(
      bucketFromTrades([{ i: 'live', S: 'Buy', v: '1', p: '10' }], recentStart),
      db,
    )
    const live = getCvdSummary(
      { symbol: 'BTCUSDT', window: '15m', nowMs: recentStart + 60_000 },
      db,
    )
    expect(live.buyVolume).toBe(1)
    expect(live.tradeCount).toBe(1)
    expect(live.cvd).toBe(1)
    const historical = getHistoricalCvdSummary({ symbol: 'BTCUSDT' }, db)
    expect(historical.source).toBe('aggregate')
    expect(historical.buyVolume).toBe(999)
  })
})
