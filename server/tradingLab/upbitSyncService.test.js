import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb } from '../db.js'
import {
  listUpbitExecutions,
  listUpbitEpisodes,
  upsertUpbitExecution,
  upsertUpbitOrder,
} from './upbitRepository.js'
import { fetchWindowSafely, reconcileUpbitOrders } from './upbitSyncService.js'

function tempDb() {
  closeDb()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-upbit-'))
  return { db: getDb({ dbPath: path.join(dir, 'test.sqlite') }), dir }
}

function order(uuid = 'o1', overrides = {}) {
  return {
    uuid, market: 'KRW-BTC', side: 'bid', ord_type: 'limit', state: 'done',
    price: '100', volume: '1', remaining_volume: '0', executed_volume: '1',
    paid_fee: '1', trades_count: 1, created_at: '2026-09-20T00:00:00Z',
    trades: [{ uuid: `t-${uuid}`, price: '100', volume: '1', funds: '100', fee: '1', created_at: '2026-09-20T00:01:00Z' }],
    ...overrides,
  }
}

afterEach(() => closeDb())

describe('Upbit reconciliation', () => {
  it('REST 반복 sync와 같은 execution은 idempotent하고 restart 후 유지된다', async () => {
    const { db, dir } = tempDb()
    const dbPath = path.join(dir, 'test.sqlite')
    const client = {
      listClosedOrders: vi.fn(async () => [order()]),
      getOrder: vi.fn(async () => order()),
    }
    await reconcileUpbitOrders({ client, db, startMs: 0, endMs: 1000, nowMs: 1000 })
    await reconcileUpbitOrders({ client, db, startMs: 0, endMs: 1000, nowMs: 2000 })
    expect(listUpbitExecutions(db)).toHaveLength(1)
    expect(listUpbitEpisodes({}, db)).toHaveLength(1)
    closeDb()
    const reopened = getDb({ dbPath })
    expect(listUpbitExecutions(reopened)).toHaveLength(1)
    expect(listUpbitEpisodes({}, reopened)).toHaveLength(1)
  })

  it('WebSocket에서 먼저 저장한 execution을 REST 보정이 다시 받아도 한 건만 유지한다', async () => {
    const { db } = tempDb()
    upsertUpbitOrder({
      uuid: 'o1', market: 'KRW-BTC', side: 'BID', orderType: 'limit', state: 'trade',
      orderPrice: 100, volume: 1, remainingVolume: 0, executedVolume: 1,
      executedFunds: 100, paidFee: 1, tradesCount: 1,
      orderedAt: '2026-09-20T00:00:00.000Z', lastEventAt: '2026-09-20T00:01:00.000Z',
      updatedAt: '2026-09-20T00:01:00.000Z',
    }, db)
    upsertUpbitExecution({
      tradeUuid: 't-o1', orderUuid: 'o1', market: 'KRW-BTC', side: 'BID',
      price: 100, volume: 1, funds: 100, fee: 1, isMaker: 0,
      tradedAt: '2026-09-20T00:01:00.000Z', createdAt: '2026-09-20T00:01:00.000Z',
    }, db)
    const detail = order()
    await reconcileUpbitOrders({
      client: { listClosedOrders: async () => [detail], getOrder: async () => detail },
      db, startMs: 0, endMs: 1000, nowMs: 1000,
    })
    expect(listUpbitExecutions(db)).toHaveLength(1)
    expect(db.prepare('SELECT COUNT(*) n FROM upbit_order').get().n).toBe(1)
  })

  it('trades가 없어도 order aggregate 저장은 안전하고 cancel 0 fill은 execution이 없다', async () => {
    const { db } = tempDb()
    const detail = order('cancel-0', { state: 'cancel', executed_volume: '0', trades: undefined })
    await reconcileUpbitOrders({
      client: { listClosedOrders: async () => [detail], getOrder: async () => detail },
      db, startMs: 0, endMs: 1000, nowMs: 1000,
    })
    expect(db.prepare('SELECT COUNT(*) n FROM upbit_order').get().n).toBe(1)
    expect(listUpbitExecutions(db)).toHaveLength(0)
  })

  it('1000건 window는 더 작은 구간으로 나눠 다시 조회한다', async () => {
    const saturated = Array.from({ length: 1000 }, (_, index) => ({ uuid: `o${index}` }))
    const client = { listClosedOrders: vi.fn(async ({ startMs, endMs }) => endMs - startMs > 60_000 ? saturated : [{ uuid: `${startMs}` }]) }
    const rows = await fetchWindowSafely(client, { startMs: 0, endMs: 120_000 })
    expect(client.listClosedOrders).toHaveBeenCalledTimes(3)
    expect(rows).toHaveLength(2)
  })
})
