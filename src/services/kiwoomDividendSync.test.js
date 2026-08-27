import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDividendEvents,
  saveDividendEvents,
} from './dividendStorage.js'
import {
  syncKiwoomDividends,
  upsertKiwoomDividendEvents,
} from './kiwoomDividendSync.js'
import {
  calculateMonthlyDividendSummary,
  calculateYearPaidDividend,
} from '../utils/dividendCalculator.js'
import { buildKiwoomHoldingRow } from '../utils/kiwoomDashboard.js'
import { clearFinanceMemory } from './memoryFinanceStore.js'

beforeEach(() => {
  clearFinanceMemory()
})

afterEach(() => {
  clearFinanceMemory()
})

describe('upsertKiwoomDividendEvents', () => {
  it('PAID 이벤트를 생성하고 중복 sync 를 방지한다', () => {
    const dividends = [
      {
        accountType: 'isa',
        paymentDate: '2026-08-04',
        symbol: '133690',
        name: 'TIGER미국나스닥100',
        amount: 510,
        taxAmount: 0,
        source: 'KIWOOM',
        sourceKey: 'kiwoom:isa:20260804:000000002',
      },
      {
        accountType: 'isa',
        paymentDate: '2026-08-04',
        symbol: '360750',
        name: 'TIGER미국S&P500',
        amount: 2310,
        taxAmount: 0,
        source: 'KIWOOM',
        sourceKey: 'kiwoom:isa:20260804:000000001',
      },
    ]

    const first = upsertKiwoomDividendEvents(dividends)
    expect(first.added).toBe(2)
    expect(getDividendEvents()).toHaveLength(2)
    expect(getDividendEvents()[0]).toMatchObject({
      status: 'PAID',
      source: 'KIWOOM',
      confirmedAmount: 510,
    })

    const second = upsertKiwoomDividendEvents(dividends)
    expect(second.added).toBe(0)
    expect(getDividendEvents()).toHaveLength(2)
  })

  it('수동 배당 이벤트는 삭제하지 않는다', () => {
    saveDividendEvents([
      {
        id: 'manual-1',
        symbol: '005930',
        fundName: '수동배당',
        paymentDate: '2026-07-01',
        distributionPerShare: 100,
        quantity: 1,
        expectedAmount: 100,
        confirmedAmount: 100,
        status: 'PAID',
        source: 'manual',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ])

    upsertKiwoomDividendEvents([
      {
        accountType: 'isa',
        paymentDate: '2026-08-19',
        symbol: '214980',
        name: 'KODEX단기채권PLUS',
        amount: 1415,
        source: 'KIWOOM',
        sourceKey: 'kiwoom:isa:20260819:000000001',
      },
    ])

    const events = getDividendEvents()
    expect(events).toHaveLength(2)
    expect(events.some((e) => e.id === 'manual-1')).toBe(true)
  })
})

describe('syncKiwoomDividends + dashboard totals', () => {
  it('이번 달/올해 배당 합계에 PAID 가 반영된다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        dividends: [
          {
            accountType: 'isa',
            paymentDate: '2026-08-04',
            symbol: '133690',
            name: 'TIGER미국나스닥100',
            amount: 510,
            taxAmount: 0,
            source: 'KIWOOM',
            sourceKey: 'kiwoom:isa:20260804:000000002',
          },
          {
            accountType: 'isa',
            paymentDate: '2026-08-04',
            symbol: '360750',
            name: 'TIGER미국S&P500',
            amount: 2310,
            taxAmount: 0,
            source: 'KIWOOM',
            sourceKey: 'kiwoom:isa:20260804:000000001',
          },
          {
            accountType: 'isa',
            paymentDate: '2026-08-04',
            symbol: '458730',
            name: 'TIGER미국배당다우존스',
            amount: 2960,
            taxAmount: 0,
            source: 'KIWOOM',
            sourceKey: 'kiwoom:isa:20260804:000000003',
          },
          {
            accountType: 'isa',
            paymentDate: '2026-08-19',
            symbol: '214980',
            name: 'KODEX단기채권PLUS',
            amount: 1415,
            taxAmount: 0,
            source: 'KIWOOM',
            sourceKey: 'kiwoom:isa:20260819:000000001',
          },
        ],
      }),
    })

    const result = await syncKiwoomDividends({ fetchImpl, from: '2026-08-01' })
    expect(result.ok).toBe(true)
    expect(result.added).toBe(4)

    const events = getDividendEvents()
    const monthly = calculateMonthlyDividendSummary(events, 2026, 8)
    const yearPaid = calculateYearPaidDividend(events, 2026)

    expect(monthly.paid).toBe(510 + 2310 + 2960 + 1415)
    expect(yearPaid).toBe(510 + 2310 + 2960 + 1415)
  })
})

describe('kt00018 공식 평가손익 우선', () => {
  it('수수료 포함 평가손익을 임의 재계산하지 않는다', () => {
    const row = buildKiwoomHoldingRow({
      accountType: 'isa',
      symbol: '214980',
      name: 'KODEX 단기채권PLUS',
      quantity: 5,
      averageBuyPrice: 114530,
      currentPrice: 114555,
      evaluationAmount: 572775,
      profitLoss: -35,
      returnRate: -0.01,
      buyAmount: 572650,
    })

    // naive (114555-114530)*5 = 125 로 덮어쓰지 않음
    expect(row.profitLoss).toBe(-35)
    expect(row.profitRate).toBe(-0.01)
    expect(row.holdingValue).toBe(572775)
  })
})
