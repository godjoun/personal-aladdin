import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  addDividendEvent,
  deleteDividendEvent,
  getDividendEvents,
  updateDividendEvent,
} from '../services/dividendStorage.js'
import { clearFinanceMemory } from '../services/memoryFinanceStore.js'
import {
  dividendEventToFormValues,
  validateAndBuildDividendPayload,
} from './dividendForm.js'
import { getDividendEventAmount } from './dividendCalculator.js'

beforeEach(() => {
  clearFinanceMemory()
})

afterEach(() => {
  clearFinanceMemory()
})

describe('validateAndBuildDividendPayload', () => {
  it('정상 배당 이벤트 payload 를 생성한다', () => {
    const result = validateAndBuildDividendPayload({
      fundName: 'TEST ETF A',
      symbol: 'TESTA',
      paymentDate: '2026-09-02',
      quantity: 80,
      distributionPerShare: 37,
      status: 'ESTIMATED',
    })

    expect(result.ok).toBe(true)
    expect(result.payload.fundName).toBe('TEST ETF A')
    expect(result.payload.symbol).toBe('TESTA')
    expect(result.displayAmount).toBe(2960)
  })

  it('필수값 누락을 거부한다', () => {
    expect(
      validateAndBuildDividendPayload({
        fundName: '',
        symbol: 'TESTA',
        paymentDate: '2026-09-02',
        quantity: 1,
        distributionPerShare: 1,
        status: 'ESTIMATED',
      }).ok,
    ).toBe(false)

    expect(
      validateAndBuildDividendPayload({
        fundName: 'TEST ETF A',
        symbol: '',
        paymentDate: '2026-09-02',
        quantity: 1,
        distributionPerShare: 1,
        status: 'ESTIMATED',
      }).ok,
    ).toBe(false)

    expect(
      validateAndBuildDividendPayload({
        fundName: 'TEST ETF A',
        symbol: 'TESTA',
        paymentDate: '',
        quantity: 1,
        distributionPerShare: 1,
        status: 'ESTIMATED',
      }).ok,
    ).toBe(false)
  })

  it('음수 수량을 거부한다', () => {
    const result = validateAndBuildDividendPayload({
      fundName: 'TEST ETF A',
      symbol: 'TESTA',
      paymentDate: '2026-09-02',
      quantity: -1,
      distributionPerShare: 10,
      status: 'ESTIMATED',
    })
    expect(result.ok).toBe(false)
  })

  it('음수 금액을 거부한다', () => {
    expect(
      validateAndBuildDividendPayload({
        fundName: 'TEST ETF A',
        symbol: 'TESTA',
        paymentDate: '2026-09-02',
        quantity: 10,
        distributionPerShare: -5,
        status: 'ESTIMATED',
      }).ok,
    ).toBe(false)

    expect(
      validateAndBuildDividendPayload({
        fundName: 'TEST ETF A',
        symbol: 'TESTA',
        paymentDate: '2026-09-02',
        quantity: 10,
        distributionPerShare: 5,
        status: 'ESTIMATED',
        expectedAmount: -100,
      }).ok,
    ).toBe(false)

    expect(
      validateAndBuildDividendPayload({
        fundName: 'TEST ETF A',
        symbol: 'TESTA',
        paymentDate: '2026-09-02',
        quantity: 10,
        distributionPerShare: 5,
        status: 'PAID',
        confirmedAmount: -100,
      }).ok,
    ).toBe(false)
  })

  it('ESTIMATED fallback 은 quantity × distributionPerShare', () => {
    const result = validateAndBuildDividendPayload({
      fundName: 'TEST ETF B',
      symbol: 'TESTB',
      paymentDate: '2026-08-15',
      quantity: 80,
      distributionPerShare: 37,
      status: 'ESTIMATED',
      expectedAmount: '',
    })
    expect(result.ok).toBe(true)
    expect(getDividendEventAmount(result.payload)).toBe(2960)
  })

  it('CONFIRMED fallback 은 quantity × distributionPerShare', () => {
    const result = validateAndBuildDividendPayload({
      fundName: 'TEST ETF B',
      symbol: 'TESTB',
      paymentDate: '2026-08-15',
      quantity: 50,
      distributionPerShare: 20,
      status: 'CONFIRMED',
      confirmedAmount: '',
    })
    expect(result.ok).toBe(true)
    expect(getDividendEventAmount(result.payload)).toBe(1000)
  })

  it('PAID 는 confirmedAmount 를 우선한다', () => {
    const result = validateAndBuildDividendPayload({
      fundName: 'TEST ETF C',
      symbol: 'TESTC',
      paymentDate: '2026-08-20',
      quantity: 100,
      distributionPerShare: 10,
      status: 'PAID',
      confirmedAmount: 2100,
    })
    expect(result.ok).toBe(true)
    expect(getDividendEventAmount(result.payload)).toBe(2100)
  })
})

describe('dividend event save flow', () => {
  it('저장 후 데이터가 정상 반환된다', () => {
    const built = validateAndBuildDividendPayload({
      fundName: 'TEST ETF A',
      symbol: 'TESTA',
      paymentDate: '2026-09-02',
      quantity: 80,
      distributionPerShare: 37,
      status: 'ESTIMATED',
      expectedAmount: 2960,
    })
    expect(built.ok).toBe(true)

    const saved = addDividendEvent(built.payload)
    expect(saved.id).toBeTruthy()
    expect(getDividendEvents()).toHaveLength(1)
    expect(getDividendEvents()[0].fundName).toBe('TEST ETF A')
  })

  it('기존 이벤트를 수정한다', () => {
    const created = addDividendEvent(
      validateAndBuildDividendPayload({
        fundName: 'TEST ETF A',
        symbol: 'TESTA',
        paymentDate: '2026-09-02',
        quantity: 10,
        distributionPerShare: 10,
        status: 'ESTIMATED',
      }).payload,
    )

    const patched = updateDividendEvent(created.id, {
      status: 'CONFIRMED',
      confirmedAmount: 120,
    })

    expect(patched.status).toBe('CONFIRMED')
    expect(patched.confirmedAmount).toBe(120)
    expect(patched.createdAt).toBe(created.createdAt)
  })

  it('이벤트를 삭제한다', () => {
    const a = addDividendEvent(
      validateAndBuildDividendPayload({
        fundName: 'TEST ETF A',
        symbol: 'TESTA',
        paymentDate: '2026-09-02',
        quantity: 1,
        distributionPerShare: 1,
        status: 'ESTIMATED',
      }).payload,
    )
    addDividendEvent(
      validateAndBuildDividendPayload({
        fundName: 'TEST ETF B',
        symbol: 'TESTB',
        paymentDate: '2026-09-03',
        quantity: 2,
        distributionPerShare: 2,
        status: 'PAID',
        confirmedAmount: 4,
      }).payload,
    )

    const remaining = deleteDividendEvent(a.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].symbol).toBe('TESTB')
  })

  it('dividendEventToFormValues 가 수정용 초기값을 만든다', () => {
    const values = dividendEventToFormValues({
      fundName: 'TEST ETF A',
      symbol: 'TESTA',
      paymentDate: '2026-09-02',
      quantity: 80,
      distributionPerShare: 37,
      status: 'PAID',
      expectedAmount: null,
      confirmedAmount: 2960,
      source: 'manual',
      recordDate: '2026-08-20',
      exDate: '2026-08-21',
    })

    expect(values.fundName).toBe('TEST ETF A')
    expect(values.status).toBe('PAID')
    expect(values.confirmedAmount).toBe(2960)
    expect(values.recordDate).toBe('2026-08-20')
  })
})
