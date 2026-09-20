import { describe, expect, it } from 'vitest'
import {
  extractUpbitOrderExecutions,
  hasExecutedUpbitVolume,
  normalizeUpbitExecution,
  normalizeUpbitOrder,
} from './upbitNormalize.js'

describe('Upbit payload normalize', () => {
  it('done order와 partial fills를 정규화한다', () => {
    const raw = {
      uuid: 'o1', market: 'KRW-BTC', side: 'bid', ord_type: 'limit', state: 'done',
      price: '100', volume: '2', remaining_volume: '0', executed_volume: '2',
      paid_fee: '0.2', trades_count: 2, created_at: '2026-09-20T00:00:00Z',
      trades: [
        { uuid: 't1', price: '100', volume: '1', funds: '100', fee: '0.1', created_at: '2026-09-20T00:01:00Z' },
        { uuid: 't2', price: '101', volume: '1', funds: '101', fee: '0.1', created_at: '2026-09-20T00:02:00Z' },
      ],
    }
    const order = normalizeUpbitOrder(raw)
    expect(order.state).toBe('done')
    expect(order.executedVolume).toBe(2)
    expect(extractUpbitOrderExecutions(raw, order).map((row) => row.tradeUuid)).toEqual(['t1', 't2'])
  })

  it('cancel도 executed_volume > 0이면 체결로 취급한다', () => {
    expect(hasExecutedUpbitVolume(normalizeUpbitOrder({ uuid: 'o1', market: 'KRW-BTC', state: 'cancel', executed_volume: '0.1' }))).toBe(true)
    expect(hasExecutedUpbitVolume(normalizeUpbitOrder({ uuid: 'o2', market: 'KRW-BTC', state: 'cancel', executed_volume: '0' }))).toBe(false)
  })

  it('WebSocket trade_uuid를 execution id로 우선한다', () => {
    const execution = normalizeUpbitExecution({
      uuid: 'order-1', trade_uuid: 'trade-1', code: 'KRW-ETH', ask_bid: 'ASK',
      price: 100, volume: 2, trade_fee: 0.1, trade_timestamp: 1_700_000_000_000,
    }, { orderUuid: 'order-1' })
    expect(execution.tradeUuid).toBe('trade-1')
    expect(execution.side).toBe('ASK')
  })
})
