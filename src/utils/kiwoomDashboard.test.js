import { describe, expect, it } from 'vitest'
import {
  buildDashboardHoldingsView,
  buildKiwoomHoldingRow,
  calculateKiwoomPortfolioSummary,
} from './kiwoomDashboard.js'

describe('buildKiwoomHoldingRow', () => {
  it('accountType 을 ISA/일반 라벨로 구분한다', () => {
    const isa = buildKiwoomHoldingRow({
      accountType: 'isa',
      symbol: '133690',
      name: 'TIGER 미국나스닥100',
      quantity: 2,
      averageBuyPrice: 100,
      currentPrice: 110,
      evaluationAmount: 220,
      profitLoss: 20,
      returnRate: 10,
      buyAmount: 200,
    })
    const general = buildKiwoomHoldingRow({
      accountType: 'general',
      symbol: '365340',
      name: '성일하이텍',
      quantity: 133,
      averageBuyPrice: 70000,
      currentPrice: 80000,
      evaluationAmount: 10640000,
      profitLoss: 1330000,
      returnRate: 14.28,
      buyAmount: 9310000,
    })

    expect(isa.accountLabel).toBe('ISA')
    expect(general.accountLabel).toBe('일반')
    expect(isa.canDelete).toBe(false)
  })

  it('현재가 없음 → 0으로 계산하지 않고 -100% 가 나오지 않는다', () => {
    const row = buildKiwoomHoldingRow({
      accountType: 'general',
      symbol: '365340',
      name: '성일하이텍',
      quantity: 133,
      averageBuyPrice: 70000,
      currentPrice: null,
      evaluationAmount: null,
      profitLoss: null,
      returnRate: null,
      buyAmount: 9310000,
    })

    expect(row.latestPrice).toBeNull()
    expect(row.holdingValue).toBeNull()
    expect(row.profitLoss).toBeNull()
    expect(row.profitRate).toBeNull()
    expect(row.invested).toBe(9310000)
  })

  it('키움 제공 값을 우선 사용한다', () => {
    const row = buildKiwoomHoldingRow({
      accountType: 'isa',
      symbol: '360750',
      name: 'TIGER 미국S&P500',
      quantity: 35,
      averageBuyPrice: 10000,
      currentPrice: 12000,
      evaluationAmount: 999999,
      profitLoss: 1234,
      returnRate: 5.5,
      buyAmount: 350000,
    })

    expect(row.holdingValue).toBe(999999)
    expect(row.profitLoss).toBe(1234)
    expect(row.profitRate).toBe(5.5)
  })
})

describe('calculateKiwoomPortfolioSummary', () => {
  it('평가값 누락 종목을 0원으로 넣지 않는다', () => {
    const summary = calculateKiwoomPortfolioSummary([
      {
        invested: 100,
        holdingValue: 110,
        profitLoss: 10,
      },
      {
        invested: 200,
        holdingValue: null,
        profitLoss: null,
      },
    ])

    expect(summary.totalInvested).toBe(300)
    expect(summary.totalHoldingValue).toBe(110)
    expect(summary.totalProfitLoss).toBeNull()
    expect(summary.totalReturnRate).toBeNull()
    expect(summary.incompletePrices).toBe(true)
  })
})

describe('buildDashboardHoldingsView', () => {
  it('키움과 수동 동일 심볼을 중복 합산하지 않는다', () => {
    const view = buildDashboardHoldingsView({
      kiwoomOk: true,
      kiwoomHoldings: [
        {
          accountType: 'general',
          symbol: '365340',
          name: '성일하이텍',
          quantity: 133,
          averageBuyPrice: 70000,
          currentPrice: 80000,
          evaluationAmount: 10640000,
          profitLoss: 1330000,
          returnRate: 14,
          buyAmount: 9310000,
        },
      ],
      assets: [
        {
          id: 'manual-1',
          name: '성일하이텍(수동)',
          symbol: '365340',
          quantity: 10,
          averageBuyPrice: 50000,
          assetType: '주식',
        },
        {
          id: 'manual-2',
          name: '현금성',
          symbol: 'CASH01',
          quantity: 1,
          averageBuyPrice: 1000,
          assetType: '현금',
        },
      ],
      prices: [],
    })

    const symbols = view.rows.map((row) => row.symbol)
    expect(symbols.filter((s) => s === '365340')).toHaveLength(1)
    expect(symbols).toContain('CASH01')
    expect(view.summary.totalHoldingValue).toBe(10640000)
    expect(view.usingKiwoom).toBe(true)
  })

  it('키움 조회 실패 시 수동 데이터로 표시한다', () => {
    const view = buildDashboardHoldingsView({
      kiwoomOk: false,
      kiwoomHoldings: [],
      assets: [
        {
          id: 'manual-1',
          name: '삼성전자',
          symbol: '005930',
          quantity: 1,
          averageBuyPrice: 70000,
          assetType: '주식',
        },
      ],
      prices: [{ symbol: '005930', date: '20260325', closePrice: 75000 }],
    })

    expect(view.usingKiwoom).toBe(false)
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0].accountLabel).toBe('수동')
    expect(view.rows[0].holdingValue).toBe(75000)
  })
})
