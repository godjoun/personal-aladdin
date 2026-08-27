import { describe, expect, it } from 'vitest'
import {
  calculateLast12MonthsDividendBars,
  calculateMonthlyDividendSummary,
  calculateYearPaidDividend,
  getDividendStatusLabel,
  getNextDividendEvent,
} from './dividendCalculator.js'
import {
  canEditDividendEvent,
  filterDividendsByAccount,
  filterHoldingsByAccount,
  isKiwoomDividendEvent,
} from './dashboardFilters.js'
import { getPnlClass } from './formatters.js'

function paid(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    status: 'PAID',
    paymentDate: '2026-08-04',
    confirmedAmount: 1000,
    ...overrides,
  }
}

describe('account filter', () => {
  it('보유종목을 ISA / 일반으로 필터한다', () => {
    const rows = [
      { id: '1', accountType: 'isa', name: 'A' },
      { id: '2', accountType: 'general', name: 'B' },
      { id: '3', accountType: null, name: 'C' },
    ]

    expect(filterHoldingsByAccount(rows, 'isa')).toHaveLength(1)
    expect(filterHoldingsByAccount(rows, 'general')).toHaveLength(1)
    expect(filterHoldingsByAccount(rows, 'all')).toHaveLength(3)
  })

  it('배당을 계좌로 필터한다', () => {
    const events = [
      paid({ accountType: 'isa', confirmedAmount: 100 }),
      paid({ accountType: 'general', confirmedAmount: 200 }),
    ]
    expect(filterDividendsByAccount(events, 'isa')[0].confirmedAmount).toBe(100)
    expect(filterDividendsByAccount(events, 'all')).toHaveLength(2)
  })
})

describe('dividend monthly / yearly / 12m bars', () => {
  const events = [
    paid({ paymentDate: '2026-08-04', confirmedAmount: 2310 }),
    paid({ paymentDate: '2026-08-04', confirmedAmount: 2960 }),
    paid({ paymentDate: '2026-08-04', confirmedAmount: 510 }),
    paid({ paymentDate: '2026-08-19', confirmedAmount: 1415 }),
    paid({ paymentDate: '2025-12-01', confirmedAmount: 500 }),
  ]

  it('dividend monthly summary (PAID)', () => {
    const summary = calculateMonthlyDividendSummary(events, 2026, 8)
    expect(summary.paid).toBe(7195)
  })

  it('dividend yearly summary (PAID)', () => {
    expect(calculateYearPaidDividend(events, 2026)).toBe(7195)
  })

  it('12개월 월별 합계', () => {
    const bars = calculateLast12MonthsDividendBars(
      events,
      new Date(2026, 7, 26),
    )
    expect(bars).toHaveLength(12)
    const aug = bars.find((bar) => bar.year === 2026 && bar.month === 8)
    expect(aug.total).toBe(7195)
    const emptyMonth = bars.find((bar) => bar.year === 2026 && bar.month === 1)
    expect(emptyMonth.total).toBe(0)
  })
})

describe('PAID / CONFIRMED / ESTIMATED', () => {
  it('상태 라벨을 구분한다', () => {
    expect(getDividendStatusLabel('PAID')).toBe('지급완료')
    expect(getDividendStatusLabel('CONFIRMED')).toBe('확정')
    expect(getDividendStatusLabel('ESTIMATED')).toBe('예정')
  })

  it('PAID 는 다음 배당에서 제외한다', () => {
    const today = new Date(2026, 7, 10)
    const next = getNextDividendEvent(
      [
        paid({ paymentDate: '2026-08-20', confirmedAmount: 1 }),
        {
          id: 'est',
          status: 'ESTIMATED',
          paymentDate: '2026-08-25',
          expectedAmount: 10,
        },
      ],
      today,
    )
    expect(next?.id).toBe('est')
  })
})

describe('KIWOOM read-only vs manual edit', () => {
  it('KIWOOM event read-only', () => {
    const event = { source: 'KIWOOM' }
    expect(isKiwoomDividendEvent(event)).toBe(true)
    expect(canEditDividendEvent(event)).toBe(false)
  })

  it('manual event edit 가능', () => {
    const event = { source: 'MANUAL' }
    expect(canEditDividendEvent(event)).toBe(true)
  })
})

describe('현재가 없음 / pnl class', () => {
  it('0 손익은 중립 클래스', () => {
    expect(getPnlClass(0)).toBe('')
    expect(getPnlClass(10)).toBe('dashboard__cell--profit')
    expect(getPnlClass(-10)).toBe('dashboard__cell--loss')
  })
})
