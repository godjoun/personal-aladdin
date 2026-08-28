import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PAPER_ACCOUNT_STORAGE_KEY,
  PAPER_TRADES_STORAGE_KEY,
  clearPaperTrading,
} from './paperTradingStorage.js'
import {
  TRADING_PLANS_STORAGE_KEY,
  addTradingPlan,
  clearTradingPlans,
  getTradingPlans,
} from './tradingPlanStorage.js'
import {
  TRADING_TRADES_STORAGE_KEY,
  clearTradingTrades,
} from './tradingTradeStorage.js'
import {
  TRADING_ALERT_SETTINGS_KEY,
  TRADING_ALERT_STATE_KEY,
  clearTradingAlertStorage,
  getPlanAlertState,
  getTradingAlertSettings,
  getTradingAlertStates,
  normalizePlanAlertState,
  pruneTradingAlertStates,
  removePlanAlertState,
  saveTradingAlertSettings,
  saveTradingAlertStates,
  setPlanAlertState,
} from './tradingAlertStorage.js'

/** @type {Storage} */
let memoryStore

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

  clearTradingAlertStorage()
  clearTradingPlans()
  clearTradingTrades()
  clearPaperTrading()
})

afterEach(() => {
  clearTradingAlertStorage()
})

describe('tradingAlertStorage', () => {
  it('기본 설정은 OFF', () => {
    expect(getTradingAlertSettings()).toEqual({
      enabled: false,
      browserNotifications: true,
    })
  })

  it('설정을 저장하고 불러온다', () => {
    saveTradingAlertSettings({
      enabled: true,
      browserNotifications: true,
    })

    expect(getTradingAlertSettings()).toEqual({
      enabled: true,
      browserNotifications: true,
    })
  })

  it('계획별 alert state를 저장한다', () => {
    setPlanAlertState('plan-1', {
      planStatus: 'WAITING',
      lastPriceState: 'ENTRY_REACHED',
      updatedAt: '2026-08-28T12:00:00.000Z',
    })

    expect(getPlanAlertState('plan-1')).toEqual({
      planStatus: 'WAITING',
      lastPriceState: 'ENTRY_REACHED',
      updatedAt: '2026-08-28T12:00:00.000Z',
    })
  })

  it('계획 삭제 시 alert state 정리', () => {
    saveTradingAlertStates({
      'plan-1': {
        planStatus: 'WAITING',
        lastPriceState: 'WAITING',
        updatedAt: '2026-08-28T12:00:00.000Z',
      },
      'plan-2': {
        planStatus: 'ENTERED',
        lastPriceState: 'HOLDING',
        updatedAt: '2026-08-28T12:00:00.000Z',
      },
    })

    removePlanAlertState('plan-1')
    expect(getPlanAlertState('plan-1')).toBeNull()
    expect(getPlanAlertState('plan-2')).not.toBeNull()

    pruneTradingAlertStates(['plan-2'])
    expect(getTradingAlertStates()).toEqual({
      'plan-2': {
        planStatus: 'ENTERED',
        lastPriceState: 'HOLDING',
        updatedAt: '2026-08-28T12:00:00.000Z',
      },
    })
  })

  it('normalizePlanAlertState는 잘못된 값을 거른다', () => {
    expect(normalizePlanAlertState(null)).toBeNull()
    expect(
      normalizePlanAlertState({
        planStatus: 'CLOSED',
        lastPriceState: 'HOLDING',
        updatedAt: '2026-08-28T12:00:00.000Z',
      }),
    ).toBeNull()
    expect(
      normalizePlanAlertState({
        planStatus: 'WAITING',
        lastPriceState: 'INVALID',
        updatedAt: '2026-08-28T12:00:00.000Z',
      }),
    ).toBeNull()
  })

  it('기존 tradingPlan 데이터 영향 없음', () => {
    const plan = addTradingPlan({
      symbol: 'BTC',
      entryPrice: 100,
      stopPrice: 90,
      targetPrice: 120,
      investedAmount: 1000,
      stopLossRate: -10,
      note: '',
    })

    saveTradingAlertSettings({ enabled: true, browserNotifications: true })
    setPlanAlertState(plan.id, {
      planStatus: 'WAITING',
      lastPriceState: 'WAITING',
      updatedAt: '2026-08-28T12:00:00.000Z',
    })

    const rawPlans = localStorage.getItem(TRADING_PLANS_STORAGE_KEY)
    expect(rawPlans).toBeTruthy()
    expect(getTradingPlans()).toHaveLength(1)
    expect(getTradingPlans()[0].symbol).toBe('BTC')
    expect(localStorage.getItem(TRADING_ALERT_SETTINGS_KEY)).toBeTruthy()
    expect(localStorage.getItem(TRADING_ALERT_STATE_KEY)).toBeTruthy()
  })

  it('기존 tradingTrades 영향 없음', () => {
    localStorage.setItem(
      TRADING_TRADES_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'trade-1',
          symbol: 'BTC',
          entryPrice: 100,
          exitPrice: 110,
          investedAmount: 1000,
          returnRate: 10,
          profitLoss: 100,
          tradedAt: '2026-08-28T12:00:00.000Z',
          tags: [],
          entryReason: '',
          exitReason: '',
          createdAt: '2026-08-28T12:00:00.000Z',
          updatedAt: '2026-08-28T12:00:00.000Z',
        },
      ]),
    )

    saveTradingAlertSettings({ enabled: true, browserNotifications: false })

    expect(localStorage.getItem(TRADING_TRADES_STORAGE_KEY)).toContain('trade-1')
    expect(localStorage.getItem(TRADING_ALERT_SETTINGS_KEY)).toContain('enabled')
  })

  it('PAPER 영향 없음', () => {
    localStorage.setItem(
      PAPER_ACCOUNT_STORAGE_KEY,
      JSON.stringify({ balance: 1000000, holdings: {} }),
    )
    localStorage.setItem(PAPER_TRADES_STORAGE_KEY, JSON.stringify([]))

    saveTradingAlertSettings({ enabled: true, browserNotifications: true })

    expect(localStorage.getItem(PAPER_ACCOUNT_STORAGE_KEY)).toContain('balance')
    expect(localStorage.getItem(PAPER_TRADES_STORAGE_KEY)).toBe('[]')
  })
})
