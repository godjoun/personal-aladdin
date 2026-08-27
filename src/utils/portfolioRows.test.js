/**
 * portfolioRows / calculator — 현재가 누락 시 계산 안전성
 */

import { describe, expect, it } from 'vitest'
import {
  calculateHoldingValue,
  calculateProfitLoss,
  calculateProfitRate,
  hasValidPrice,
} from './calculator.js'
import { buildAssetRows, calculatePortfolioSummary } from './portfolioRows.js'

describe('hasValidPrice', () => {
  it('null/undefined/빈문자열/0 은 유효하지 않다', () => {
    expect(hasValidPrice(null)).toBe(false)
    expect(hasValidPrice(undefined)).toBe(false)
    expect(hasValidPrice('')).toBe(false)
    expect(hasValidPrice(0)).toBe(false)
    expect(hasValidPrice('0')).toBe(false)
  })

  it('양수는 유효하다', () => {
    expect(hasValidPrice(72000)).toBe(true)
    expect(hasValidPrice('72000')).toBe(true)
  })
})

describe('현재가 없는 계산', () => {
  it('현재가 없음 → 0원으로 계산하지 않음', () => {
    expect(calculateHoldingValue(10, null)).toBeNull()
    expect(calculateHoldingValue(10, undefined)).toBeNull()
    expect(calculateHoldingValue(10, '')).toBeNull()
    expect(calculateProfitLoss(10, 100000, null)).toBeNull()
  })

  it('현재가 없음 → 수익률 -100% 가 나오지 않음', () => {
    expect(calculateProfitRate(100000, null)).toBeNull()
    expect(calculateProfitRate(100000, undefined)).toBeNull()
    expect(calculateProfitRate(100000, '')).toBeNull()
    expect(calculateProfitRate(100000, 0)).toBeNull()
  })

  it('현재가 있음 → 기존 계산 정상', () => {
    expect(calculateHoldingValue(10, 75000)).toBe(750000)
    expect(calculateProfitLoss(10, 70000, 75000)).toBe(50000)
    expect(calculateProfitRate(70000, 75000)).toBeCloseTo(7.1428, 3)
  })
})

describe('buildAssetRows / calculatePortfolioSummary', () => {
  const assets = [
    {
      id: '1',
      name: '삼성전자',
      symbol: '005930',
      quantity: 10,
      averageBuyPrice: 70000,
      assetType: '주식',
    },
    {
      id: '2',
      name: '성일하이텍',
      symbol: '365340',
      quantity: 133,
      averageBuyPrice: 75221,
      assetType: '주식',
    },
  ]

  it('현재가 없는 종목은 — 계산용 null 을 유지한다', () => {
    const rows = buildAssetRows(assets, [
      {
        symbol: '005930',
        date: '20260325',
        closePrice: 75000,
      },
    ])

    expect(rows[0].hasPrice).toBe(true)
    expect(rows[0].holdingValue).toBe(750000)
    expect(rows[1].hasPrice).toBe(false)
    expect(rows[1].latestPrice).toBeNull()
    expect(rows[1].holdingValue).toBeNull()
    expect(rows[1].profitLoss).toBeNull()
    expect(rows[1].profitRate).toBeNull()
    expect(rows[1].invested).toBe(133 * 75221)
  })

  it('현재가 누락 시 총 손익/수익률은 계산하지 않는다', () => {
    const rows = buildAssetRows(assets, [
      {
        symbol: '005930',
        date: '20260325',
        closePrice: 75000,
      },
    ])
    const summary = calculatePortfolioSummary(rows)

    expect(summary.incompletePrices).toBe(true)
    expect(summary.totalInvested).toBe(10 * 70000 + 133 * 75221)
    expect(summary.totalHoldingValue).toBe(750000)
    expect(summary.totalProfitLoss).toBeNull()
    expect(summary.totalReturnRate).toBeNull()
  })

  it('모든 종목에 현재가가 있으면 손익/수익률을 계산한다', () => {
    const rows = buildAssetRows(assets, [
      { symbol: '005930', date: '20260325', closePrice: 75000 },
      { symbol: '365340', date: '20260325', closePrice: 80000 },
    ])
    const summary = calculatePortfolioSummary(rows)

    expect(summary.incompletePrices).toBe(false)
    expect(summary.totalHoldingValue).toBe(750000 + 133 * 80000)
    expect(summary.totalProfitLoss).not.toBeNull()
    expect(summary.totalReturnRate).not.toBeNull()
    expect(summary.totalReturnRate).not.toBe(-100)
  })
})
