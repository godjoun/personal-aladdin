import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  migrateLegacyFinanceFromLocalStorage,
  serverContainsAllIds,
} from './financeLocalMigration.js'
import {
  FINANCE_LS_KEYS,
  clearFinanceMemory,
  listRemainingFinanceLocalKeys,
} from './memoryFinanceStore.js'
import { getAssets, saveAssets } from './assetStorage.js'
import { getTrades } from './tradeStorage.js'
import { getDividendEvents, saveDividendEvents } from './dividendStorage.js'

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

describe('serverContainsAllIds', () => {
  it('legacy ID가 서버에 모두 있으면 true', () => {
    expect(
      serverContainsAllIds(
        [{ id: 'a' }, { id: 'b' }],
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      ),
    ).toBe(true)
  })

  it('누락되면 false', () => {
    expect(serverContainsAllIds([{ id: 'a' }], [{ id: 'b' }])).toBe(false)
  })
})

describe('migrateLegacyFinanceFromLocalStorage', () => {
  beforeEach(() => {
    clearFinanceMemory()
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    clearFinanceMemory()
    vi.unstubAllGlobals()
  })

  it('legacy LS asset/trade/dividend를 서버에 merge 후 LS에서 삭제한다', async () => {
    localStorage.setItem(
      FINANCE_LS_KEYS.assets,
      JSON.stringify([{ id: 'la1', name: '구자산', symbol: '005930' }]),
    )
    localStorage.setItem(
      FINANCE_LS_KEYS.trades,
      JSON.stringify([
        {
          id: 'lt1',
          assetId: 'la1',
          side: 'buy',
          quantity: 1,
          price: 10,
          tradedAt: '2026-08-01T00:00:00.000Z',
        },
      ]),
    )
    localStorage.setItem(
      FINANCE_LS_KEYS.dividends,
      JSON.stringify([
        {
          id: 'ld1',
          sourceKey: 'ld1',
          status: 'PAID',
          paymentDate: '2026-08-04',
          confirmedAmount: 100,
          fundName: 'ETF',
        },
      ]),
    )

    let serverAssets = []
    let serverTrades = []
    let serverDividends = []
    let migrated = false

    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (url === '/api/manual/assets' && !options.method) {
        return { ok: true, json: async () => ({ ok: true, assets: serverAssets }) }
      }
      if (url === '/api/manual/trades' && !options.method) {
        return { ok: true, json: async () => ({ ok: true, trades: serverTrades }) }
      }
      if (url === '/api/manual/merge' && options.method === 'POST') {
        const body = JSON.parse(options.body)
        serverAssets = body.assets
        serverTrades = body.trades
        return {
          ok: true,
          json: async () => ({
            ok: true,
            assets: { inserted: body.assets.length },
            trades: { inserted: body.trades.length },
          }),
        }
      }
      if (url === '/api/dividends' && !options.method) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            events: serverDividends,
            migrated,
          }),
        }
      }
      if (url === '/api/dividends/migrate-local' && options.method === 'POST') {
        const body = JSON.parse(options.body)
        serverDividends = body.events
        migrated = true
        return {
          ok: true,
          json: async () => ({
            ok: true,
            migrated: true,
            events: serverDividends,
          }),
        }
      }
      if (url === '/api/dividends' && options.method === 'POST') {
        const body = JSON.parse(options.body)
        serverDividends = body.events
        return {
          ok: true,
          json: async () => ({ ok: true, events: serverDividends }),
        }
      }
      throw new Error(`unexpected ${url} ${options.method}`)
    })

    const result = await migrateLegacyFinanceFromLocalStorage(fetchImpl)
    expect(result.ok).toBe(true)
    expect(getAssets()[0].id).toBe('la1')
    expect(getTrades()[0].id).toBe('lt1')
    expect(getDividendEvents()[0].id).toBe('ld1')
    expect(localStorage.getItem(FINANCE_LS_KEYS.assets)).toBeNull()
    expect(localStorage.getItem(FINANCE_LS_KEYS.trades)).toBeNull()
    expect(localStorage.getItem(FINANCE_LS_KEYS.dividends)).toBeNull()
    expect(listRemainingFinanceLocalKeys()).toEqual([])
  })

  it('migration 실패 시 localStorage 원본을 유지한다', async () => {
    localStorage.setItem(
      FINANCE_LS_KEYS.assets,
      JSON.stringify([{ id: 'keep-me', name: '보존' }]),
    )

    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })

    const result = await migrateLegacyFinanceFromLocalStorage(fetchImpl)
    expect(result.ok).toBe(false)
    expect(localStorage.getItem(FINANCE_LS_KEYS.assets)).not.toBeNull()
    expect(getAssets()[0].id).toBe('keep-me')
  })

  it('금융 데이터는 saveAssets 후에도 localStorage에 쓰지 않는다', () => {
    saveAssets([{ id: 'mem1', name: '메모리만' }])
    saveDividendEvents([
      {
        id: 'd1',
        status: 'PAID',
        paymentDate: '2026-08-04',
        confirmedAmount: 1,
      },
    ])
    expect(localStorage.getItem(FINANCE_LS_KEYS.assets)).toBeNull()
    expect(localStorage.getItem(FINANCE_LS_KEYS.dividends)).toBeNull()
    expect(getAssets()).toHaveLength(1)
    expect(getDividendEvents()).toHaveLength(1)
  })
})
