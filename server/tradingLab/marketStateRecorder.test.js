import { afterEach, describe, expect, it } from 'vitest'
import {
  createMarketStateRecorder,
  msUntilNextBucket,
  resetMarketStateRecorder,
} from './marketStateRecorder.js'

afterEach(() => {
  resetMarketStateRecorder()
})

describe('market state recorder', () => {
  it('시작 시 BTC/ETH 를 한 번씩 평가한다', async () => {
    const symbols = []
    const recorder = createMarketStateRecorder({
      autoStart: false,
      intervalMs: 300_000,
      now: () => Date.parse('2026-09-12T02:35:10.000Z'),
      schedule: () => 1,
      clearTimer: () => {},
      evaluate: async ({ symbols: list }) => {
        symbols.push(...list)
        return list.map((symbol) => ({ symbol, persisted: true }))
      },
    })
    await recorder.tick()
    expect(symbols).toEqual(['BTCUSDT', 'ETHUSDT'])
    expect(recorder.getStatus().intervalMs).toBe(300_000)
    recorder.stop()
  })

  it('다음 5분 bucket 까지 남은 시간을 계산한다', () => {
    expect(msUntilNextBucket(Date.parse('2026-09-12T02:35:00.000Z'), 300_000)).toBe(
      300_000,
    )
    expect(msUntilNextBucket(Date.parse('2026-09-12T02:37:00.000Z'), 300_000)).toBe(
      180_000,
    )
  })
})
