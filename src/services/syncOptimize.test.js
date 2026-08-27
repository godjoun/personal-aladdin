import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from '../utils/concurrency.js'
import {
  DIVIDEND_INITIAL_FROM,
  formatYmdDaysAgo,
  resolveDividendSyncFrom,
  writeDividendSyncCursor,
} from '../services/dividendSyncCursor.js'
import {
  BRIEFING_CLIENT_CACHE_TTL_MS,
  clearBriefingClientCache,
  fetchStockBriefing,
  peekBriefingCache,
} from '../services/stockBriefingApi.js'
import { DART_CACHE_TTL_MS, DART_INCREMENTAL_LOOKBACK_DAYS } from '../../server/dart/dartProvider.js'
import { STOCK_INFO_CACHE_TTL_MS } from '../../server/kiwoomStockInfo.js'
import { ATTENTION_CONCURRENCY } from '../../server/briefing/stockBriefing.js'

describe('mapWithConcurrency', () => {
  it('제한된 병렬로 실행한다', async () => {
    let active = 0
    let maxActive = 0
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 20))
      active -= 1
      return n * 2
    })
    expect(maxActive).toBeLessThanOrEqual(2)
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(results.map((r) => r.value)).toEqual([2, 4, 6, 8, 10])
  })
})

describe('dividend incremental cursor', () => {
  it('최초는 INITIAL from', () => {
    const storage = {
      store: {},
      getItem(key) {
        return this.store[key] ?? null
      },
      setItem(key, value) {
        this.store[key] = value
      },
    }
    expect(resolveDividendSyncFrom({ storage }).from).toBe(DIVIDEND_INITIAL_FROM)
    expect(resolveDividendSyncFrom({ storage }).mode).toBe('full')
  })

  it('성공 후 overlap 일수만큼 되감아 조회', () => {
    const storage = {
      store: {},
      getItem(key) {
        return this.store[key] ?? null
      },
      setItem(key, value) {
        this.store[key] = value
      },
    }
    writeDividendSyncCursor('2026-08-20', storage)
    const resolved = resolveDividendSyncFrom({
      storage,
      now: new Date('2026-08-27T00:00:00'),
      overlapDays: 3,
    })
    expect(resolved.mode).toBe('incremental')
    expect(resolved.from).toBe(formatYmdDaysAgo(new Date('2026-08-20T00:00:00'), 3))
  })
})

describe('briefing client cache', () => {
  it('cache hit 시 네트워크 재호출 없음', async () => {
    clearBriefingClientCache()
    let calls = 0
    const fetchImpl = async () => {
      calls += 1
      return {
        ok: true,
        async json() {
          return { ok: true, symbol: '365340', cachedProbe: calls }
        },
      }
    }

    const first = await fetchStockBriefing('365340', { fetchImpl })
    const second = await fetchStockBriefing('365340', { fetchImpl })
    expect(calls).toBe(1)
    expect(second.cached).toBe(true)
    expect(peekBriefingCache('365340')?.fresh).toBe(true)
    expect(first.symbol).toBe('365340')
    expect(BRIEFING_CLIENT_CACHE_TTL_MS).toBeGreaterThan(60_000)
  })

  it('실패 시 stale cache 유지', async () => {
    clearBriefingClientCache()
    let calls = 0
    const fetchImpl = async () => {
      calls += 1
      if (calls === 1) {
        return {
          ok: true,
          async json() {
            return { ok: true, symbol: '005930', v: 1 }
          },
        }
      }
      throw new Error('network')
    }

    await fetchStockBriefing('005930', { fetchImpl })
    const stale = await fetchStockBriefing('005930', {
      fetchImpl,
      forceRefresh: true,
    })
    expect(stale.stale).toBe(true)
    expect(stale.v).toBe(1)
  })
})

describe('cache TTL constants', () => {
  it('DART/stock info TTL 과 attention concurrency', () => {
    expect(DART_CACHE_TTL_MS).toBe(20 * 60 * 1000)
    expect(DART_INCREMENTAL_LOOKBACK_DAYS).toBe(14)
    expect(STOCK_INFO_CACHE_TTL_MS).toBe(7 * 60 * 1000)
    expect(ATTENTION_CONCURRENCY).toBeLessThanOrEqual(4)
  })
})
