import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TRADING_TRADES_STORAGE_KEY,
  addTradingTrade,
  clearTradingTrades,
  deleteTradingTrade,
  getTradingTradeById,
  getTradingTrades,
  normalizeTradingTrade,
  saveTradingTrades,
  updateTradingTrade,
} from './tradingTradeStorage.js'
import {
  buildTradingDeskSummary,
  buildTradingPerformanceStats,
} from '../utils/tradingTradeCalculator.js'

/** @type {Storage} */
let memoryStore

const FIXED_NOW = new Date('2026-08-28T12:00:00.000Z')

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
})

describe('tradingTradeStorage', () => {
  it('거래를 저장하고 조회한다', () => {
    const trade = addTradingTrade({
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 105,
      investedAmount: 1000000,
      entryReason: '테스트',
      review: '복기',
      tags: ['계획매매'],
    })

    const trades = getTradingTrades()
    expect(trades).toHaveLength(1)
    expect(trades[0].id).toBe(trade.id)
    expect(trades[0].symbol).toBe('BTC')
    expect(trades[0].returnRate).toBeCloseTo(5)
    expect(trades[0].profitLoss).toBeCloseTo(50000)
  })

  it('id로 거래를 조회한다', () => {
    const trade = addTradingTrade({
      symbol: 'ETH',
      entryPrice: 10,
      exitPrice: 12,
      investedAmount: 500000,
    })

    expect(getTradingTradeById(trade.id)).toMatchObject({
      id: trade.id,
      symbol: 'ETH',
    })
    expect(getTradingTradeById('missing-id')).toBeNull()
    expect(getTradingTradeById('')).toBeNull()
  })

  it('거래를 수정하고 id·createdAt·tradedAt을 유지한다', () => {
    const trade = addTradingTrade(
      {
        symbol: 'BTC',
        entryPrice: 100,
        exitPrice: 110,
        investedAmount: 1000000,
        entryReason: '초기',
        review: '초기 복기',
        tags: ['계획매매'],
      },
      new Date('2026-08-20T09:00:00.000Z'),
    )

    const updated = updateTradingTrade(
      trade.id,
      {
        symbol: 'ETH',
        entryPrice: 200,
        exitPrice: 220,
        investedAmount: 2000000,
        entryReason: '수정됨',
        review: '수정 복기',
        tags: ['감정매매'],
      },
      FIXED_NOW,
    )

    expect(updated).not.toBeNull()
    expect(updated?.id).toBe(trade.id)
    expect(updated?.createdAt).toBe(trade.createdAt)
    expect(updated?.tradedAt).toBe(trade.tradedAt)
    expect(updated?.updatedAt).toBe(FIXED_NOW.toISOString())
    expect(updated?.symbol).toBe('ETH')
    expect(updated?.entryReason).toBe('수정됨')
    expect(updated?.tags).toEqual(['감정매매'])

    const stored = getTradingTradeById(trade.id)
    expect(stored).toEqual(updated)
  })

  it('수정 후 손익과 수익률을 자동 재계산한다', () => {
    const trade = addTradingTrade({
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 105,
      investedAmount: 1000000,
    })

    const updated = updateTradingTrade(trade.id, {
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 90,
      investedAmount: 1000000,
    })

    expect(updated?.returnRate).toBeCloseTo(-10)
    expect(updated?.profitLoss).toBeCloseTo(-100000)
  })

  it('존재하지 않는 id 수정은 null을 반환한다', () => {
    expect(
      updateTradingTrade('missing-id', {
        symbol: 'BTC',
        entryPrice: 1,
        exitPrice: 2,
        investedAmount: 1000,
      }),
    ).toBeNull()
  })

  it('거래를 삭제한다', () => {
    const trade = addTradingTrade({
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 1000000,
    })

    expect(deleteTradingTrade(trade.id)).toBe(true)
    expect(getTradingTrades()).toEqual([])
    expect(getTradingTradeById(trade.id)).toBeNull()
  })

  it('존재하지 않는 id 삭제는 false를 반환한다', () => {
    addTradingTrade({
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 1000000,
    })

    expect(deleteTradingTrade('missing-id')).toBe(false)
    expect(getTradingTrades()).toHaveLength(1)
  })

  it('삭제 후 상단 요약과 매매 성적이 재계산된다', () => {
    const win = addTradingTrade({
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 1000000,
    })
    addTradingTrade({
      symbol: 'ETH',
      entryPrice: 100,
      exitPrice: 90,
      investedAmount: 500000,
    })

    const beforeSummary = buildTradingDeskSummary(getTradingTrades())
    const beforePerformance = buildTradingPerformanceStats(getTradingTrades())
    expect(beforeSummary.totalTrades).toBe(2)
    expect(beforeSummary.totalProfitLoss).toBeCloseTo(50000)

    deleteTradingTrade(win.id)

    const trades = getTradingTrades()
    const afterSummary = buildTradingDeskSummary(trades)
    const afterPerformance = buildTradingPerformanceStats(trades)

    expect(trades).toHaveLength(1)
    expect(afterSummary.totalTrades).toBe(1)
    expect(afterSummary.totalProfitLoss).toBeCloseTo(-50000)
    expect(afterSummary.winRate).toBe(0)
    expect(beforeSummary.winRate).toBeCloseTo(50)
    expect(afterPerformance.maxLossStreak).toBe(1)
    expect(beforePerformance.winShare).toBeCloseTo(50)
    expect(afterPerformance.winShare).toBe(0)
  })

  it('잘못된 localStorage 값은 무시한다', () => {
    localStorage.setItem(TRADING_TRADES_STORAGE_KEY, 'not-json')
    expect(getTradingTrades()).toEqual([])

    localStorage.setItem(TRADING_TRADES_STORAGE_KEY, JSON.stringify({}))
    expect(getTradingTrades()).toEqual([])

    localStorage.setItem(
      TRADING_TRADES_STORAGE_KEY,
      JSON.stringify([
        { id: 'bad', symbol: '', entryPrice: 1, exitPrice: 2, investedAmount: 3 },
        {
          id: 'ok',
          symbol: 'ETH',
          entryPrice: 10,
          exitPrice: 11,
          investedAmount: 1000,
          returnRate: 10,
          profitLoss: 100,
          tradedAt: '2026-08-28T10:00:00.000Z',
          createdAt: '2026-08-28T10:00:00.000Z',
          tags: [],
        },
      ]),
    )

    expect(getTradingTrades()).toHaveLength(1)
    expect(getTradingTrades()[0].symbol).toBe('ETH')
  })

  it('normalizeTradingTrade는 NaN 항목을 거부한다', () => {
    expect(
      normalizeTradingTrade({
        id: 'x',
        symbol: 'BTC',
        entryPrice: Number.NaN,
        exitPrice: 1,
        investedAmount: 1,
        returnRate: 1,
        profitLoss: 1,
        tradedAt: '2026-08-28T10:00:00.000Z',
      }),
    ).toBeNull()
  })

  it('normalizeTradingTrade는 updatedAt을 선택적으로 보존한다', () => {
    const normalized = normalizeTradingTrade({
      id: 'x',
      symbol: 'BTC',
      entryPrice: 1,
      exitPrice: 2,
      investedAmount: 1000,
      returnRate: 100,
      profitLoss: 1000,
      tradedAt: '2026-08-28T10:00:00.000Z',
      createdAt: '2026-08-28T10:00:00.000Z',
      updatedAt: '2026-08-29T10:00:00.000Z',
      tags: [],
    })

    expect(normalized?.updatedAt).toBe('2026-08-29T10:00:00.000Z')
  })

  it('saveTradingTrades로 전체 목록을 덮어쓴다', () => {
    addTradingTrade({
      symbol: 'BTC',
      entryPrice: 1,
      exitPrice: 2,
      investedAmount: 1000,
    })
    saveTradingTrades([])
    expect(getTradingTrades()).toEqual([])
  })
})
