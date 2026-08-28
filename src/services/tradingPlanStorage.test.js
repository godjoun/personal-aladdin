import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PAPER_ACCOUNT_STORAGE_KEY,
  PAPER_TRADES_STORAGE_KEY,
  clearPaperTrading,
  createPaperAccount,
} from './paperTradingStorage.js'
import {
  TRADING_PLANS_STORAGE_KEY,
  addTradingPlan,
  cancelTradingPlan,
  clearTradingPlans,
  deleteTradingPlan,
  getTradingPlanById,
  getTradingPlans,
  normalizeTradingPlan,
  recordPlanEntry,
  recordPlanExit,
  updateTradingPlan,
} from './tradingPlanStorage.js'
import {
  addTradingTrade,
  addTradingTradeFromClosedPlan,
  clearTradingTrades,
  getTradingTrades,
} from './tradingTradeStorage.js'

/** @type {Storage} */
let memoryStore

const FIXED_NOW = new Date('2026-08-28T12:00:00.000Z')

const PLAN_INPUT = {
  symbol: 'BTC',
  entryPrice: 106_000_000,
  stopPrice: 103_000_000,
  targetPrice: 112_000_000,
  investedAmount: 500_000,
  note: '테스트 계획',
}

beforeEach(() => {
  memoryStore = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(memoryStore._data, key)
        ? memoryStore._data[key]
        : null
    },
    setItem(key, value) {
      memoryStore._data[key] = String(value)
    },
    removeItem(key) {
      delete memoryStore._data[key]
    },
    clear() {
      memoryStore._data = {}
    },
    _data: {},
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStore,
  })
  clearTradingPlans()
  clearTradingTrades()
  clearPaperTrading()
})

afterEach(() => {
  clearTradingPlans()
  clearTradingTrades()
  clearPaperTrading()
})

describe('tradingPlanStorage', () => {
  it('매매 계획을 저장한다', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)

    expect(plan.symbol).toBe('BTC')
    expect(plan.status).toBe('WAITING')
    expect(plan.expectedLoss).toBeCloseTo(14_150.943396, 2)
    expect(getTradingPlans()).toHaveLength(1)
  })

  it('기존 WAITING 데이터를 호환한다', () => {
    localStorage.setItem(
      TRADING_PLANS_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'legacy',
          symbol: 'BTC',
          entryPrice: 100,
          stopPrice: 90,
          targetPrice: 120,
          investedAmount: 1000,
          stopLossRate: -10,
          expectedLoss: 100,
          targetReturnRate: 20,
          expectedProfit: 200,
          riskRewardRatio: 2,
          note: '',
          status: 'WAITING',
          createdAt: '2026-08-28T10:00:00.000Z',
          updatedAt: '2026-08-28T10:00:00.000Z',
        },
      ]),
    )

    const plans = getTradingPlans()
    expect(plans).toHaveLength(1)
    expect(plans[0].status).toBe('WAITING')
    expect(plans[0].actualEntryPrice).toBeUndefined()
  })

  it('WAITING → ENTERED 전환과 실제 진입 데이터 저장', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)

    const entered = recordPlanEntry(
      plan.id,
      {
        actualEntryPrice: 105_500_000,
        actualInvestedAmount: 480_000,
        entryNote: '실제 매수',
      },
      FIXED_NOW,
    )

    expect(entered?.status).toBe('ENTERED')
    expect(entered?.actualEntryPrice).toBe(105_500_000)
    expect(entered?.actualInvestedAmount).toBe(480_000)
    expect(entered?.entryPrice).toBe(plan.entryPrice)
    expect(entered?.enteredAt).toBe(FIXED_NOW.toISOString())
  })

  it('ENTERED → CLOSED 전환과 실제 청산 손익 저장', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)
    recordPlanEntry(plan.id, {
      actualEntryPrice: 100,
      actualInvestedAmount: 1000,
    })

    const closed = recordPlanExit(
      plan.id,
      { actualExitPrice: 110, exitNote: '청산' },
      new Date('2026-08-29T12:00:00.000Z'),
    )

    expect(closed?.plan.status).toBe('CLOSED')
    expect(closed?.plan.actualExitPrice).toBe(110)
    expect(closed?.plan.actualReturnRate).toBeCloseTo(10)
    expect(closed?.plan.actualProfitLoss).toBeCloseTo(100)
    expect(closed?.plan.exitNote).toBe('청산')
    expect(closed?.tradeSync.status).toBe('created')

    const trades = getTradingTrades()
    expect(trades).toHaveLength(1)
    expect(trades[0].sourcePlanId).toBe(plan.id)
    expect(trades[0].returnRate).toBeCloseTo(10)
  })

  it('WAITING → CANCELLED 전환', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)
    const cancelled = cancelTradingPlan(plan.id, FIXED_NOW)

    expect(cancelled?.status).toBe('CANCELLED')
    expect(cancelled?.cancelledAt).toBe(FIXED_NOW.toISOString())
  })

  it('ENTERED 상태는 CANCELLED로 전환할 수 없다', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)
    recordPlanEntry(plan.id, {
      actualEntryPrice: 100,
      actualInvestedAmount: 1000,
    })

    expect(() => cancelTradingPlan(plan.id)).toThrow()
    expect(getTradingPlanById(plan.id)?.status).toBe('ENTERED')
  })

  it('WAITING 계획만 수정할 수 있다', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)
    recordPlanEntry(plan.id, {
      actualEntryPrice: 100,
      actualInvestedAmount: 1000,
    })

    expect(() =>
      updateTradingPlan(plan.id, {
        ...PLAN_INPUT,
        investedAmount: 600_000,
      }),
    ).toThrow()
  })

  it('계획을 수정하고 id·createdAt을 유지한다', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)

    const updated = updateTradingPlan(
      plan.id,
      { ...PLAN_INPUT, note: '수정됨' },
      new Date('2026-08-29T12:00:00.000Z'),
    )

    expect(updated?.id).toBe(plan.id)
    expect(updated?.createdAt).toBe(plan.createdAt)
    expect(updated?.note).toBe('수정됨')
  })

  it('존재하지 않는 id 수정/진입/청산/취소는 null', () => {
    expect(updateTradingPlan('missing', PLAN_INPUT)).toBeNull()
    expect(
      recordPlanEntry('missing', {
        actualEntryPrice: 1,
        actualInvestedAmount: 1,
      }),
    ).toBeNull()
    expect(recordPlanExit('missing', { actualExitPrice: 1 })).toBeNull()
    expect(cancelTradingPlan('missing')).toBeNull()
  })

  it('계획을 삭제한다', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)
    expect(deleteTradingPlan(plan.id)).toBe(true)
    expect(getTradingPlans()).toEqual([])
  })

  it('손상된 localStorage 값은 무시한다', () => {
    localStorage.setItem(TRADING_PLANS_STORAGE_KEY, 'not-json')
    expect(getTradingPlans()).toEqual([])

    localStorage.setItem(
      TRADING_PLANS_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'bad',
          symbol: 'BTC',
          entryPrice: 100,
          stopPrice: 110,
          targetPrice: 120,
          investedAmount: 1000,
          stopLossRate: -10,
          expectedLoss: 100,
          targetReturnRate: 20,
          expectedProfit: 200,
          riskRewardRatio: 2,
          note: '',
          status: 'WAITING',
          createdAt: '2026-08-28T10:00:00.000Z',
          updatedAt: '2026-08-28T10:00:00.000Z',
        },
      ]),
    )
    expect(getTradingPlans()).toEqual([])
  })

  it('normalizeTradingPlan은 CLOSED 상태를 검증한다', () => {
    expect(
      normalizeTradingPlan({
        id: 'x',
        symbol: 'BTC',
        entryPrice: 100,
        stopPrice: 90,
        targetPrice: 120,
        investedAmount: 1000,
        stopLossRate: -10,
        expectedLoss: 100,
        targetReturnRate: 20,
        expectedProfit: 200,
        riskRewardRatio: 2,
        note: '',
        status: 'CLOSED',
        actualEntryPrice: 100,
        actualInvestedAmount: 1000,
        enteredAt: '2026-08-28T10:00:00.000Z',
        actualExitPrice: 110,
        closedAt: '2026-08-28T11:00:00.000Z',
        actualProfitLoss: 100,
        actualReturnRate: 10,
        createdAt: '2026-08-28T10:00:00.000Z',
        updatedAt: '2026-08-28T11:00:00.000Z',
      })?.status,
    ).toBe('CLOSED')
  })

  it('CLOSED 전환 시 기존 수동 tradingTrade는 유지된다', () => {
    const trade = addTradingTrade({
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 1000000,
    })

    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)
    recordPlanEntry(plan.id, {
      actualEntryPrice: 100,
      actualInvestedAmount: 1000,
    })
    recordPlanExit(plan.id, { actualExitPrice: 110 })

    const trades = getTradingTrades()
    expect(trades.find((item) => item.id === trade.id)).toBeTruthy()
    expect(trades.some((item) => item.sourcePlanId === plan.id)).toBe(true)
    expect(trades.length).toBe(2)
  })

  it('같은 CLOSED plan 재처리 시 매매일지 중복 생성하지 않는다', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)
    recordPlanEntry(plan.id, {
      actualEntryPrice: 100,
      actualInvestedAmount: 1000,
    })

    const first = recordPlanExit(plan.id, { actualExitPrice: 110 })
    expect(first?.tradeSync.status).toBe('created')

    const closedPlan = getTradingPlanById(plan.id)
    const second = addTradingTradeFromClosedPlan(closedPlan, FIXED_NOW)
    expect(second.status).toBe('skipped')
    expect(getTradingTrades()).toHaveLength(1)
  })

  it('CLOSED plan 삭제 후 생성된 trade는 유지된다', () => {
    const plan = addTradingPlan(PLAN_INPUT, FIXED_NOW)
    recordPlanEntry(plan.id, {
      actualEntryPrice: 100,
      actualInvestedAmount: 1000,
    })
    recordPlanExit(plan.id, { actualExitPrice: 110 })

    expect(deleteTradingPlan(plan.id)).toBe(true)
    expect(getTradingPlans()).toHaveLength(0)
    expect(getTradingTrades()).toHaveLength(1)
    expect(getTradingTrades()[0].sourcePlanId).toBe(plan.id)
  })

  it('매매 계획 작업이 paper 데이터에 영향을 주지 않는다', () => {
    createPaperAccount(1000000, FIXED_NOW)
    localStorage.setItem(PAPER_TRADES_STORAGE_KEY, JSON.stringify([{ mode: 'PAPER' }]))

    addTradingPlan(PLAN_INPUT, FIXED_NOW)
    clearTradingPlans()

    expect(localStorage.getItem(PAPER_ACCOUNT_STORAGE_KEY)).toBeTruthy()
    expect(localStorage.getItem(PAPER_TRADES_STORAGE_KEY)).toBeTruthy()
  })
})
