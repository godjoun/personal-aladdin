/**
 * bybitMarketDataProvider.test.js — Bybit V5 public market adapter (mock)
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BYBIT_BASE_URL,
  BYBIT_CACHE_TTL_MS,
  BYBIT_KLINE_INTERVAL,
  BYBIT_OI_INTERVAL,
  BYBIT_PROVIDER_ID,
  computeOpenInterestChange,
  computeVolumeRatio,
  createBybitMarketDataProvider,
  formatFundingRatePercent,
  inferCandleStructure,
  normalizeBybitCandles,
  normalizeBybitTicker,
  parseBybitNumber,
} from './bybitMarketDataProvider.js'
import { PROVIDER_STATUS } from './marketDataProvider.js'
import {
  getMarketSnapshot,
} from './marketSnapshotService.js'
import {
  registerMarketDataProvider,
  resetMarketDataProvider,
} from './marketDataProvider.js'

afterEach(() => {
  resetMarketDataProvider()
})

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    },
  }
}

function tickerPayload(overrides = {}) {
  return {
    retCode: 0,
    retMsg: 'OK',
    result: {
      category: 'linear',
      list: [
        {
          symbol: 'BTCUSDT',
          lastPrice: '65000.5',
          markPrice: '65010.1',
          indexPrice: '64990.2',
          price24hPcnt: '0.0123',
          highPrice24h: '66000',
          lowPrice24h: '64000',
          volume24h: '12345.6',
          turnover24h: '800000000',
          openInterest: '50000.1',
          openInterestValue: '3250000000',
          fundingRate: '0.0001',
          nextFundingTime: '1700000000000',
          bid1Price: '65000',
          ask1Price: '65001',
          ...overrides,
        },
      ],
    },
  }
}

function klinePayload(list) {
  return {
    retCode: 0,
    retMsg: 'OK',
    result: { symbol: 'BTCUSDT', category: 'linear', list },
  }
}

function oiPayload(list) {
  return {
    retCode: 0,
    retMsg: 'OK',
    result: { symbol: 'BTCUSDT', category: 'linear', list },
  }
}

describe('Bybit normalize helpers', () => {
  it('BTCUSDT ticker 를 안전하게 normalize 한다', () => {
    const data = normalizeBybitTicker(tickerPayload().result.list[0], '2026-01-01T00:00:00.000Z')
    expect(data).toMatchObject({
      symbol: 'BTCUSDT',
      lastPrice: 65000.5,
      markPrice: 65010.1,
      price: 65000.5,
      volume: 12345.6,
      fundingRate: 0.0001,
      priceChange: 0.0123,
    })
    expect(data.nextFundingTime).toBe(new Date(1700000000000).toISOString())
  })

  it('ETHUSDT ticker 도 normalize 한다', () => {
    const data = normalizeBybitTicker(
      { ...tickerPayload().result.list[0], symbol: 'ETHUSDT', lastPrice: '3500' },
      '2026-01-01T00:00:00.000Z',
    )
    expect(data.symbol).toBe('ETHUSDT')
    expect(data.lastPrice).toBe(3500)
  })

  it('malformed numeric 은 null 처리하고 NaN 을 허용하지 않는다', () => {
    expect(parseBybitNumber('not-a-number')).toBeNull()
    expect(parseBybitNumber(Number.NaN)).toBeNull()
    expect(parseBybitNumber(Number.POSITIVE_INFINITY)).toBeNull()
    expect(
      normalizeBybitTicker(
        { ...tickerPayload().result.list[0], lastPrice: 'oops' },
        '2026-01-01T00:00:00.000Z',
      ),
    ).toBeNull()
  })

  it('kline 최신순 응답을 오름차순으로 정렬한다', () => {
    const now = 1_700_000_900_000
    const candles = normalizeBybitCandles(
      [
        ['1700000900000', '3', '4', '2', '3.5', '30', '300'],
        ['1700000000000', '1', '2', '0.5', '1.5', '10', '100'],
        ['1700000450000', '2', '3', '1', '2.5', '20', '200'],
      ],
      15 * 60 * 1000,
      now,
    )
    expect(candles.map((c) => c.timestamp)).toEqual([
      1700000000000, 1700000450000, 1700000900000,
    ])
    expect(candles[0].open).toBe(1)
    expect(candles.every((c) => typeof c.closed === 'boolean')).toBe(true)
  })

  it('15m/1h/4h interval mapping 을 제공한다', () => {
    expect(BYBIT_KLINE_INTERVAL['15m']).toBe('15')
    expect(BYBIT_KLINE_INTERVAL['1h']).toBe('60')
    expect(BYBIT_KLINE_INTERVAL['4h']).toBe('240')
    expect(BYBIT_OI_INTERVAL['15m']).toBe('15min')
    expect(BYBIT_OI_INTERVAL['1h']).toBe('1h')
    expect(BYBIT_OI_INTERVAL['4h']).toBe('4h')
  })

  it('funding percentage formatting 이 정확하다', () => {
    expect(formatFundingRatePercent(0.0001)).toBe('+0.0100%')
    expect(formatFundingRatePercent(-0.0001)).toBe('-0.0100%')
    expect(formatFundingRatePercent(0)).toBe('0.0000%')
    expect(formatFundingRatePercent('bad')).toBeNull()
  })

  it('base URL 은 외부 입력으로 바꾸지 않는다', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(String(url).startsWith(BYBIT_BASE_URL)).toBe(true)
      return jsonResponse(tickerPayload({ symbol: 'ETHUSDT', lastPrice: '3500' }))
    })
    const provider = createBybitMarketDataProvider({
      fetchImpl,
      baseUrl: 'https://evil.example',
    })
    const ticker = await provider.getTicker({ symbol: 'ETHUSDT' })
    expect(ticker.status).toBe(PROVIDER_STATUS.OK)
    expect(ticker.data.lastPrice).toBe(3500)
  })

  it('OI change 와 zero division 을 안전 처리한다', () => {
    expect(
      computeOpenInterestChange([
        { openInterest: 100, timestamp: 1 },
        { openInterest: 110, timestamp: 2 },
      ]),
    ).toEqual({
      currentOpenInterest: 110,
      previousOpenInterest: 100,
      openInterestChange: 10,
      openInterestChangePct: 10,
    })

    expect(
      computeOpenInterestChange([
        { openInterest: 0, timestamp: 1 },
        { openInterest: 5, timestamp: 2 },
      ]).openInterestChangePct,
    ).toBeNull()

    expect(
      computeOpenInterestChange([
        { openInterest: 0, timestamp: 1 },
        { openInterest: 0, timestamp: 2 },
      ]).openInterestChangePct,
    ).toBe(0)
  })

  it('기초 시장 구조와 volume ratio 를 계산한다', () => {
    const bullish = []
    for (let i = 0; i < 12; i += 1) {
      const base = 100 + i * 2
      bullish.push({
        high: base + 5,
        low: base,
        close: base + 2,
        volume: 10 + i,
        closed: true,
      })
    }
    expect(inferCandleStructure(bullish)).toBe('BULLISH')

    const bearish = [...bullish].reverse().map((c, i) => ({
      ...c,
      high: 200 - i * 2,
      low: 190 - i * 2,
      close: 195 - i * 2,
      closed: true,
    }))
    expect(inferCandleStructure(bearish)).toBe('BEARISH')

    const volumes = Array.from({ length: 6 }, (_, i) => ({
      volume: 10,
      closed: true,
      high: 1,
      low: 1,
      close: 1,
      ...(i === 5 ? { volume: 25 } : {}),
    }))
    expect(computeVolumeRatio(volumes, 5)).toBeCloseTo(2.5)
  })
})

describe('BybitMarketDataProvider', () => {
  it('invalid symbol 을 차단한다', async () => {
    const provider = createBybitMarketDataProvider({
      fetchImpl: vi.fn(),
    })
    const result = await provider.getTicker({ symbol: 'SOLUSDT' })
    expect(result.status).toBe(PROVIDER_STATUS.INVALID_REQUEST)
    expect(result.field).toBe('symbol')
  })

  it('정상 ticker / candles / OI / funding 을 조회한다', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const href = String(url)
      expect(href.startsWith(BYBIT_BASE_URL)).toBe(true)
      if (href.includes('/v5/market/tickers')) {
        return jsonResponse(tickerPayload())
      }
      if (href.includes('/v5/market/kline')) {
        expect(href).toContain('interval=15')
        return jsonResponse(
          klinePayload([
            ['1700000900000', '3', '4', '2', '3.5', '30', '300'],
            ['1700000000000', '1', '2', '0.5', '1.5', '10', '100'],
          ]),
        )
      }
      if (href.includes('/v5/market/open-interest')) {
        expect(href).toContain('intervalTime=15min')
        return jsonResponse(
          oiPayload([
            { openInterest: '110', timestamp: '2' },
            { openInterest: '100', timestamp: '1' },
          ]),
        )
      }
      throw new Error(`unexpected url ${href}`)
    })

    const provider = createBybitMarketDataProvider({
      fetchImpl,
      now: () => 1_700_001_000_000,
    })

    const ticker = await provider.getTicker({ symbol: 'BTCUSDT' })
    expect(ticker.status).toBe(PROVIDER_STATUS.OK)
    expect(ticker.provider).toBe(BYBIT_PROVIDER_ID)
    expect(ticker.data.lastPrice).toBe(65000.5)

    const candles = await provider.getCandles({
      symbol: 'BTCUSDT',
      timeframe: '15m',
    })
    expect(candles.status).toBe(PROVIDER_STATUS.OK)
    expect(candles.data.candles[0].timestamp).toBeLessThan(
      candles.data.candles[1].timestamp,
    )

    const oi = await provider.getOpenInterest({
      symbol: 'BTCUSDT',
      timeframe: '15m',
    })
    expect(oi.data.openInterest).toBe(110)
    expect(oi.data.openInterestChangePct).toBe(10)

    const funding = await provider.getFundingRate({ symbol: 'BTCUSDT' })
    expect(funding.data.fundingRate).toBe(0.0001)
    expect(funding.data.fundingRatePercent).toBe('+0.0100%')
  })

  it('Bybit error / timeout 시 ERROR 를 반환하고 stale cache 로 fallback 한다', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      if (calls === 1) return jsonResponse(tickerPayload())
      throw new Error('timeout')
    })
    const nowMs = { value: 1_000 }
    const provider = createBybitMarketDataProvider({
      fetchImpl,
      now: () => nowMs.value,
    })

    const first = await provider.getTicker({ symbol: 'BTCUSDT' })
    expect(first.status).toBe(PROVIDER_STATUS.OK)
    expect(first.stale).toBe(false)

    nowMs.value += BYBIT_CACHE_TTL_MS.ticker + 1
    const second = await provider.getTicker({ symbol: 'BTCUSDT' })
    expect(second.status).toBe(PROVIDER_STATUS.OK)
    expect(second.stale).toBe(true)
    expect(second.data.lastPrice).toBe(65000.5)
  })

  it('retCode 오류와 HTTP 오류를 처리한다', async () => {
    const provider = createBybitMarketDataProvider({
      fetchImpl: vi.fn(async () => jsonResponse({ retCode: 10001, retMsg: 'fail' })),
    })
    const result = await provider.getTicker({ symbol: 'ETHUSDT' })
    expect(result.status).toBe(PROVIDER_STATUS.ERROR)

    const httpProvider = createBybitMarketDataProvider({
      fetchImpl: vi.fn(async () => jsonResponse({}, 500)),
    })
    expect((await httpProvider.getTicker({ symbol: 'ETHUSDT' })).status).toBe(
      PROVIDER_STATUS.ERROR,
    )
  })

  it('liquidation / orderFlow 는 아직 UNSUPPORTED 이다', async () => {
    const provider = createBybitMarketDataProvider({ fetchImpl: vi.fn() })
    expect((await provider.getLiquidations()).status).toBe(PROVIDER_STATUS.UNSUPPORTED)
    expect((await provider.getOrderFlow()).status).toBe(PROVIDER_STATUS.UNSUPPORTED)
  })

  it('1h/4h kline interval 을 Bybit 값으로 매핑한다', async () => {
    const seen = []
    const fetchImpl = vi.fn(async (url) => {
      const href = String(url)
      seen.push(href)
      return jsonResponse(
        klinePayload([
          ['1700000900000', '3', '4', '2', '3.5', '30', '300'],
          ['1700000000000', '1', '2', '0.5', '1.5', '10', '100'],
        ]),
      )
    })
    const provider = createBybitMarketDataProvider({
      fetchImpl,
      now: () => 1_700_001_000_000,
    })

    await provider.getCandles({ symbol: 'BTCUSDT', timeframe: '1h' })
    await provider.getCandles({ symbol: 'BTCUSDT', timeframe: '4h' })
    await provider.getOpenInterest({ symbol: 'BTCUSDT', timeframe: '1h' })
    await provider.getOpenInterest({ symbol: 'BTCUSDT', timeframe: '4h' })
    expect(seen[0]).toContain('interval=60')
    expect(seen[1]).toContain('interval=240')
    expect(seen[2]).toContain('intervalTime=1h')
    expect(seen[3]).toContain('intervalTime=4h')
  })

  it('timeout 시 cache 가 없으면 ERROR 를 반환한다', async () => {
    const provider = createBybitMarketDataProvider({
      fetchImpl: vi.fn(async () => {
        throw new Error('timeout')
      }),
    })
    const result = await provider.getTicker({ symbol: 'BTCUSDT' })
    expect(result.status).toBe(PROVIDER_STATUS.ERROR)
    expect(result.message).toBe('시장 데이터 일시 지연')
    expect(result.stale).toBe(false)
  })

  it('settled funding history service 를 제공한다', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(String(url)).toContain('/v5/market/funding/history')
      return jsonResponse({
        retCode: 0,
        result: {
          list: [
            { fundingRate: '0.0001', fundingRateTimestamp: '1700000000000' },
          ],
        },
      })
    })
    const provider = createBybitMarketDataProvider({ fetchImpl })
    const result = await provider.getFundingHistory({ symbol: 'BTCUSDT' })
    expect(result.status).toBe(PROVIDER_STATUS.OK)
    expect(result.data.items[0].fundingRatePercent).toBe('+0.0100%')
  })

  it('partial provider failure 에도 snapshot 이 crash 하지 않는다', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const href = String(url)
      if (href.includes('/tickers')) return jsonResponse(tickerPayload())
      if (href.includes('/open-interest')) {
        return jsonResponse(
          oiPayload([
            { openInterest: '100', timestamp: '1' },
            { openInterest: '105', timestamp: '2' },
          ]),
        )
      }
      if (href.includes('/kline')) throw new Error('kline down')
      throw new Error(`unexpected ${href}`)
    })

    registerMarketDataProvider(
      createBybitMarketDataProvider({
        fetchImpl,
        now: () => 1_700_001_000_000,
      }),
    )

    const snapshot = await getMarketSnapshot('BTCUSDT')
    expect(snapshot.configured).toBe(true)
    expect(snapshot.provider).toBe(BYBIT_PROVIDER_ID)
    expect(snapshot.metrics.price.value).toBe(65000.5)
    expect(snapshot.status).toBe('PARTIAL')
    expect(snapshot.structure).toHaveLength(3)
    expect(snapshot.metrics.liquidationAbove.value).toBeNull()
    expect(snapshot.metrics.cvd.value).toBeNull()
  })
})
