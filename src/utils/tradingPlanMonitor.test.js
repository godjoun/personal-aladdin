import { beforeEach, describe, expect, it } from 'vitest'
import {
  PAPER_ACCOUNT_STORAGE_KEY,
  clearPaperTrading,
  createPaperAccount,
} from '../services/paperTradingStorage.js'
import {
  TRADING_PLANS_STORAGE_KEY,
  addTradingPlan,
  clearTradingPlans,
  getTradingPlans,
} from '../services/tradingPlanStorage.js'
import {
  TRADING_TRADES_STORAGE_KEY,
  addTradingTrade,
  clearTradingTrades,
  getTradingTrades,
} from '../services/tradingTradeStorage.js'
import { UPBIT_TICKER_STALE_MS } from './upbitTickerUtils.js'
import {
  buildTradingPlanMonitorSnapshot,
  calculatePriceDistanceRate,
  deriveEnteredPriceState,
  deriveWaitingPriceState,
  formatEnteredPriceStateLabel,
  formatPriceDistanceLabel,
  formatWaitingPriceStateLabel,
  getPlanCardStatusLabel,
  isPlanMonitorActive,
  resolveSectionConnectionState,
} from './tradingPlanMonitor.js'
import { getActiveTradingPlanSymbols } from './tradingPlanCalculator.js'

const WAITING_PLAN = {
  id: 'plan-waiting',
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
}

const ENTERED_PLAN = {
  ...WAITING_PLAN,
  id: 'plan-entered',
  status: 'ENTERED',
  actualEntryPrice: 98,
  actualInvestedAmount: 980,
  enteredAt: '2026-08-28T11:00:00.000Z',
  entryNote: '',
}

describe('tradingPlanMonitor', () => {
  it('WAITING 진입 대기 상태', () => {
    expect(
      deriveWaitingPriceState({ currentPrice: 105, entryPrice: 100 }),
    ).toBe('WAITING')
    expect(formatWaitingPriceStateLabel('WAITING')).toBe('진입 대기')
  })

  it('WAITING 진입가 도달 상태', () => {
    expect(
      deriveWaitingPriceState({ currentPrice: 100, entryPrice: 100 }),
    ).toBe('ENTRY_REACHED')
    expect(formatWaitingPriceStateLabel('ENTRY_REACHED')).toBe('진입가 도달')
  })

  it('WAITING에서는 손절/목표 상태를 사용하지 않는다', () => {
    expect(
      deriveWaitingPriceState({ currentPrice: 85, entryPrice: 100 }),
    ).toBe('ENTRY_REACHED')
    expect(
      deriveEnteredPriceState({
        currentPrice: 85,
        stopPrice: 90,
        targetPrice: 120,
      }),
    ).toBe('STOP_REACHED')
  })

  it('ENTERED 평가손익과 평가수익률을 계산한다', () => {
    const now = Date.now()
    const snapshot = buildTradingPlanMonitorSnapshot(ENTERED_PLAN, {
      isConnected: true,
      connectionFailed: false,
      getTickerForMarket: () => ({
        tradePrice: 107.8,
        receivedAt: now,
      }),
      now,
      formatPrice: (value) => String(value),
    })

    expect(snapshot.unrealizedReturnRate).toBeCloseTo(10)
    expect(snapshot.unrealizedProfitLoss).toBeCloseTo(98)
  })

  it('ENTERED 손절가 하회와 목표가 도달', () => {
    expect(
      deriveEnteredPriceState({
        currentPrice: 89,
        stopPrice: 90,
        targetPrice: 120,
      }),
    ).toBe('STOP_REACHED')
    expect(formatEnteredPriceStateLabel('STOP_REACHED')).toBe('손절가 하회')

    expect(
      deriveEnteredPriceState({
        currentPrice: 120,
        stopPrice: 90,
        targetPrice: 120,
      }),
    ).toBe('TARGET_REACHED')
    expect(formatEnteredPriceStateLabel('TARGET_REACHED')).toBe('목표가 도달')
    expect(formatEnteredPriceStateLabel('HOLDING')).toBe('보유 중')
  })

  it('stale/disconnected에서는 평가손익을 정상 값처럼 표시하지 않는다', () => {
    const now = Date.now()
    const stale = buildTradingPlanMonitorSnapshot(ENTERED_PLAN, {
      isConnected: true,
      connectionFailed: false,
      getTickerForMarket: () => ({
        tradePrice: 110,
        receivedAt: now - UPBIT_TICKER_STALE_MS - 1,
      }),
      now,
      formatPrice: (value) => String(value),
    })

    expect(stale.unrealizedProfitLoss).toBeNull()
    expect(stale.unrealizedProfitLabel).toBe('확인할 수 없음')
  })

  it('CLOSED/CANCELLED는 모니터링 대상이 아니다', () => {
    expect(isPlanMonitorActive({ ...WAITING_PLAN, status: 'CLOSED' })).toBe(false)
    expect(isPlanMonitorActive({ ...WAITING_PLAN, status: 'CANCELLED' })).toBe(false)
    expect(isPlanMonitorActive(WAITING_PLAN)).toBe(true)
  })

  it('카드 상태 라벨을 status별로 반환한다', () => {
    const now = Date.now()
    const waitingSnapshot = buildTradingPlanMonitorSnapshot(WAITING_PLAN, {
      isConnected: true,
      connectionFailed: false,
      getTickerForMarket: () => ({ tradePrice: 105, receivedAt: now }),
      now,
      formatPrice: String,
    })

    expect(getPlanCardStatusLabel(WAITING_PLAN, waitingSnapshot)).toBe('진입 대기')
    expect(
      getPlanCardStatusLabel(
        { ...WAITING_PLAN, status: 'CLOSED' },
        buildTradingPlanMonitorSnapshot(
          { ...WAITING_PLAN, status: 'CLOSED' },
          {
            isConnected: true,
            connectionFailed: false,
            getTickerForMarket: () => null,
            now,
            formatPrice: String,
          },
        ),
      ),
    ).toBe('거래 종료')
  })

  it('진입가 거리를 계산한다', () => {
    expect(calculatePriceDistanceRate(101.13, 100)).toBeCloseTo(1.13, 2)
    expect(formatPriceDistanceLabel(101.13, 100, '진입가')).toBe(
      '진입가까지 1.13% 위',
    )
  })

  it('모든 활성 계획 symbol을 구독 대상으로 수집한다', () => {
    const symbols = getActiveTradingPlanSymbols([
      { ...WAITING_PLAN, symbol: 'BTC' },
      { ...ENTERED_PLAN, symbol: 'ETH' },
      { ...WAITING_PLAN, id: 'closed', status: 'CLOSED', symbol: 'SOL' },
      { ...WAITING_PLAN, id: 'cancel', status: 'CANCELLED', symbol: 'DOGE' },
    ])

    expect(symbols.sort()).toEqual(['BTC', 'ETH'])
  })

  it('section connection state를 계산한다', () => {
    const now = Date.now()
    expect(
      resolveSectionConnectionState({
        isConnected: true,
        connectionFailed: false,
        tickers: { 'KRW-BTC': { receivedAt: now - 1000 } },
        markets: ['KRW-BTC'],
        now,
      }),
    ).toBe('CONNECTED')
  })
})

describe('trading plan monitor data isolation', () => {
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
    clearTradingPlans()
    clearTradingTrades()
    clearPaperTrading()
  })

  it('monitor 계산은 tradingPlan 저장 데이터를 변경하지 않는다', () => {
    const plan = addTradingPlan({
      symbol: 'BTC',
      entryPrice: 100,
      stopPrice: 90,
      targetPrice: 120,
      investedAmount: 1000,
    })
    const before = JSON.stringify(getTradingPlans())

    buildTradingPlanMonitorSnapshot(plan, {
      isConnected: true,
      connectionFailed: false,
      getTickerForMarket: () => ({
        tradePrice: 105,
        receivedAt: Date.now(),
      }),
      now: Date.now(),
      formatPrice: String,
    })

    expect(JSON.stringify(getTradingPlans())).toBe(before)
    expect(localStorage.getItem(TRADING_PLANS_STORAGE_KEY)).toBe(before)
  })

  it('PAPER/tradingTrades 데이터를 변경하지 않는다', () => {
    addTradingTrade({
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 1000,
    })
    createPaperAccount(1000000)

    const tradesBefore = localStorage.getItem(TRADING_TRADES_STORAGE_KEY)
    const paperBefore = localStorage.getItem(PAPER_ACCOUNT_STORAGE_KEY)

    buildTradingPlanMonitorSnapshot(WAITING_PLAN, {
      isConnected: true,
      connectionFailed: false,
      getTickerForMarket: () => ({
        tradePrice: 100,
        receivedAt: Date.now(),
      }),
      now: Date.now(),
      formatPrice: String,
    })

    expect(localStorage.getItem(TRADING_TRADES_STORAGE_KEY)).toBe(tradesBefore)
    expect(localStorage.getItem(PAPER_ACCOUNT_STORAGE_KEY)).toBe(paperBefore)
    expect(getTradingTrades()).toHaveLength(1)
  })
})
