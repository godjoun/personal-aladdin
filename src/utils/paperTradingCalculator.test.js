import { describe, expect, it } from 'vitest'
import {
  calculatePaperQuantity,
  calculatePaperSellMetrics,
  validatePaperBuyInput,
  validatePaperInitialCapital,
  validatePaperSellInput,
} from './paperTradingCalculator.js'

describe('paperTradingCalculator', () => {
  it('quantity = 투자금액 / 진입가격', () => {
    expect(calculatePaperQuantity(200000, 100000000)).toBeCloseTo(0.002)
    expect(calculatePaperQuantity(1000000, 50000)).toBe(20)
  })

  it('quantity 계산은 잘못된 입력에서 null', () => {
    expect(calculatePaperQuantity(0, 100)).toBeNull()
    expect(calculatePaperQuantity(100, 0)).toBeNull()
  })

  it('수익 거래 손익을 계산한다', () => {
    const metrics = calculatePaperSellMetrics({
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 1000000,
      quantity: 10000,
    })

    expect(metrics?.sellProceeds).toBeCloseTo(1100000)
    expect(metrics?.returnRate).toBeCloseTo(10)
    expect(metrics?.profitLoss).toBeCloseTo(100000)
  })

  it('손실 거래 손익을 계산한다', () => {
    const metrics = calculatePaperSellMetrics({
      entryPrice: 100,
      exitPrice: 90,
      investedAmount: 1000000,
      quantity: 10000,
    })

    expect(metrics?.sellProceeds).toBeCloseTo(900000)
    expect(metrics?.returnRate).toBeCloseTo(-10)
    expect(metrics?.profitLoss).toBeCloseTo(-100000)
  })

  it('매수 입력을 검증한다', () => {
    expect(
      validatePaperBuyInput({
        symbol: 'BTC',
        entryPrice: 100,
        investedAmount: 200,
        availableCash: 1000,
      }).ok,
    ).toBe(true)

    const overCash = validatePaperBuyInput({
      symbol: 'BTC',
      entryPrice: 100,
      investedAmount: 2000,
      availableCash: 1000,
    })
    expect(overCash.ok).toBe(false)
    expect(overCash.errors.investedAmount).toBeTruthy()
  })

  it('초기 자본과 매도가를 검증한다', () => {
    expect(validatePaperInitialCapital(1000000).ok).toBe(true)
    expect(validatePaperInitialCapital(0).ok).toBe(false)
    expect(validatePaperSellInput({ exitPrice: 100 }).ok).toBe(true)
    expect(validatePaperSellInput({ exitPrice: 0 }).ok).toBe(false)
  })
})
