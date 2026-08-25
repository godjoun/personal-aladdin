import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addDividendEvent,
  calculateDividendAmount,
  deleteDividendEvent,
  getDividendEvents,
  getDividendEventsByMonth,
  getDividendEventsByYear,
  updateDividendEvent,
} from './dividendStorage.js'

const STORAGE_KEY = 'aladdin_dividend_events'

function createMemoryStorage() {
  const store = new Map()

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(String(key), String(value))
    },
    removeItem(key) {
      store.delete(String(key))
    },
    clear() {
      store.clear()
    },
  }
}

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
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getDividendEvents', () => {
  it('저장 데이터가 없으면 [] 를 반환한다', () => {
    expect(getDividendEvents()).toEqual([])
  })

  it('깨진 JSON 이면 [] 를 반환한다', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json')
    expect(getDividendEvents()).toEqual([])
  })

  it('저장값이 배열이 아니면 [] 를 반환한다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ok: false }))
    expect(getDividendEvents()).toEqual([])
  })

  it('잘못된 날짜 데이터가 있어도 전체 조회가 죽지 않는다', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'bad-date-1',
          symbol: 'TESTETF',
          fundName: 'TEST ETF',
          paymentDate: 'not-a-real-date',
          quantity: 1,
          distributionPerShare: 1,
          status: 'ESTIMATED',
        },
        {
          id: 'ok-1',
          symbol: 'TESTETF2',
          fundName: 'TEST ETF 2',
          paymentDate: '2026-03-15',
          quantity: 2,
          distributionPerShare: 10,
          status: 'PAID',
        },
      ]),
    )

    expect(() => getDividendEvents()).not.toThrow()
    expect(getDividendEvents()).toHaveLength(2)
    expect(() => getDividendEventsByYear(2026)).not.toThrow()
    expect(getDividendEventsByYear(2026)).toHaveLength(1)
  })
})

describe('addDividendEvent', () => {
  it('정상 이벤트 추가 시 id, createdAt, updatedAt 을 생성한다', () => {
    const saved = addDividendEvent(createTestEvent())

    expect(typeof saved.id).toBe('string')
    expect(saved.id.length).toBeGreaterThan(0)
    expect(saved.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(getDividendEvents()).toHaveLength(1)
  })

  it.each(['ESTIMATED', 'CONFIRMED', 'PAID'])(
    '허용 status %s 로 추가할 수 있다',
    (status) => {
      const saved = addDividendEvent(createTestEvent({ status }))
      expect(saved.status).toBe(status)
    },
  )

  it('허용되지 않은 status 는 거부한다', () => {
    expect(() =>
      addDividendEvent(createTestEvent({ status: 'PENDING' })),
    ).toThrow()
  })

  it('quantity 음수는 거부한다', () => {
    expect(() =>
      addDividendEvent(createTestEvent({ quantity: -1 })),
    ).toThrow()
  })

  it('distributionPerShare 음수는 거부한다', () => {
    expect(() =>
      addDividendEvent(createTestEvent({ distributionPerShare: -5 })),
    ).toThrow()
  })
})

describe('updateDividendEvent', () => {
  it('수정 시 createdAt 은 유지하고 updatedAt 만 변경한다', async () => {
    const saved = addDividendEvent(createTestEvent())
    const createdAt = saved.createdAt

    await new Promise((resolve) => setTimeout(resolve, 5))

    const updated = updateDividendEvent(saved.id, { status: 'CONFIRMED' })

    expect(updated.createdAt).toBe(createdAt)
    expect(updated.updatedAt).not.toBe(createdAt)
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(createdAt).getTime(),
    )
  })

  it('허용되지 않은 status 는 거부한다', () => {
    const saved = addDividendEvent(createTestEvent())
    expect(() =>
      updateDividendEvent(saved.id, { status: 'CANCELLED' }),
    ).toThrow()
  })

  it('quantity 음수는 거부한다', () => {
    const saved = addDividendEvent(createTestEvent())
    expect(() => updateDividendEvent(saved.id, { quantity: -10 })).toThrow()
  })

  it('distributionPerShare 음수는 거부한다', () => {
    const saved = addDividendEvent(createTestEvent())
    expect(() =>
      updateDividendEvent(saved.id, { distributionPerShare: -1 }),
    ).toThrow()
  })
})

describe('deleteDividendEvent', () => {
  it('해당 id 만 제거한다', () => {
    const first = addDividendEvent(createTestEvent({ symbol: 'TESTETF_A' }))
    const second = addDividendEvent(createTestEvent({ symbol: 'TESTETF_B' }))

    const remaining = deleteDividendEvent(first.id)

    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(second.id)
    expect(getDividendEvents().map((event) => event.id)).toEqual([second.id])
  })
})

describe('calculateDividendAmount', () => {
  it('80 * 37 === 2960', () => {
    expect(calculateDividendAmount(80, 37)).toBe(2960)
  })

  it('음수가 들어오면 오류를 던진다', () => {
    expect(() => calculateDividendAmount(-1, 37)).toThrow()
    expect(() => calculateDividendAmount(80, -1)).toThrow()
  })
})

describe('getDividendEventsByYear / getDividendEventsByMonth', () => {
  beforeEach(() => {
    addDividendEvent(
      createTestEvent({
        symbol: 'TESTETF_JAN',
        paymentDate: '2026-01-20',
      }),
    )
    addDividendEvent(
      createTestEvent({
        symbol: 'TESTETF_MAR',
        paymentDate: '2026-03-15',
      }),
    )
    addDividendEvent(
      createTestEvent({
        symbol: 'TESTETF_2025',
        paymentDate: '2025-12-01',
      }),
    )
  })

  it('paymentDate 기준 연도 필터가 정상 동작한다', () => {
    const events2026 = getDividendEventsByYear(2026)
    expect(events2026).toHaveLength(2)
    expect(events2026.every((event) => event.paymentDate.startsWith('2026'))).toBe(
      true,
    )
  })

  it('paymentDate 기준 월 필터가 정상 동작한다', () => {
    const march = getDividendEventsByMonth(2026, 3)
    expect(march).toHaveLength(1)
    expect(march[0].symbol).toBe('TESTETF_MAR')
  })

  it('month 는 1~12 외 값을 거부한다', () => {
    expect(() => getDividendEventsByMonth(2026, 0)).toThrow()
    expect(() => getDividendEventsByMonth(2026, 13)).toThrow()
    expect(() => getDividendEventsByMonth(2026, 1.5)).toThrow()
  })
})
