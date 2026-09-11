/**
 * tradeFlowCollector.test.js — mock WebSocket publicTrade collector
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  createTradeFlowCollector,
  resetTradeFlowCollector,
} from './tradeFlowCollector.js'
import { BYBIT_PUBLIC_LINEAR_WS } from './liquidationCollector.js'

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

function publicTradeMessage(rows, symbol = 'BTCUSDT') {
  return {
    topic: `publicTrade.${symbol}`,
    type: 'snapshot',
    data: rows,
  }
}

afterEach(() => {
  resetTradeFlowCollector()
  MockWebSocket.instances = []
})

describe('trade flow collector', () => {
  it('connect 후 publicTrade topic 을 구독한다', () => {
    const collector = createTradeFlowCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      persistBuckets: () => {},
    })
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe(BYBIT_PUBLIC_LINEAR_WS)
    MockWebSocket.instances[0].open()
    const subscribe = MockWebSocket.instances[0].sent
      .map((item) => JSON.parse(item))
      .find((item) => item.op === 'subscribe')
    expect(subscribe.args).toEqual([
      'publicTrade.BTCUSDT',
      'publicTrade.ETHUSDT',
    ])
    expect(collector.getStatus().connected).toBe(true)
    expect(collector.getStatus().subscribedSymbols).toEqual(['BTCUSDT', 'ETHUSDT'])
    expect(collector.getStatus().reconnectCount).toBe(0)
  })

  it('Buy/Sell 체결을 1분 bucket 으로 집계한다', () => {
    const saved = []
    createTradeFlowCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      flushIntervalMs: 0,
      persistBuckets: (buckets) => {
        saved.splice(0, saved.length, ...buckets.map((item) => ({ ...item })))
      },
    })
    MockWebSocket.instances[0].open()
    MockWebSocket.instances[0].pushJson(
      publicTradeMessage([
        {
          T: 1_700_000_010_000,
          s: 'BTCUSDT',
          S: 'Buy',
          v: '0.2',
          p: '100',
          i: 'buy-1',
          seq: 1,
        },
        {
          T: 1_700_000_010_100,
          s: 'BTCUSDT',
          S: 'Sell',
          v: '0.1',
          p: '100',
          i: 'sell-1',
          seq: 1,
        },
      ]),
    )
    expect(saved).toHaveLength(1)
    expect(saved[0].buyVolume).toBeCloseTo(0.2)
    expect(saved[0].sellVolume).toBeCloseTo(0.1)
    expect(saved[0].buyNotional).toBeCloseTo(20)
    expect(saved[0].sellNotional).toBeCloseTo(10)
    expect(saved[0].tradeCount).toBe(2)
    expect(saved[0].intervalSeconds).toBe(60)
  })

  it('같은 seq 의 다른 trade id 는 모두 집계하고 duplicate id 는 무시한다', () => {
    const saved = []
    createTradeFlowCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      flushIntervalMs: 0,
      persistBuckets: (buckets) => {
        saved.splice(0, saved.length, ...buckets.map((item) => ({ ...item })))
      },
    })
    MockWebSocket.instances[0].open()
    const payload = publicTradeMessage([
      {
        T: 1_700_000_010_000,
        s: 'BTCUSDT',
        S: 'Buy',
        v: '1',
        p: '10',
        i: 'same-id',
        seq: 7,
      },
      {
        T: 1_700_000_010_000,
        s: 'BTCUSDT',
        S: 'Buy',
        v: '1',
        p: '10',
        i: 'other-id',
        seq: 7,
      },
    ])
    MockWebSocket.instances[0].pushJson(payload)
    MockWebSocket.instances[0].pushJson(payload)
    expect(saved[0].tradeCount).toBe(2)
    expect(saved[0].buyVolume).toBe(2)
  })

  it('malformed / invalid symbol 은 persist 하지 않는다', () => {
    const saved = []
    const collector = createTradeFlowCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      flushIntervalMs: 0,
      persistBuckets: (buckets) => saved.push(...buckets),
    })
    MockWebSocket.instances[0].open()
    collector.handleMessage('{not-json')
    MockWebSocket.instances[0].pushJson(
      publicTradeMessage([{ T: 1, s: 'SOLUSDT', S: 'Buy', v: '1', p: '1', i: 'x' }]),
    )
    MockWebSocket.instances[0].pushJson(
      publicTradeMessage([
        {
          T: 1_700_000_000_000,
          s: 'BTCUSDT',
          S: 'Buy',
          v: 'bad',
          p: '77000',
          i: 'y',
        },
      ]),
    )
    expect(saved).toHaveLength(0)
  })

  it('이미 연결 중이면 새 소켓을 열지 않는다', () => {
    const collector = createTradeFlowCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      persistBuckets: () => {},
    })
    expect(MockWebSocket.instances).toHaveLength(1)
    collector._connect()
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('reconnect 후 재구독하고 trade-id cache 는 유지한다', () => {
    const timers = []
    const saved = []
    const collector = createTradeFlowCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      persistBuckets: (buckets) => {
        saved.splice(0, saved.length, ...buckets.map((item) => ({ ...item })))
      },
      flushIntervalMs: 0,
      schedule: (fn) => {
        timers.push(fn)
        return fn
      },
      clearTimer: () => {},
    })
    MockWebSocket.instances[0].open()
    MockWebSocket.instances[0].pushJson(
      publicTradeMessage([
        {
          T: 1_700_000_000_000,
          s: 'BTCUSDT',
          S: 'Buy',
          v: '1',
          p: '10',
          i: 'keep-me',
        },
      ]),
    )
    MockWebSocket.instances[0].close()
    const reconnect = timers.at(-1)
    reconnect()
    expect(MockWebSocket.instances).toHaveLength(2)
    MockWebSocket.instances[1].open()
    const subscribe = MockWebSocket.instances[1].sent
      .map((item) => JSON.parse(item))
      .find((item) => item.op === 'subscribe')
    expect(subscribe.args).toContain('publicTrade.ETHUSDT')
    expect(collector.getStatus().reconnectCount).toBe(1)
    MockWebSocket.instances[1].pushJson(
      publicTradeMessage([
        {
          T: 1_700_000_000_000,
          s: 'BTCUSDT',
          S: 'Buy',
          v: '1',
          p: '10',
          i: 'keep-me',
        },
      ]),
    )
    expect(saved[0].tradeCount).toBe(1)
  })

  it('heartbeat ping 을 보내고 생성 실패는 재연결만 예약한다', () => {
    const timers = []
    createTradeFlowCollector({
      WebSocketImpl: MockWebSocket,
      autoConnect: true,
      persistBuckets: () => {},
      flushIntervalMs: 0,
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
    expect(ping).toEqual({ op: 'ping', req_id: 'cvd-heartbeat' })

    class BoomSocket {
      constructor() {
        throw new Error('no network')
      }
    }
    expect(() =>
      createTradeFlowCollector({
        WebSocketImpl: BoomSocket,
        autoConnect: true,
        persistBuckets: () => {},
        schedule: (fn) => {
          timers.push(fn)
          return fn
        },
        clearTimer: () => {},
      }),
    ).not.toThrow()
  })
})
