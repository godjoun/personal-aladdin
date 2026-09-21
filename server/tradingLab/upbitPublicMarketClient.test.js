import { describe, expect, it, vi } from 'vitest'
import { createUpbitPublicMarketClient } from './upbitPublicMarketClient.js'

describe('Upbit public market client', () => {
  it('credential 없이 공개 ticker 현재가를 정규화한다', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { market: 'KRW-BTC', trade_price: 101_000_000, timestamp: Date.parse('2026-09-21T01:02:03Z') },
        { market: 'KRW-ETH', trade_price: '3500000', timestamp: Date.parse('2026-09-21T01:02:04Z') },
      ],
    }))
    const client = createUpbitPublicMarketClient({ fetchImpl, baseUrl: 'https://api.upbit.test' })
    const quotes = await client.getTickers(['KRW-BTC', 'KRW-ETH'])
    expect(quotes).toEqual([
      { market: 'KRW-BTC', tradePrice: 101_000_000, updatedAt: '2026-09-21T01:02:03.000Z' },
      { market: 'KRW-ETH', tradePrice: 3_500_000, updatedAt: '2026-09-21T01:02:04.000Z' },
    ])
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toContain('/v1/ticker?markets=KRW-BTC%2CKRW-ETH')
    expect(options.headers).toEqual({ Accept: 'application/json' })
    expect(JSON.stringify(options)).not.toMatch(/Authorization|Bearer|secret/i)
  })

  it('잘못된 숫자와 요청하지 않은 market은 응답에서 제외한다', async () => {
    const client = createUpbitPublicMarketClient({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => [
          { market: 'KRW-BTC', trade_price: 'NaN' },
          { market: 'KRW-ETH', trade_price: Infinity },
          { market: 'KRW-XRP', trade_price: 1000 },
        ],
      }),
    })
    await expect(client.getTickers(['KRW-BTC', 'KRW-ETH'])).resolves.toEqual([])
  })

  it('범위를 벗어난 timestamp는 현재가를 버리지 않고 시각만 null 처리한다', async () => {
    const client = createUpbitPublicMarketClient({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => [{ market: 'KRW-BTC', trade_price: 100, timestamp: Number.MAX_VALUE }],
      }),
    })
    await expect(client.getTickers(['KRW-BTC'])).resolves.toEqual([
      { market: 'KRW-BTC', tradePrice: 100, updatedAt: null },
    ])
  })
})
