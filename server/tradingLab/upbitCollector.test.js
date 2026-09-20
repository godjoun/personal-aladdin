import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb } from '../db.js'
import { createUpbitCollector, UPBIT_PRIVATE_WS_URL } from './upbitCollector.js'
import { listUpbitExecutions } from './upbitRepository.js'

class MockWebSocket extends EventEmitter {
  static instances = []
  constructor(url, options) {
    super()
    this.url = url
    this.options = options
    this.sent = []
    this.pings = 0
    MockWebSocket.instances.push(this)
  }
  send(value) { this.sent.push(value) }
  ping() { this.pings += 1 }
  close() {}
}

function tempDb() {
  closeDb()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-upbit-ws-'))
  return getDb({ dbPath: path.join(dir, 'test.sqlite') })
}

function tradeMessage() {
  return {
    type: 'myOrder', code: 'KRW-BTC', uuid: 'order-1', ask_bid: 'BID',
    order_type: 'limit', state: 'trade', trade_uuid: 'trade-1', price: 100,
    volume: 1, remaining_volume: 0, executed_volume: 1, trades_count: 1,
    trade_fee: 0.1, executed_funds: 100, is_maker: false,
    trade_timestamp: 1_700_000_000_000, order_timestamp: 1_699_999_999_000,
    timestamp: 1_700_000_000_100,
  }
}

afterEach(() => {
  closeDb()
  MockWebSocket.instances = []
})

describe('Upbit MyOrder collector', () => {
  it('Authorization header로 연결하고 전체 myOrder를 구독한다', async () => {
    const db = tempDb()
    const reconcile = vi.fn(async () => {})
    const collector = createUpbitCollector({
      accessKey: 'access', secretKey: 'secret', WebSocketImpl: MockWebSocket,
      db, reconcile, schedule: () => 1, clearTimer: () => {},
    })
    collector.start()
    const socket = MockWebSocket.instances[0]
    expect(socket.url).toBe(UPBIT_PRIVATE_WS_URL)
    expect(socket.options.headers.Authorization).toMatch(/^Bearer /)
    expect(socket.options.headers.Authorization).not.toContain('secret')
    socket.emit('open')
    const subscription = JSON.parse(socket.sent[0])
    expect(subscription[1]).toEqual({ type: 'myOrder' })
    expect(subscription[1].codes).toBeUndefined()
    expect(subscription[2]).toEqual({ format: 'DEFAULT' })
    await Promise.resolve()
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it('WebSocket trade를 즉시 idempotent upsert한다', async () => {
    const db = tempDb()
    const collector = createUpbitCollector({
      accessKey: 'a', secretKey: 's', WebSocketImpl: MockWebSocket, db,
      schedule: () => 1, clearTimer: () => {},
    })
    await collector.handlePayload(tradeMessage())
    await collector.handlePayload(tradeMessage())
    expect(listUpbitExecutions(db)).toHaveLength(1)
    expect(collector.getStatus().lastExecutionAt).toBe('2023-11-14T22:13:20.000Z')
  })

  it('disconnect 후 backoff reconnect하고 성공 시 reconciliation한다', async () => {
    const db = tempDb()
    const timers = []
    const reconcile = vi.fn(async () => {})
    const collector = createUpbitCollector({
      accessKey: 'a', secretKey: 's', WebSocketImpl: MockWebSocket, db, reconcile,
      schedule: (fn, ms) => { timers.push({ fn, ms }); return fn },
      clearTimer: () => {},
    })
    collector.start()
    MockWebSocket.instances[0].emit('open')
    MockWebSocket.instances[0].emit('close')
    const reconnect = timers.find((entry) => entry.ms === 1000)
    expect(reconnect).toBeTruthy()
    reconnect.fn()
    expect(MockWebSocket.instances).toHaveLength(2)
    MockWebSocket.instances[1].emit('open')
    await Promise.resolve()
    expect(reconcile).toHaveBeenCalledTimes(2)
    expect(collector.getStatus().reconnectCount).toBe(1)

    MockWebSocket.instances[1].emit('close')
    expect(timers.filter((entry) => entry.ms === 1000)).toHaveLength(2)
  })

  it('status error에는 credential 값을 노출하지 않는다', () => {
    const db = tempDb()
    const collector = createUpbitCollector({
      accessKey: 'private-access', secretKey: 'private-secret',
      WebSocketImpl: MockWebSocket, db,
      schedule: () => 1, clearTimer: () => {},
    })
    collector.start()
    MockWebSocket.instances[0].emit('error', {
      code: 'private-access',
      message: 'failed private-secret',
    })
    expect(JSON.stringify(collector.getStatus())).not.toMatch(/private-access|private-secret/)
    expect(collector.getStatus().lastError.message).toContain('[REDACTED]')
  })
})
