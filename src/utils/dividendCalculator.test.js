import { describe, expect, it } from 'vitest'
import {
  calculateMonthlyDividendSummary,
  calculateYearPaidDividend,
  getDividendEventAmount,
  getNextDividendEvent,
} from './dividendCalculator.js'

function createEvent(overrides = {}) {
  return {
    id: 'test-id',
    symbol: 'TESTA',
    fundName: 'TEST ETF A',
    recordDate: null,
    exDate: null,
    paymentDate: '2026-08-15',
    distributionPerShare: 10,
    quantity: 100,
    expectedAmount: null,
    confirmedAmount: null,
    status: 'ESTIMATED',
    source: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('getDividendEventAmount', () => {
  it('ESTIMATED 는 expectedAmount 를 우선 사용한다', () => {
    expect(
      getDividendEventAmount(
        createEvent({
          status: 'ESTIMATED',
          expectedAmount: 1200,
          quantity: 100,
          distributionPerShare: 10,
        }),
      ),
    ).toBe(1200)
  })

  it('ESTIMATED 에서 expectedAmount 가 없으면 quantity × distributionPerShare', () => {
    expect(
      getDividendEventAmount(
        createEvent({
          status: 'ESTIMATED',
          expectedAmount: null,
          quantity: 80,
          distributionPerShare: 37,
        }),
      ),
    ).toBe(2960)
  })

  it('CONFIRMED 는 confirmedAmount 를 우선 사용한다', () => {
    expect(
      getDividendEventAmount(
        createEvent({
          status: 'CONFIRMED',
          confirmedAmount: 1500,
          quantity: 100,
          distributionPerShare: 10,
        }),
      ),
    ).toBe(1500)
  })

  it('CONFIRMED 에서 confirmedAmount 가 없으면 fallback', () => {
    expect(
      getDividendEventAmount(
        createEvent({
          status: 'CONFIRMED',
          confirmedAmount: null,
          quantity: 50,
          distributionPerShare: 20,
        }),
      ),
    ).toBe(1000)
  })

  it('PAID 는 confirmedAmount 를 우선 사용한다', () => {
    expect(
      getDividendEventAmount(
        createEvent({
          status: 'PAID',
          confirmedAmount: 2100,
          quantity: 100,
          distributionPerShare: 10,
        }),
      ),
    ).toBe(2100)
  })

  it('PAID 에서 confirmedAmount 가 없으면 fallback', () => {
    expect(
      getDividendEventAmount(
        createEvent({
          status: 'PAID',
          confirmedAmount: null,
          quantity: 40,
          distributionPerShare: 25,
        }),
      ),
    ).toBe(1000)
  })

  it('계산 불가능하면 0 을 반환한다', () => {
    expect(
      getDividendEventAmount(
        createEvent({
          status: 'ESTIMATED',
          expectedAmount: null,
          quantity: null,
          distributionPerShare: 10,
        }),
      ),
    ).toBe(0)
  })
})

describe('calculateMonthlyDividendSummary', () => {
  it('월별 상태별 합계에 중복이 없다', () => {
    const events = [
      createEvent({
        id: 'a',
        fundName: 'TEST ETF A',
        status: 'ESTIMATED',
        paymentDate: '2026-08-10',
        expectedAmount: 100,
      }),
      createEvent({
        id: 'b',
        fundName: 'TEST ETF B',
        status: 'CONFIRMED',
        paymentDate: '2026-08-12',
        confirmedAmount: 200,
      }),
      createEvent({
        id: 'c',
        fundName: 'TEST ETF C',
        status: 'PAID',
        paymentDate: '2026-08-20',
        confirmedAmount: 300,
      }),
      createEvent({
        id: 'other-month',
        fundName: 'TEST ETF A',
        status: 'PAID',
        paymentDate: '2026-07-20',
        confirmedAmount: 999,
      }),
    ]

    const summary = calculateMonthlyDividendSummary(events, 2026, 8)

    expect(summary).toEqual({
      estimated: 100,
      confirmed: 200,
      paid: 300,
    })
  })

  it('같은 날짜에 여러 이벤트가 있어도 상태별로 합산한다', () => {
    const events = [
      createEvent({
        id: 'a',
        fundName: 'TEST ETF A',
        status: 'ESTIMATED',
        paymentDate: '2026-08-15',
        expectedAmount: 100,
      }),
      createEvent({
        id: 'b',
        fundName: 'TEST ETF B',
        status: 'ESTIMATED',
        paymentDate: '2026-08-15',
        expectedAmount: 50,
      }),
    ]

    expect(calculateMonthlyDividendSummary(events, 2026, 8)).toEqual({
      estimated: 150,
      confirmed: 0,
      paid: 0,
    })
  })
})

describe('calculateYearPaidDividend', () => {
  it('올해 누적은 PAID 만 합산한다', () => {
    const events = [
      createEvent({
        id: 'paid-1',
        fundName: 'TEST ETF A',
        status: 'PAID',
        paymentDate: '2026-03-01',
        confirmedAmount: 400,
      }),
      createEvent({
        id: 'paid-2',
        fundName: 'TEST ETF B',
        status: 'PAID',
        paymentDate: '2026-11-01',
        confirmedAmount: 600,
      }),
      createEvent({
        id: 'est',
        fundName: 'TEST ETF C',
        status: 'ESTIMATED',
        paymentDate: '2026-08-01',
        expectedAmount: 9999,
      }),
      createEvent({
        id: 'other-year',
        fundName: 'TEST ETF A',
        status: 'PAID',
        paymentDate: '2025-12-01',
        confirmedAmount: 1000,
      }),
    ]

    expect(calculateYearPaidDividend(events, 2026)).toBe(1000)
  })
})

describe('getNextDividendEvent', () => {
  const today = new Date(2026, 7, 10) // 2026-08-10

  it('오늘 이후(포함) 가장 가까운 이벤트를 고른다', () => {
    const events = [
      createEvent({
        id: 'past',
        fundName: 'TEST ETF A',
        status: 'CONFIRMED',
        paymentDate: '2026-08-01',
      }),
      createEvent({
        id: 'soon',
        fundName: 'TEST ETF B',
        status: 'ESTIMATED',
        paymentDate: '2026-08-20',
      }),
      createEvent({
        id: 'later',
        fundName: 'TEST ETF C',
        status: 'CONFIRMED',
        paymentDate: '2026-09-01',
      }),
    ]

    const next = getNextDividendEvent(events, today)
    expect(next?.id).toBe('soon')
  })

  it('PAID 는 다음 지급 예정에서 제외한다', () => {
    const events = [
      createEvent({
        id: 'paid-soon',
        fundName: 'TEST ETF A',
        status: 'PAID',
        paymentDate: '2026-08-12',
        confirmedAmount: 100,
      }),
      createEvent({
        id: 'next-open',
        fundName: 'TEST ETF B',
        status: 'ESTIMATED',
        paymentDate: '2026-08-25',
        expectedAmount: 200,
      }),
    ]

    expect(getNextDividendEvent(events, today)?.id).toBe('next-open')
  })

  it('과거 일정은 제외한다', () => {
    const events = [
      createEvent({
        id: 'old',
        fundName: 'TEST ETF A',
        status: 'ESTIMATED',
        paymentDate: '2026-07-01',
      }),
    ]

    expect(getNextDividendEvent(events, today)).toBeNull()
  })

  it('같은 날짜 여러 이벤트면 fundName 순으로 고른다', () => {
    const events = [
      createEvent({
        id: 'c',
        fundName: 'TEST ETF C',
        status: 'ESTIMATED',
        paymentDate: '2026-08-15',
      }),
      createEvent({
        id: 'a',
        fundName: 'TEST ETF A',
        status: 'CONFIRMED',
        paymentDate: '2026-08-15',
      }),
    ]

    expect(getNextDividendEvent(events, today)?.id).toBe('a')
  })

  it('잘못된 paymentDate 가 있어도 계산 전체가 죽지 않는다', () => {
    const events = [
      createEvent({
        id: 'bad',
        fundName: 'TEST ETF A',
        status: 'ESTIMATED',
        paymentDate: 'not-a-date',
      }),
      createEvent({
        id: 'ok',
        fundName: 'TEST ETF B',
        status: 'CONFIRMED',
        paymentDate: '2026-08-18',
      }),
    ]

    expect(() => getNextDividendEvent(events, today)).not.toThrow()
    expect(getNextDividendEvent(events, today)?.id).toBe('ok')

    expect(() => calculateMonthlyDividendSummary(events, 2026, 8)).not.toThrow()
    expect(calculateMonthlyDividendSummary(events, 2026, 8).confirmed).toBe(1000)

    expect(() => calculateYearPaidDividend(events, 2026)).not.toThrow()
  })
})
