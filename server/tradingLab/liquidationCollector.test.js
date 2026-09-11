/**
 * liquidationCollector.test.js — mock WebSocket transport
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  createLiquidationCollector,
  resetLiquidationCollector,
} from './liquidationCollector.js'

class MockWebSocket {
  static instances = []
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    this.listeners = { open: [], message: [], close: [], error: [] }
    MockWebSocket.instances.push(this)
  }
  addEventListener(type, fn) {
    this.listeners[type].push(fn)
  }
  send(data) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
    this.emit('close', { code: 1000 })
  }
  open() {
    this.readyState = 1
    this.emit('open', {})
  }
  emit(type, event) {
    for (const fn of this.listeners[type] || []) fn(event)
  }
  pushJson(payload) {
    this.emit('message', { data: JSON.stringify(payload) })
  }
}

afterEach(() => {
  resetLiquidationCollector()
  MockWebSocket.instances = []
})

describe('liquidation collector', () => {
  it('connect 후 allLiquidation topic 을 구독한다', () => {
    const collector = createLiquidationCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
    })
    expect(MockWebSocket.instances).toHaveLength(1)
    MockWebSocket.instances[0].open()
    const subscribe = MockWebSocket.instances[0].sent
      .map((item) => JSON.parse(item))
      .find((item) => item.op === 'subscribe')
    expect(subscribe.args).toEqual([
      'allLiquidation.BTCUSDT',
      'allLiquidation.ETHUSDT',
    ])
    expect(collector.getStatus().connected).toBe(true)
    expect(collector.getStatus().reconnectCount).toBe(0)
    expect(collector.getStatus().subscribedSymbols).toEqual(['BTCUSDT', 'ETHUSDT'])
  })

  it('BTC LONG / SHORT 이벤트를 persist 한다', () => {
    const saved = []
    createLiquidationCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      persist: (event) => {
        saved.push(event)
        return { inserted: true }
      },
    })
    MockWebSocket.instances[0].open()
    MockWebSocket.instances[0].pushJson({
      topic: 'allLiquidation.BTCUSDT',
      type: 'snapshot',
      data: [
        { T: 1700000000000, s: 'BTCUSDT', S: 'Buy', v: '0.2', p: '77000' },
        { T: 1700000000001, s: 'BTCUSDT', S: 'Sell', v: '0.3', p: '77100' },
      ],
    })
    expect(saved).toHaveLength(2)
    expect(saved[0].liquidatedSide).toBe('LONG')
    expect(saved[1].liquidatedSide).toBe('SHORT')
  })

  it('malformed / invalid 이벤트는 persist 하지 않는다', () => {
    const saved = []
    const collector = createLiquidationCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      persist: (event) => {
        saved.push(event)
        return { inserted: true }
      },
    })
    MockWebSocket.instances[0].open()
    collector.handleMessage('{not-json')
    MockWebSocket.instances[0].pushJson({
      topic: 'allLiquidation.BTCUSDT',
      data: [{ T: 1, s: 'SOLUSDT', S: 'Buy', v: '1', p: '1' }],
    })
    MockWebSocket.instances[0].pushJson({
      topic: 'allLiquidation.BTCUSDT',
      data: [{ T: 1700000000000, s: 'BTCUSDT', S: 'Buy', v: 'bad', p: '77000' }],
    })
    expect(saved).toHaveLength(0)
  })

  it('이미 연결 중이면 새 소켓을 열지 않는다', () => {
    const collector = createLiquidationCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
    })
    expect(MockWebSocket.instances).toHaveLength(1)
    collector.start()
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('reconnect 후 재구독한다', () => {
    const timers = []
    const collector = createLiquidationCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      schedule: (fn) => {
        timers.push(fn)
        return fn
      },
      clearTimer: () => {},
    })
    MockWebSocket.instances[0].open()
    MockWebSocket.instances[0].close()
    expect(MockWebSocket.instances[0].url).toBe(
      'wss://stream.bybit.com/v5/public/linear',
    )
    const reconnect = timers.at(-1)
    reconnect()
    expect(MockWebSocket.instances).toHaveLength(2)
    MockWebSocket.instances[1].open()
    const subscribe = MockWebSocket.instances[1].sent
      .map((item) => JSON.parse(item))
      .find((item) => item.op === 'subscribe')
    expect(subscribe.args).toContain('allLiquidation.ETHUSDT')
    expect(collector.getStatus().reconnectCount).toBe(1)
  })

  it('heartbeat ping 을 보내고 생성 실패는 재연결만 예약한다', () => {
    const timers = []
    createLiquidationCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      pingIntervalMs: 20,
      schedule: (fn) => {
        timers.push(fn)
        return fn
      },
      clearTimer: () => {},
    })
    MockWebSocket.instances[0].open()
    timers[0]()
    const ping = MockWebSocket.instances[0].sent
      .map((item) => JSON.parse(item))
      .find((item) => item.op === 'ping')
    expect(ping).toEqual({ op: 'ping', req_id: 'liq-heartbeat' })

    class BoomSocket {
      constructor() {
        throw new Error('no network')
      }
    }
    expect(() =>
      createLiquidationCollector({
        WebSocketImpl: BoomSocket,
        autoConnect: true,
        schedule: (fn) => {
          timers.push(fn)
          return fn
        },
        clearTimer: () => {},
      }),
    ).not.toThrow()
  })

  it('persist 예외가 나도 collector/server 가 죽지 않는다', () => {
    const collector = createLiquidationCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      persist: () => {
        throw new Error('db down')
      },
    })
    MockWebSocket.instances[0].open()
    expect(() => {
      MockWebSocket.instances[0].pushJson({
        topic: 'allLiquidation.BTCUSDT',
        data: [{ T: 1700000000000, s: 'BTCUSDT', S: 'Buy', v: '1', p: '77000' }],
      })
    }).not.toThrow()
    expect(collector.getStatus().connected).toBe(true)
  })

  it('같은 이벤트를 두 번 보내도 persist 는 호출되지만 저장 계층에서 중복을 막는다', () => {
    const keys = []
    createLiquidationCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      persist: (event) => {
        const duplicate = keys.includes(event.sourceKey)
        keys.push(event.sourceKey)
        return { inserted: !duplicate }
      },
    })
    MockWebSocket.instances[0].open()
    const payload = {
      topic: 'allLiquidation.BTCUSDT',
      data: [{ T: 1700000000000, s: 'BTCUSDT', S: 'Buy', v: '1', p: '77000' }],
    }
    MockWebSocket.instances[0].pushJson(payload)
    MockWebSocket.instances[0].pushJson(payload)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })
})
