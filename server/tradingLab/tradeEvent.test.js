/**
 * tradeEvent.test.js — publicTrade 정규화 / bucket / dedupe
 */

import { describe, expect, it } from 'vitest'
import {
  applyTradeToBucket,
  bucketStartMs,
  createEmptyTradeFlowBucket,
  createTradeIdCache,
  extractBybitPublicTradeRows,
  mapBybitTradeSide,
  normalizeBybitPublicTrade,
} from './tradeEvent.js'
import { summarizeCvdWindow, groupMinuteBucketsToAggregates } from './cvdService.js'

function trade(overrides = {}) {
  return {
    T: 1_700_000_030_000,
    s: 'BTCUSDT',
    S: 'Buy',
    v: '0.2',
    p: '77000',
    i: 'trade-1',
    seq: 100,
    ...overrides,
  }
}

describe('Bybit publicTrade side mapping', () => {
  it('S=Buy 는 aggressive/taker buy', () => {
    expect(mapBybitTradeSide('Buy')).toBe('BUY')
    const parsed = normalizeBybitPublicTrade(trade({ S: 'Buy' }))
    expect(parsed.ok).toBe(true)
    expect(parsed.value.side).toBe('BUY')
    expect(parsed.value.rawSide).toBe('Buy')
  })

  it('S=Sell 는 aggressive/taker sell', () => {
    expect(mapBybitTradeSide('Sell')).toBe('SELL')
    const parsed = normalizeBybitPublicTrade(trade({ S: 'Sell' }))
    expect(parsed.ok).toBe(true)
    expect(parsed.value.side).toBe('SELL')
  })
})

describe('publicTrade normalize', () => {
  it('Buy/Sell volume 과 notional 을 계산한다', () => {
    const buy = normalizeBybitPublicTrade(trade({ v: '0.2', p: '77000', S: 'Buy' }))
    expect(buy.value.volume).toBe(0.2)
    expect(buy.value.notional).toBe(15400)

    const sell = normalizeBybitPublicTrade(
      trade({ i: 't2', v: '0.5', p: '100', S: 'Sell', s: 'ETHUSDT' }),
    )
    expect(sell.value.volume).toBe(0.5)
    expect(sell.value.notional).toBe(50)
    expect(sell.value.symbol).toBe('ETHUSDT')
  })

  it('1분 bucket 시작 시각으로 정렬한다', () => {
    const start = 1_700_000_040_000
    expect(bucketStartMs(start + 30_000)).toBe(start)
    const parsed = normalizeBybitPublicTrade(trade({ T: start + 59_999 }))
    expect(parsed.value.bucketStart).toBe(new Date(start).toISOString())
    const next = normalizeBybitPublicTrade(trade({ T: start + 60_000, i: 't2' }))
    expect(next.value.bucketStart).toBe(new Date(start + 60_000).toISOString())
  })

  it('malformed p/v 와 trade id 없는 값은 거부한다', () => {
    expect(normalizeBybitPublicTrade(trade({ p: 'nope' })).ok).toBe(false)
    expect(normalizeBybitPublicTrade(trade({ v: 'NaN' })).ok).toBe(false)
    expect(normalizeBybitPublicTrade(trade({ p: 'Infinity' })).ok).toBe(false)
    expect(normalizeBybitPublicTrade(trade({ p: '0' })).ok).toBe(false)
    expect(normalizeBybitPublicTrade(trade({ v: '-1' })).ok).toBe(false)
    expect(normalizeBybitPublicTrade(trade({ T: 'bad' })).ok).toBe(false)
    expect(normalizeBybitPublicTrade(trade({ i: '' })).ok).toBe(false)
    expect(normalizeBybitPublicTrade(trade({ i: undefined })).ok).toBe(false)
  })

  it('allowlist 밖 symbol 과 side 는 거부한다', () => {
    expect(normalizeBybitPublicTrade(trade({ s: 'SOLUSDT' })).ok).toBe(false)
    expect(normalizeBybitPublicTrade(trade({ S: 'Long' })).ok).toBe(false)
  })

  it('같은 seq 의 여러 trade 는 각각 유효하다', () => {
    const a = normalizeBybitPublicTrade(trade({ i: 'a', seq: 9, v: '1' }))
    const b = normalizeBybitPublicTrade(trade({ i: 'b', seq: 9, v: '2' }))
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(a.value.seq).toBe(9)
    expect(b.value.seq).toBe(9)
    expect(a.value.tradeId).not.toBe(b.value.tradeId)
  })
})

describe('trade id dedupe cache', () => {
  it('duplicate trade id 는 무시하고 seq 는 키가 아니다', () => {
    const cache = createTradeIdCache()
    expect(cache.remember('a')).toBe(true)
    expect(cache.remember('a')).toBe(false)
    expect(cache.remember('b')).toBe(true)
  })

  it('TTL 이 지나면 다시 받는다', () => {
    let nowMs = 1_000
    const cache = createTradeIdCache({
      ttlMs: 50,
      maxSize: 2,
      now: () => nowMs,
    })
    expect(cache.remember('a')).toBe(true)
    nowMs = 1_060
    expect(cache.remember('a')).toBe(true)
    cache.remember('b')
    cache.remember('c')
    expect(cache.size()).toBeLessThanOrEqual(2)
  })
})

describe('bucket aggregation', () => {
  it('Buy/Sell 을 같은 1분 bucket 에 누적한다', () => {
    const bucket = createEmptyTradeFlowBucket({
      symbol: 'BTCUSDT',
      bucketStart: new Date(1_700_000_000_000).toISOString(),
    })
    applyTradeToBucket(bucket, normalizeBybitPublicTrade(trade()).value)
    applyTradeToBucket(
      bucket,
      normalizeBybitPublicTrade(trade({ i: 't2', S: 'Sell', v: '0.1', p: '77000' }))
        .value,
    )
    expect(bucket.buyVolume).toBeCloseTo(0.2)
    expect(bucket.sellVolume).toBeCloseTo(0.1)
    expect(bucket.buyNotional).toBeCloseTo(15400)
    expect(bucket.sellNotional).toBeCloseTo(7700)
    expect(bucket.deltaVolume).toBeCloseTo(0.1)
    expect(bucket.deltaNotional).toBeCloseTo(7700)
    expect(bucket.tradeCount).toBe(2)
  })

  it('publicTrade topic 만 추출한다', () => {
    expect(
      extractBybitPublicTradeRows({
        topic: 'allLiquidation.BTCUSDT',
        data: [trade()],
      }),
    ).toEqual([])
    expect(
      extractBybitPublicTradeRows({
        topic: 'publicTrade.BTCUSDT',
        data: [trade(), trade({ i: 't2' })],
      }),
    ).toHaveLength(2)
  })

  it('zero volume window 는 share 가 null 이다', () => {
    const summary = summarizeCvdWindow([])
    expect(summary.buyVolume).toBe(0)
    expect(summary.sellVolume).toBe(0)
    expect(summary.cvd).toBe(0)
    expect(summary.cvdNotional).toBe(0)
    expect(summary.buySharePct).toBeNull()
    expect(summary.sellSharePct).toBeNull()
    expect(summary.tradeCount).toBe(0)
  })

  it('1분 bucket 합계를 15분 aggregate 로 만든다', () => {
    const start = 1_700_000_100_000
    const groups = groupMinuteBucketsToAggregates(
      [
        {
          symbol: 'BTCUSDT',
          bucketStart: new Date(start).toISOString(),
          buyVolume: 2,
          sellVolume: 0,
          buyNotional: 20,
          sellNotional: 0,
          tradeCount: 1,
          updatedAt: new Date(start).toISOString(),
        },
        {
          symbol: 'BTCUSDT',
          bucketStart: new Date(start + 60_000).toISOString(),
          buyVolume: 0,
          sellVolume: 1,
          buyNotional: 0,
          sellNotional: 10,
          tradeCount: 1,
          updatedAt: new Date(start + 60_000).toISOString(),
        },
      ],
      { nowMs: start + 15 * 60_000 },
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].intervalSeconds).toBe(900)
    expect(groups[0].buyVolume).toBe(2)
    expect(groups[0].sellVolume).toBe(1)
    expect(groups[0].deltaNotional).toBe(10)
    expect(groups[0].tradeCount).toBe(2)
  })
})
