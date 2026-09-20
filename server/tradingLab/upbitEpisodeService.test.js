import { describe, expect, it } from 'vitest'
import { buildUpbitTradeEpisodes } from './upbitEpisodeService.js'

function execution(overrides) {
  return {
    tradeUuid: 't1', orderUuid: 'o1', market: 'KRW-BTC', side: 'BID',
    price: 100, volume: 1, funds: 100, fee: 1,
    tradedAt: '2026-09-20T00:00:00.000Z', ...overrides,
  }
}

describe('Upbit trade episodes', () => {
  it('BUY + scale-in BUY + partial SELL + full SELL을 평균원가로 계산한다', () => {
    const episodes = buildUpbitTradeEpisodes([
      execution({ tradeUuid: 'b1', price: 100, volume: 1, funds: 100, fee: 1 }),
      execution({ tradeUuid: 'b2', orderUuid: 'o2', price: 200, volume: 1, funds: 200, fee: 2, tradedAt: '2026-09-20T01:00:00Z' }),
      execution({ tradeUuid: 's1', orderUuid: 'o3', side: 'ASK', price: 180, volume: 1, funds: 180, fee: 1, tradedAt: '2026-09-20T02:00:00Z' }),
      execution({ tradeUuid: 's2', orderUuid: 'o4', side: 'ASK', price: 220, volume: 1, funds: 220, fee: 1, tradedAt: '2026-09-20T03:00:00Z' }),
    ], { nowIso: '2026-09-20T04:00:00Z' })
    expect(episodes).toHaveLength(1)
    expect(episodes[0]).toMatchObject({
      status: 'CLOSED', boughtQuantity: 2, soldQuantity: 2, remainingQuantity: 0,
      grossBuyAmount: 300, grossSellAmount: 400, buyFees: 3, sellFees: 2,
      averageEntryPrice: 151.5, averageExitPrice: 200,
    })
    expect(episodes[0].realizedPnl).toBeCloseTo(95)
    expect(episodes[0].realizedPnlPct).toBeCloseTo((95 / 303) * 100)
  })

  it('부분 SELL은 PARTIAL과 남은 수량을 유지한다', () => {
    const [episode] = buildUpbitTradeEpisodes([
      execution({ tradeUuid: 'b1', volume: 2, funds: 200, fee: 2 }),
      execution({ tradeUuid: 's1', side: 'ASK', volume: 0.5, funds: 60, fee: 0.5, tradedAt: '2026-09-20T01:00:00Z' }),
    ])
    expect(episode.status).toBe('PARTIAL')
    expect(episode.remainingQuantity).toBeCloseTo(1.5)
    expect(episode.realizedPnl).toBeCloseTo(9)
  })

  it('과거 BUY 없는 SELL은 UNKNOWN_BASIS이고 손익을 만들지 않는다', () => {
    const [episode] = buildUpbitTradeEpisodes([
      execution({ tradeUuid: 's1', side: 'ASK', volume: 1, funds: 120, fee: 1 }),
    ])
    expect(episode.status).toBe('UNKNOWN_BASIS')
    expect(episode.realizedPnl).toBeNull()
    expect(episode.realizedPnlPct).toBeNull()
    expect(episode.averageEntryPrice).toBeNull()
  })

  it('시장별 inventory를 분리한다', () => {
    const episodes = buildUpbitTradeEpisodes([
      execution({ tradeUuid: 'btc', market: 'KRW-BTC' }),
      execution({ tradeUuid: 'eth', market: 'KRW-ETH' }),
    ])
    expect(episodes.map((row) => row.market).sort()).toEqual(['KRW-BTC', 'KRW-ETH'])
  })
})
