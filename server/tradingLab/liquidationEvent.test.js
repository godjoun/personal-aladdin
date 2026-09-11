/**
 * liquidationEvent.test.js — 관측 청산 정규화 / 집계
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db.js'
import {
  aggregateLiquidationBuckets,
  mapBybitLiquidationSide,
  normalizeBybitLiquidationEvent,
  summarizeLiquidationSide,
} from './liquidationEvent.js'
import {
  getObservedLiquidationSummary,
  insertObservedLiquidation,
  listLiquidationSnapshots,
} from './liquidationRepository.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-liq-'))
  closeDb()
  return getDb({ dbPath: path.join(dir, 'lab.sqlite') })
}

function bybitEvent(overrides = {}) {
  return {
    T: 1_700_000_000_000,
    s: 'BTCUSDT',
    S: 'Buy',
    v: '0.5',
    p: '77000',
    ...overrides,
  }
}

afterEach(() => {
  closeDb()
})

describe('Bybit liquidation side mapping', () => {
  it('Buy 는 LONG position liquidation', () => {
    expect(mapBybitLiquidationSide('Buy')).toBe('LONG')
    const parsed = normalizeBybitLiquidationEvent(bybitEvent({ S: 'Buy' }))
    expect(parsed.ok).toBe(true)
    expect(parsed.value.liquidatedSide).toBe('LONG')
    expect(parsed.value.rawSide).toBe('Buy')
  })

  it('Sell 는 SHORT position liquidation', () => {
    expect(mapBybitLiquidationSide('Sell')).toBe('SHORT')
    const parsed = normalizeBybitLiquidationEvent(bybitEvent({ S: 'Sell' }))
    expect(parsed.ok).toBe(true)
    expect(parsed.value.liquidatedSide).toBe('SHORT')
  })
})

describe('liquidation event normalize', () => {
  it('malformed number / 비정상 값은 저장하지 않는다', () => {
    expect(normalizeBybitLiquidationEvent(bybitEvent({ p: 'nope' })).ok).toBe(false)
    expect(normalizeBybitLiquidationEvent(bybitEvent({ v: 'NaN' })).ok).toBe(false)
    expect(normalizeBybitLiquidationEvent(bybitEvent({ p: 'Infinity' })).ok).toBe(false)
    expect(normalizeBybitLiquidationEvent(bybitEvent({ p: '0' })).ok).toBe(false)
    expect(normalizeBybitLiquidationEvent(bybitEvent({ v: '-1' })).ok).toBe(false)
    expect(normalizeBybitLiquidationEvent(bybitEvent({ T: 'bad' })).ok).toBe(false)
  })

  it('allowlist 밖 symbol 과 side 는 거부한다', () => {
    expect(normalizeBybitLiquidationEvent(bybitEvent({ s: 'SOLUSDT' })).ok).toBe(false)
    expect(normalizeBybitLiquidationEvent(bybitEvent({ S: 'Long' })).ok).toBe(false)
  })

  it('ETHUSDT 이벤트를 저장한다', () => {
    const db = makeTempDb()
    const parsed = normalizeBybitLiquidationEvent(
      bybitEvent({ s: 'ETHUSDT', p: '2560', v: '10' }),
    )
    expect(parsed.ok).toBe(true)
    const saved = insertObservedLiquidation(parsed.value, db)
    expect(saved.inserted).toBe(true)
    expect(saved.event.symbol).toBe('ETHUSDT')
    expect(saved.event.estimatedNotional).toBe(25600)
  })
})

describe('liquidation persistence / aggregation', () => {
  it('duplicate event 는 중복 저장하지 않는다', () => {
    const db = makeTempDb()
    const parsed = normalizeBybitLiquidationEvent(bybitEvent())
    expect(insertObservedLiquidation(parsed.value, db).inserted).toBe(true)
    expect(insertObservedLiquidation(parsed.value, db).inserted).toBe(false)
    expect(listLiquidationSnapshots({ symbol: 'BTCUSDT' }, db)).toHaveLength(1)
  })

  it('다른 수량/시각 이벤트는 합치지 않는다', () => {
    const db = makeTempDb()
    insertObservedLiquidation(normalizeBybitLiquidationEvent(bybitEvent()).value, db)
    insertObservedLiquidation(
      normalizeBybitLiquidationEvent(bybitEvent({ v: '0.6' })).value,
      db,
    )
    insertObservedLiquidation(
      normalizeBybitLiquidationEvent(bybitEvent({ T: 1_700_000_000_001 })).value,
      db,
    )
    expect(listLiquidationSnapshots({ symbol: 'BTCUSDT' }, db)).toHaveLength(3)
  })

  it('SQLite restart 후에도 관측 청산이 남는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-liq-persist-'))
    const dbPath = path.join(dir, 'lab.sqlite')
    closeDb()
    const db = getDb({ dbPath })
    insertObservedLiquidation(normalizeBybitLiquidationEvent(bybitEvent()).value, db)
    closeDb()

    const reopened = getDb({ dbPath })
    expect(listLiquidationSnapshots({ symbol: 'BTCUSDT' }, reopened)).toHaveLength(1)
  })

  it('5m/15m/1h window 와 LONG/SHORT notional 을 집계한다', () => {
    const db = makeTempDb()
    const nowMs = 1_700_000_900_000
    insertObservedLiquidation(
      normalizeBybitLiquidationEvent(
        bybitEvent({ T: nowMs - 2 * 60 * 1000, S: 'Buy', v: '1', p: '77000' }),
      ).value,
      db,
    )
    insertObservedLiquidation(
      normalizeBybitLiquidationEvent(
        bybitEvent({ T: nowMs - 10 * 60 * 1000, S: 'Sell', v: '2', p: '77100' }),
      ).value,
      db,
    )

    const five = getObservedLiquidationSummary(
      { symbol: 'BTCUSDT', window: '5m', nowMs },
      db,
    )
    expect(five.long.count).toBe(1)
    expect(five.short.count).toBe(0)
    expect(five.long.estimatedNotional).toBe(77000)

    const fifteen = getObservedLiquidationSummary(
      { symbol: 'BTCUSDT', window: '15m', nowMs },
      db,
    )
    expect(fifteen.long.count).toBe(1)
    expect(fifteen.short.count).toBe(1)

    const hour = getObservedLiquidationSummary(
      { symbol: 'BTCUSDT', window: '1h', nowMs },
      db,
    )
    expect(hour.long.count).toBe(1)
    expect(hour.short.count).toBe(1)
    expect(hour.short.estimatedNotional).toBe(154200)
    expect(hour.buckets.length).toBeGreaterThan(0)
  })

  it('price bucket 은 기준가 대비 bps 폭을 사용한다', () => {
    const buckets = aggregateLiquidationBuckets(
      [
        { symbol: 'BTCUSDT', price: 77000, estimatedNotional: 77000, liquidatedSide: 'LONG' },
        { symbol: 'BTCUSDT', price: 77020, estimatedNotional: 77020, liquidatedSide: 'LONG' },
        { symbol: 'BTCUSDT', price: 78000, estimatedNotional: 78000, liquidatedSide: 'SHORT' },
      ],
      { referencePrice: 77000, bucketBps: 5 },
    )
    expect(buckets.length).toBeGreaterThan(1)
    const first = buckets[0]
    expect(first.eventCount).toBeGreaterThan(0)
    expect(first.priceHigh).toBeGreaterThan(first.priceLow)
  })

  it('weighted average price 를 계산한다', () => {
    const summary = summarizeLiquidationSide([
      { price: 100, quantity: 1, estimatedNotional: 100 },
      { price: 200, quantity: 3, estimatedNotional: 600 },
    ])
    expect(summary.weightedAveragePrice).toBe(175)
    expect(summary.largestEvent.estimatedNotional).toBe(600)
  })
})
