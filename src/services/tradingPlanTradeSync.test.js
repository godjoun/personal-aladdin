import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TRADING_TRADES_STORAGE_KEY,
  addTradingTrade,
  addTradingTradeFromClosedPlan,
  clearTradingTrades,
  deleteTradingTrade,
  findTradingTradeBySourcePlanId,
  getTradingTrades,
  normalizeTradingTrade,
  updateTradingTrade,
} from './tradingTradeStorage.js'
import {
  TRADING_ALERT_SETTINGS_KEY,
  TRADING_ALERT_STATE_KEY,
  saveTradingAlertSettings,
  setPlanAlertState,
} from './tradingAlertStorage.js'
import {
  PAPER_ACCOUNT_STORAGE_KEY,
  PAPER_TRADES_STORAGE_KEY,
} from './paperTradingStorage.js'
import {
  buildTradingDeskSummary,
  buildTradingPerformanceStats,
} from '../utils/tradingTradeCalculator.js'
import { TRADING_TRADE_SOURCE_PLAN } from '../utils/tradingPlanTradeSync.js'

/** @type {Storage} */
let memoryStore

const FIXED_NOW = new Date('2026-08-29T12:00:00.000Z')

const CLOSED_PLAN = {
  id: 'plan-closed',
  symbol: 'BTC',
  entryPrice: 106_000_000,
  stopPrice: 103_000_000,
  targetPrice: 112_000_000,
  investedAmount: 500_000,
  stopLossRate: -3,
  expectedLoss: 15_000,
  targetReturnRate: 5,
  expectedProfit: 25_000,
  riskRewardRatio: 1.67,
  note: '계획 메모',
  status: 'CLOSED',
  createdAt: '2026-08-28T10:00:00.000Z',
  updatedAt: FIXED_NOW.toISOString(),
  actualEntryPrice: 105_500_000,
  actualInvestedAmount: 480_000,
  enteredAt: '2026-08-28T11:00:00.000Z',
  entryNote: '실제 진입',
  actualExitPrice: 110_000_000,
  closedAt: FIXED_NOW.toISOString(),
  exitNote: '청산 복기',
  actualProfitLoss: 20_000,
  actualReturnRate: 4.17,
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
  clearTradingTrades()
})

afterEach(() => {
  clearTradingTrades()
  vi.restoreAllMocks()
})

describe('addTradingTradeFromClosedPlan', () => {
  it('CLOSED plan → tradingTrade 생성', () => {
    const result = addTradingTradeFromClosedPlan(CLOSED_PLAN, FIXED_NOW)

    expect(result.status).toBe('created')
    expect(result.trade).toMatchObject({
      symbol: 'BTC',
      entryPrice: 105_500_000,
      exitPrice: 110_000_000,
      investedAmount: 480_000,
      returnRate: 4.17,
      profitLoss: 20_000,
      source: TRADING_TRADE_SOURCE_PLAN,
      sourcePlanId: 'plan-closed',
      tradedAt: FIXED_NOW.toISOString(),
    })
    expect(getTradingTrades()).toHaveLength(1)
  })

  it('WAITING/ENTERED/CANCELLED에서는 생성하지 않는다', () => {
    expect(
      addTradingTradeFromClosedPlan({ ...CLOSED_PLAN, status: 'WAITING' }).status,
    ).toBe('not_applicable')
    expect(
      addTradingTradeFromClosedPlan({ ...CLOSED_PLAN, status: 'ENTERED' }).status,
    ).toBe('not_applicable')
    expect(
      addTradingTradeFromClosedPlan({ ...CLOSED_PLAN, status: 'CANCELLED' }).status,
    ).toBe('not_applicable')
  })

  it('같은 plan 재처리 시 중복 생성하지 않는다', () => {
    const first = addTradingTradeFromClosedPlan(CLOSED_PLAN, FIXED_NOW)
    const second = addTradingTradeFromClosedPlan(CLOSED_PLAN, FIXED_NOW)

    expect(first.status).toBe('created')
    expect(second.status).toBe('skipped')
    expect(second.trade?.id).toBe(first.trade?.id)
    expect(getTradingTrades()).toHaveLength(1)
  })

  it('findTradingTradeBySourcePlanId로 조회한다', () => {
    addTradingTradeFromClosedPlan(CLOSED_PLAN, FIXED_NOW)
    expect(findTradingTradeBySourcePlanId('plan-closed')?.symbol).toBe('BTC')
    expect(findTradingTradeBySourcePlanId('missing')).toBeNull()
  })

  it('자동 생성 trade 수정/삭제가 가능하다', () => {
    const created = addTradingTradeFromClosedPlan(CLOSED_PLAN, FIXED_NOW)
    const tradeId = created.trade?.id
    if (!tradeId) throw new Error('missing trade id')

    const updated = updateTradingTrade(
      tradeId,
      {
        symbol: 'BTC',
        entryPrice: 105_500_000,
        exitPrice: 111_000_000,
        investedAmount: 480_000,
        review: '수정됨',
      },
      FIXED_NOW,
    )

    expect(updated?.review).toBe('수정됨')
    expect(updated?.source).toBe(TRADING_TRADE_SOURCE_PLAN)
    expect(updated?.sourcePlanId).toBe('plan-closed')

    expect(deleteTradingTrade(tradeId)).toBe(true)
    expect(getTradingTrades()).toHaveLength(0)
  })

  it('자동 생성 후 거래 통계에 반영된다', () => {
    addTradingTradeFromClosedPlan(CLOSED_PLAN, FIXED_NOW)
    const trades = getTradingTrades()
    const summary = buildTradingDeskSummary(trades)
    const performance = buildTradingPerformanceStats(trades)

    expect(summary.totalTrades).toBe(1)
    expect(summary.totalProfitLoss).toBe(20_000)
    expect(performance.avgWinRate).not.toBeNull()
  })

  it('수동 tradingTrade는 source 없이 정상 유지', () => {
    const manual = addTradingTrade({
      symbol: 'ETH',
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 1000,
    })

    expect(manual.source).toBeUndefined()
    expect(normalizeTradingTrade(manual)?.source).toBeUndefined()
  })

  it('저장 실패 시 failed 상태를 반환한다', () => {
    vi.spyOn(memoryStore, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    const result = addTradingTradeFromClosedPlan(CLOSED_PLAN, FIXED_NOW)
    expect(result.status).toBe('failed')
    expect(result.trade).toBeNull()
  })

  it('PAPER/알림 데이터에 영향 없음', () => {
    localStorage.setItem(
      PAPER_ACCOUNT_STORAGE_KEY,
      JSON.stringify({ balance: 1000000, holdings: {} }),
    )
    localStorage.setItem(PAPER_TRADES_STORAGE_KEY, JSON.stringify([]))
    saveTradingAlertSettings({ enabled: true, browserNotifications: true })
    setPlanAlertState('plan-closed', {
      planStatus: 'WAITING',
      lastPriceState: 'WAITING',
      updatedAt: FIXED_NOW.toISOString(),
    })

    addTradingTradeFromClosedPlan(CLOSED_PLAN, FIXED_NOW)

    expect(localStorage.getItem(PAPER_ACCOUNT_STORAGE_KEY)).toContain('balance')
    expect(localStorage.getItem(PAPER_TRADES_STORAGE_KEY)).toBe('[]')
    expect(localStorage.getItem(TRADING_ALERT_SETTINGS_KEY)).toContain('enabled')
    expect(localStorage.getItem(TRADING_ALERT_STATE_KEY)).toContain('plan-closed')
    expect(localStorage.getItem(TRADING_TRADES_STORAGE_KEY)).toContain('plan-closed')
  })
})
