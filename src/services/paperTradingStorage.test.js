import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PAPER_ACCOUNT_STORAGE_KEY,
  PAPER_TRADES_STORAGE_KEY,
  clearPaperTrading,
  createPaperAccount,
  executePaperBuy,
  executePaperSell,
  getPaperAccount,
  getPaperTrades,
  normalizePaperAccount,
  normalizePaperTrade,
  resetPaperTrading,
} from './paperTradingStorage.js'
import {
  TRADING_TRADES_STORAGE_KEY,
  addTradingTrade,
  clearTradingTrades,
  getTradingTrades,
} from './tradingTradeStorage.js'

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
  clearPaperTrading()
  clearTradingTrades()
})

afterEach(() => {
  clearPaperTrading()
  clearTradingTrades()
})

describe('paperTradingStorage', () => {
  it('PAPER 계좌를 생성하고 초기 현금을 설정한다', () => {
    const account = createPaperAccount(1000000, FIXED_NOW)

    expect(account.initialCapital).toBe(1000000)
    expect(account.cash).toBe(1000000)
    expect(account.position).toBeNull()
    expect(account.realizedProfitLoss).toBe(0)
    expect(account.createdAt).toBe(FIXED_NOW.toISOString())
    expect(getPaperAccount()).toEqual(account)
  })

  it('정상 매수 후 현금이 차감되고 포지션이 생성된다', () => {
    createPaperAccount(1000000, FIXED_NOW)

    const result = executePaperBuy(
      {
        symbol: 'BTC',
        entryPrice: 100000000,
        investedAmount: 200000,
      },
      FIXED_NOW,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.account.cash).toBeCloseTo(800000)
    expect(result.account.position).toMatchObject({
      symbol: 'BTC',
      entryPrice: 100000000,
      investedAmount: 200000,
      quantity: 0.002,
    })
  })

  it('현금보다 큰 금액 매수를 차단한다', () => {
    createPaperAccount(1000000, FIXED_NOW)

    const result = executePaperBuy({
      symbol: 'BTC',
      entryPrice: 100,
      investedAmount: 1500000,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('VALIDATION')
    expect(result.errors?.investedAmount).toBeTruthy()
    expect(getPaperAccount()?.cash).toBe(1000000)
    expect(getPaperAccount()?.position).toBeNull()
  })

  it('포지션 보유 중 추가 매수를 차단한다', () => {
    createPaperAccount(1000000, FIXED_NOW)
    executePaperBuy({
      symbol: 'BTC',
      entryPrice: 100,
      investedAmount: 200000,
    })

    const result = executePaperBuy({
      symbol: 'ETH',
      entryPrice: 50,
      investedAmount: 100000,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('HAS_POSITION')
    expect(getPaperAccount()?.position?.symbol).toBe('BTC')
  })

  it('정상 매도 후 현금 복구·실현 손익 누적·거래 저장', () => {
    createPaperAccount(1000000, FIXED_NOW)
    executePaperBuy({
      symbol: 'BTC',
      entryPrice: 100,
      investedAmount: 200000,
    })

    const sellResult = executePaperSell({ exitPrice: 110 }, FIXED_NOW)
    expect(sellResult.ok).toBe(true)
    if (!sellResult.ok) return

    expect(sellResult.account.cash).toBeCloseTo(1020000)
    expect(sellResult.account.position).toBeNull()
    expect(sellResult.account.realizedProfitLoss).toBeCloseTo(20000)
    expect(sellResult.trade).toMatchObject({
      mode: 'PAPER',
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 110,
      returnRate: 10,
      profitLoss: 20000,
    })

    const trades = getPaperTrades()
    expect(trades).toHaveLength(1)
    expect(trades[0].mode).toBe('PAPER')
  })

  it('손실 매도 후 실현 손익이 누적된다', () => {
    createPaperAccount(1000000, FIXED_NOW)
    executePaperBuy({
      symbol: 'BTC',
      entryPrice: 100,
      investedAmount: 200000,
    })

    const sellResult = executePaperSell({ exitPrice: 90 })
    expect(sellResult.ok).toBe(true)
    if (!sellResult.ok) return

    expect(sellResult.account.realizedProfitLoss).toBeCloseTo(-20000)
    expect(sellResult.trade.profitLoss).toBeCloseTo(-20000)
    expect(sellResult.trade.returnRate).toBeCloseTo(-10)
  })

  it('포지션 없이 매도하면 NO_POSITION', () => {
    createPaperAccount(1000000, FIXED_NOW)
    const result = executePaperSell({ exitPrice: 100 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('NO_POSITION')
  })

  it('계좌 초기화 시 account·paperTrades가 삭제된다', () => {
    createPaperAccount(1000000, FIXED_NOW)
    executePaperBuy({ symbol: 'BTC', entryPrice: 100, investedAmount: 100000 })
    executePaperSell({ exitPrice: 110 })

    resetPaperTrading()

    expect(getPaperAccount()).toBeNull()
    expect(getPaperTrades()).toEqual([])
    expect(localStorage.getItem(PAPER_ACCOUNT_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(PAPER_TRADES_STORAGE_KEY)).toBeNull()
  })

  it('손상된 localStorage 값은 무시한다', () => {
    localStorage.setItem(PAPER_ACCOUNT_STORAGE_KEY, 'not-json')
    expect(getPaperAccount()).toBeNull()

    localStorage.setItem(PAPER_TRADES_STORAGE_KEY, JSON.stringify({}))
    expect(getPaperTrades()).toEqual([])

    localStorage.setItem(
      PAPER_ACCOUNT_STORAGE_KEY,
      JSON.stringify({
        initialCapital: 1000000,
        cash: 1000000,
        position: { symbol: 'BTC', entryPrice: -1, investedAmount: 1, quantity: 1, openedAt: 'x' },
        realizedProfitLoss: 0,
        createdAt: '2026-08-28T10:00:00.000Z',
        updatedAt: '2026-08-28T10:00:00.000Z',
      }),
    )
    expect(getPaperAccount()).toBeNull()
  })

  it('normalizePaperTrade는 잘못된 mode를 거부한다', () => {
    expect(
      normalizePaperTrade({
        id: 'x',
        mode: 'REAL',
        symbol: 'BTC',
        entryPrice: 1,
        exitPrice: 2,
        investedAmount: 100,
        quantity: 100,
        returnRate: 100,
        profitLoss: 100,
        openedAt: '2026-08-28T10:00:00.000Z',
        closedAt: '2026-08-28T11:00:00.000Z',
      }),
    ).toBeNull()
  })

  it('normalizePaperAccount는 position null을 허용한다', () => {
    const account = normalizePaperAccount({
      initialCapital: 1000000,
      cash: 1000000,
      position: null,
      realizedProfitLoss: 0,
      createdAt: '2026-08-28T10:00:00.000Z',
      updatedAt: '2026-08-28T10:00:00.000Z',
    })
    expect(account?.position).toBeNull()
  })

  it('PAPER 작업이 실제 tradingTrades 데이터에 영향을 주지 않는다', () => {
    const realTrade = addTradingTrade({
      symbol: 'BTC',
      entryPrice: 100,
      exitPrice: 110,
      investedAmount: 1000000,
    })

    createPaperAccount(1000000, FIXED_NOW)
    executePaperBuy({ symbol: 'ETH', entryPrice: 50, investedAmount: 100000 })
    executePaperSell({ exitPrice: 60 })
    resetPaperTrading()

    const trades = getTradingTrades()
    expect(trades).toHaveLength(1)
    expect(trades[0].id).toBe(realTrade.id)
    expect(trades[0].symbol).toBe('BTC')
    expect(localStorage.getItem(TRADING_TRADES_STORAGE_KEY)).toBeTruthy()
  })
})
