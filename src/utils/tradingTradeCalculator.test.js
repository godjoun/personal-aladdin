import { describe, expect, it } from 'vitest'
import {
  buildTradingDeskSummary,
  buildTradingPerformanceStats,
  calculateMaxLossStreak,
  calculateTradeMetrics,
  isSameWeek,
  validateTradeInput,
} from './tradingTradeCalculator.js'

describe('calculateTradeMetrics', () => {
  it('수익률과 손익을 계산한다', () => {
    const result = calculateTradeMetrics({
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 1000000,
    })
    expect(result).toEqual({ returnRate: 10, profitLoss: 100000 })
  })

  it('손실 거래도 계산한다', () => {
    const result = calculateTradeMetrics({
      entryPrice: 100,
      exitPrice: 90,
      investedAmount: 1000000,
    })
    expect(result?.returnRate).toBeCloseTo(-10)
    expect(result?.profitLoss).toBeCloseTo(-100000)
  })

  it('잘못된 입력은 null', () => {
    expect(
      calculateTradeMetrics({
        entryPrice: 0,
        exitPrice: 10,
        investedAmount: 1000,
      }),
    ).toBeNull()
    expect(
      calculateTradeMetrics({
        entryPrice: 10,
        exitPrice: 0,
        investedAmount: 1000,
      }),
    ).toBeNull()
    expect(
      calculateTradeMetrics({
        entryPrice: 10,
        exitPrice: 20,
        investedAmount: -1,
      }),
    ).toBeNull()
  })
})

describe('validateTradeInput', () => {
  it('필수값이 없으면 오류를 반환한다', () => {
    const result = validateTradeInput({})
    expect(result.ok).toBe(false)
    expect(result.errors.symbol).toBeTruthy()
    expect(result.errors.entryPrice).toBeTruthy()
  })

  it('유효한 입력은 통과한다', () => {
    const result = validateTradeInput({
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 500000,
    })
    expect(result.ok).toBe(true)
  })
})

describe('buildTradingDeskSummary', () => {
  it('누적 손익과 승률을 계산한다', () => {
    const summary = buildTradingDeskSummary(
      [
        { profitLoss: 100, tradedAt: '2026-08-28T10:00:00.000Z' },
        { profitLoss: -50, tradedAt: '2026-08-27T10:00:00.000Z' },
        { profitLoss: 200, tradedAt: '2026-08-26T10:00:00.000Z' },
      ],
      new Date('2026-08-28T12:00:00.000Z'),
    )

    expect(summary.totalTrades).toBe(3)
    expect(summary.totalProfitLoss).toBe(250)
    expect(summary.winRate).toBeCloseTo(66.666, 2)
    expect(summary.weekProfitLoss).toBe(250)
  })

  it('거래가 없으면 기본값', () => {
    expect(buildTradingDeskSummary([])).toEqual({
      totalTrades: 0,
      totalProfitLoss: 0,
      winRate: null,
      weekProfitLoss: 0,
    })
  })
})

describe('buildTradingPerformanceStats', () => {
  it('평균 수익/손실과 연속손실을 계산한다', () => {
    const stats = buildTradingPerformanceStats([
      { returnRate: 10, profitLoss: 100, tradedAt: '2026-08-20T10:00:00.000Z' },
      { returnRate: -5, profitLoss: -50, tradedAt: '2026-08-21T10:00:00.000Z' },
      { returnRate: -3, profitLoss: -30, tradedAt: '2026-08-22T10:00:00.000Z' },
      { returnRate: 4, profitLoss: 40, tradedAt: '2026-08-23T10:00:00.000Z' },
    ])

    expect(stats.avgWinRate).toBeCloseTo(7)
    expect(stats.avgLossRate).toBeCloseTo(-4)
    expect(stats.maxLossStreak).toBe(2)
    expect(stats.winShare).toBe(50)
  })
})

describe('calculateMaxLossStreak', () => {
  it('최대 연속손실 횟수를 계산한다', () => {
    expect(
      calculateMaxLossStreak([
        { profitLoss: -1, tradedAt: '2026-08-01T10:00:00.000Z' },
        { profitLoss: -1, tradedAt: '2026-08-02T10:00:00.000Z' },
        { profitLoss: 1, tradedAt: '2026-08-03T10:00:00.000Z' },
        { profitLoss: -1, tradedAt: '2026-08-04T10:00:00.000Z' },
      ]),
    ).toBe(2)
  })
})

describe('isSameWeek', () => {
  it('같은 주의 날짜를 인식한다', () => {
    expect(
      isSameWeek(
        new Date('2026-08-28T10:00:00.000Z'),
        new Date('2026-08-27T10:00:00.000Z'),
      ),
    ).toBe(true)
  })
})
