import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateManualLedgerFromServer } from './manualPersistence.js'
import { getAssets, saveAssets } from './assetStorage.js'
import { getTrades, saveTrades } from './tradeStorage.js'
import { clearFinanceMemory } from './memoryFinanceStore.js'

describe('hydrateManualLedgerFromServer', () => {
  beforeEach(() => {
    clearFinanceMemory()
  })

  afterEach(() => {
    clearFinanceMemory()
  })

  it('메모리가 비어 있으면 서버 asset/trade를 복원한다', async () => {
    const serverAssets = [{ id: 'sa1', name: '복원자산', symbol: '005930' }]
    const serverTrades = [
      {
        id: 'st1',
        assetId: 'sa1',
        side: 'buy',
        quantity: 2,
        price: 70000,
        tradedAt: '2026-08-01T00:00:00.000Z',
      },
    ]

    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (url === '/api/manual/assets' && !options.method) {
        return {
          ok: true,
          json: async () => ({ ok: true, assets: serverAssets }),
        }
      }
      if (url === '/api/manual/trades' && !options.method) {
        return {
          ok: true,
          json: async () => ({ ok: true, trades: serverTrades }),
        }
      }
      throw new Error(`unexpected ${url} ${options.method}`)
    })

    expect(getAssets()).toEqual([])
    expect(getTrades()).toEqual([])

    const result = await hydrateManualLedgerFromServer(fetchImpl)

    expect(result.ok).toBe(true)
    expect(result.restoredAssets).toBe(1)
    expect(result.restoredTrades).toBe(1)
    expect(getAssets()).toEqual(serverAssets)
    expect(getTrades()[0].id).toBe('st1')
    expect(fetchImpl.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(
      false,
    )
  })

  it('local만 있으면 서버 merge로 1회 업로드한다', async () => {
    saveAssets([{ id: 'la1', name: '로컬자산', symbol: '000660' }])
    saveTrades([
      {
        id: 'lt1',
        assetId: 'la1',
        side: 'buy',
        quantity: 1,
        price: 100,
        tradedAt: '2026-08-02T00:00:00.000Z',
      },
    ])

    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (url === '/api/manual/assets') {
        return { ok: true, json: async () => ({ ok: true, assets: [] }) }
      }
      if (url === '/api/manual/trades') {
        return { ok: true, json: async () => ({ ok: true, trades: [] }) }
      }
      if (url === '/api/manual/merge' && options.method === 'POST') {
        const body = JSON.parse(options.body)
        expect(body.assets).toHaveLength(1)
        expect(body.trades).toHaveLength(1)
        return {
          ok: true,
          json: async () => ({
            ok: true,
            assets: { inserted: 1, skipped: 0 },
            trades: { inserted: 1, skipped: 0 },
          }),
        }
      }
      throw new Error(`unexpected ${url}`)
    })

    const result = await hydrateManualLedgerFromServer(fetchImpl)
    expect(result.ok).toBe(true)
    expect(result.uploadedAssets).toBe(1)
    expect(result.uploadedTrades).toBe(1)
  })

  it('중복 hydrate는 기존 기록을 덮어쓰지 않는다', async () => {
    saveAssets([{ id: 'same', name: '로컬유지' }])
    const serverAssets = [
      { id: 'same', name: '서버덮어쓰기금지' },
      { id: 'extra', name: '서버추가' },
    ]

    let mergeCalls = 0
    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (url === '/api/manual/assets') {
        return { ok: true, json: async () => ({ ok: true, assets: serverAssets }) }
      }
      if (url === '/api/manual/trades') {
        return { ok: true, json: async () => ({ ok: true, trades: [] }) }
      }
      if (url === '/api/manual/merge' && options.method === 'POST') {
        mergeCalls += 1
        return {
          ok: true,
          json: async () => ({
            ok: true,
            assets: { inserted: 0, skipped: 2 },
            trades: { inserted: 0, skipped: 0 },
          }),
        }
      }
      throw new Error(`unexpected ${url}`)
    })

    const first = await hydrateManualLedgerFromServer(fetchImpl)
    expect(first.restoredAssets).toBe(1)
    expect(getAssets().find((a) => a.id === 'same').name).toBe('로컬유지')
    expect(getAssets().some((a) => a.id === 'extra')).toBe(true)

    const second = await hydrateManualLedgerFromServer(fetchImpl)
    expect(second.restoredAssets).toBe(0)
    expect(getAssets().find((a) => a.id === 'same').name).toBe('로컬유지')
    expect(mergeCalls).toBe(0)
  })
})
