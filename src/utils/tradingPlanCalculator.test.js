import { describe, expect, it } from 'vitest'
import {
  calculateTradingPlanMetrics,
  calculateActualTradeMetrics,
  formatRiskRewardRatio,
  getActiveTradingPlanSymbols,
  getRecentTradingPlans,
  validateTradingPlanInput,
} from './tradingPlanCalculator.js'

describe('tradingPlanCalculator', () => {
  const baseInput = {
    entryPrice: 106_000_000,
    stopPrice: 103_000_000,
    targetPrice: 112_000_000,
    investedAmount: 500_000,
  }

  it('정상 LONG 계획을 계산한다', () => {
    const metrics = calculateTradingPlanMetrics(baseInput)
    expect(metrics).not.toBeNull()
    expect(metrics?.stopLossRate).toBeCloseTo(-2.830188679, 4)
    expect(metrics?.targetReturnRate).toBeCloseTo(5.660377358, 4)
    expect(metrics?.riskRewardRatio).toBeCloseTo(2, 4)
  })

  it('예상손실을 계산한다', () => {
    const metrics = calculateTradingPlanMetrics(baseInput)
    expect(metrics?.expectedLoss).toBeCloseTo(14_150.943396, 2)
  })

  it('예상수익을 계산한다', () => {
    const metrics = calculateTradingPlanMetrics(baseInput)
    expect(metrics?.expectedProfit).toBeCloseTo(28_301.886792, 2)
  })

  it('손익비를 계산한다', () => {
    const metrics = calculateTradingPlanMetrics(baseInput)
    expect(formatRiskRewardRatio(metrics?.riskRewardRatio ?? 0)).toBe('1 : 2.00')
  })

  it('손절가 >= 진입가를 차단한다', () => {
    expect(
      calculateTradingPlanMetrics({
        ...baseInput,
        stopPrice: 106_000_000,
      }),
    ).toBeNull()

    const validation = validateTradingPlanInput({
      symbol: 'BTC',
      ...baseInput,
      stopPrice: 107_000_000,
    })
    expect(validation.ok).toBe(false)
    expect(validation.errors.stopPrice).toContain('낮아야')
  })

  it('목표가 <= 진입가를 차단한다', () => {
    expect(
      calculateTradingPlanMetrics({
        ...baseInput,
        targetPrice: 106_000_000,
      }),
    ).toBeNull()

    const validation = validateTradingPlanInput({
      symbol: 'BTC',
      ...baseInput,
      targetPrice: 100_000_000,
    })
    expect(validation.ok).toBe(false)
    expect(validation.errors.targetPrice).toContain('높아야')
  })

  it('0/음수 값을 차단한다', () => {
    expect(
      calculateTradingPlanMetrics({
        entryPrice: 0,
        stopPrice: 1,
        targetPrice: 2,
        investedAmount: 1000,
      }),
    ).toBeNull()

    const validation = validateTradingPlanInput({
      symbol: 'BTC',
      entryPrice: -1,
      stopPrice: 1,
      targetPrice: 2,
      investedAmount: 0,
    })
    expect(validation.ok).toBe(false)
  })

  it('최근 계획을 최대 3개까지 반환한다', () => {
    const plans = [
      { id: '1', createdAt: '2026-08-28T10:00:00.000Z', updatedAt: '2026-08-28T10:00:00.000Z' },
      { id: '2', createdAt: '2026-08-27T10:00:00.000Z', updatedAt: '2026-08-29T10:00:00.000Z' },
      { id: '3', createdAt: '2026-08-26T10:00:00.000Z', updatedAt: '2026-08-28T11:00:00.000Z' },
      { id: '4', createdAt: '2026-08-25T10:00:00.000Z', updatedAt: '2026-08-25T10:00:00.000Z' },
    ]

    const recent = getRecentTradingPlans(plans, 3)
    expect(recent.map((plan) => plan.id)).toEqual(['2', '3', '1'])
  })

  it('실제 청산 손익과 수익률을 계산한다', () => {
    const metrics = calculateActualTradeMetrics(100, 110, 1000)
    expect(metrics?.returnRate).toBeCloseTo(10)
    expect(metrics?.profitLoss).toBeCloseTo(100)
  })

  it('활성 계획 symbol만 수집한다', () => {
    expect(
      getActiveTradingPlanSymbols([
        { symbol: 'BTC', status: 'WAITING' },
        { symbol: 'ETH', status: 'ENTERED' },
        { symbol: 'SOL', status: 'CLOSED' },
      ]),
    ).toEqual(['BTC', 'ETH'])
  })
})
