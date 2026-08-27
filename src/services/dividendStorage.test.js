import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addDividendEvent,
  calculateDividendAmount,
  deleteDividendEvent,
  getDividendEvents,
  getDividendEventsByMonth,
  getDividendEventsByYear,
  saveDividendEvents,
  updateDividendEvent,
} from './dividendStorage.js'
import { clearFinanceMemory } from './memoryFinanceStore.js'

function createTestEvent(overrides = {}) {
  return {
    symbol: 'TESTETF',
    fundName: 'TEST ETF',
    recordDate: '2026-01-10',
    exDate: '2026-01-11',
    paymentDate: '2026-01-20',
    distributionPerShare: 37,
    quantity: 80,
    expectedAmount: 2960,
    confirmedAmount: null,
    status: 'ESTIMATED',
    source: null,
    ...overrides,
  }
}

beforeEach(() => {
  clearFinanceMemory()
})

afterEach(() => {
  clearFinanceMemory()
})

describe('getDividendEvents', () => {
  it('저장 데이터가 없으면 [] 를 반환한다', () => {
    expect(getDividendEvents()).toEqual([])
  })

  it('잘못된 날짜 데이터가 있어도 전체 조회가 죽지 않는다', () => {
    saveDividendEvents([
      {
        id: 'bad-date-1',
        symbol: 'TESTETF',
        fundName: 'TEST ETF',
        paymentDate: 'not-a-date',
        distributionPerShare: 1,
        quantity: 1,
        status: 'ESTIMATED',
      },
      {
        id: 'ok-1',
        symbol: 'TESTETF',
        fundName: 'TEST ETF',
        paymentDate: '2026-02-01',
        distributionPerShare: 1,
        quantity: 1,
        status: 'PAID',
        confirmedAmount: 1,
      },
    ])
    expect(() => getDividendEvents()).not.toThrow()
    expect(getDividendEvents()).toHaveLength(2)
  })
})

describe('calculateDividendAmount', () => {
  it('수량 × 주당분배금', () => {
    expect(calculateDividendAmount(80, 37)).toBe(2960)
  })

  it('음수면 오류', () => {
    expect(() => calculateDividendAmount(-1, 1)).toThrow()
  })
})

describe('addDividendEvent', () => {
  it('이벤트를 추가하고 id/createdAt을 부여한다', () => {
    const created = addDividendEvent(createTestEvent())
    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBeTruthy()
    expect(getDividendEvents()).toHaveLength(1)
  })

  it('잘못된 status면 오류', () => {
    expect(() =>
      addDividendEvent(createTestEvent({ status: 'NOPE' })),
    ).toThrow()
  })
})

describe('updateDividendEvent', () => {
  it('부분 수정하고 createdAt은 유지한다', () => {
    const created = addDividendEvent(createTestEvent())
    const updated = updateDividendEvent(created.id, {
      status: 'CONFIRMED',
      confirmedAmount: 2960,
    })
    expect(updated.status).toBe('CONFIRMED')
    expect(updated.createdAt).toBe(created.createdAt)
  })

  it('없는 id면 오류', () => {
    expect(() => updateDividendEvent('missing', { status: 'PAID' })).toThrow()
  })
})

describe('deleteDividendEvent', () => {
  it('해당 id를 삭제한다', () => {
    const a = addDividendEvent(createTestEvent())
    const b = addDividendEvent(createTestEvent({ fundName: 'OTHER' }))
    const remaining = deleteDividendEvent(a.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(b.id)
  })
})

describe('getDividendEventsByYear / Month', () => {
  it('연·월 필터', () => {
    addDividendEvent(createTestEvent({ paymentDate: '2026-01-20' }))
    addDividendEvent(
      createTestEvent({
        paymentDate: '2026-02-20',
        status: 'PAID',
        confirmedAmount: 100,
      }),
    )
    addDividendEvent(
      createTestEvent({
        paymentDate: '2025-12-20',
        status: 'PAID',
        confirmedAmount: 50,
      }),
    )
    expect(getDividendEventsByYear(2026)).toHaveLength(2)
    expect(getDividendEventsByMonth(2026, 1)).toHaveLength(1)
  })

  it('잘못된 month면 오류', () => {
    expect(() => getDividendEventsByMonth(2026, 13)).toThrow()
  })
})

describe('clearFinanceMemory', () => {
  it('logout용으로 금융 메모리를 비운다', () => {
    addDividendEvent(createTestEvent())
    expect(getDividendEvents()).toHaveLength(1)
    clearFinanceMemory()
    expect(getDividendEvents()).toEqual([])
  })
})
