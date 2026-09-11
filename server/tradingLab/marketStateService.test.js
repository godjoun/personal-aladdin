import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db.js'
import { assembleMarketStateInput, evaluateAndPersistMarketState, evaluateCurrentMarketState } from './marketStateService.js'
import { evaluateMarketState } from './marketStateEngine.js'
import { listMarketStateObservations } from './marketStateRepository.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-state-svc-'))
  closeDb()
  return getDb({ dbPath: path.join(dir, 'lab.sqlite') })
}

afterEach(() => {
  closeDb()
})

describe('market state assemble', () => {
  it('snapshot / CVD / 청산을 엔진 입력으로 정규화한다', async () => {
    const input = await assembleMarketStateInput('BTCUSDT', {
      nowMs: Date.parse('2026-09-12T02:35:00.000Z'),
      snapshot: {
        metrics: { price: { value: 65000 } },
        funding: { rate: 0.0001 },
        openInterest: { changePct: 2.1 },
        timeframes: {
          '15m': { changePct: 0.8, structure: 'BULLISH', volumeRatio: 1.7 },
          '1h': { changePct: 0.5, structure: 'RANGE', volumeRatio: null },
          '4h': { changePct: -1.2, structure: 'BEARISH', volumeRatio: null },
        },
      },
      cvd: {
        tradeCount: 12,
        cvdNotional: 4_200_000,
        buyNotional: 7_100_000,
        sellNotional: 2_900_000,
        buySharePct: 61,
        sellSharePct: 39,
      },
      liquidations: {
        long: { estimatedNotional: 0 },
        short: { estimatedNotional: 0 },
      },
    })

    expect(input.symbol).toBe('BTCUSDT')
    expect(input.referencePrice).toBe(65000)
    expect(input.priceChange15m).toBe(0.8)
    expect(input.oiChangePct).toBe(2.1)
    expect(input.cvdNotional).toBe(4_200_000)
    expect(input.totalTradeNotional).toBe(10_000_000)
    expect(input.cvdImbalancePct).toBeCloseTo(42, 0)
    expect(input.structure4h).toBe('BEARISH')

    const result = evaluateMarketState(input)
    expect(result.primaryState).toBe('NEW_LONG_BUILDUP')
    expect(result.counterEvidence.some((line) => line.includes('4시간'))).toBe(
      true,
    )
  })

  it('CVD 체결이 없으면 cvd 를 비운다', async () => {
    const input = await assembleMarketStateInput('ETHUSDT', {
      snapshot: {
        metrics: { price: { value: 3500 } },
        timeframes: {
          '15m': { changePct: 0.8, structure: 'BULLISH', volumeRatio: 1.1 },
        },
        openInterest: { changePct: 1.2 },
      },
      cvd: { tradeCount: 0, cvdNotional: 0, buySharePct: null, sellSharePct: null },
      liquidations: {
        long: { estimatedNotional: 0 },
        short: { estimatedNotional: 0 },
      },
    })
    expect(input.symbol).toBe('ETHUSDT')
    expect(input.cvdNotional).toBeNull()
  })

  it('evaluateCurrentMarketState 는 observation 을 만들지 않는다', async () => {
    const db = makeTempDb()
    const snapshot = {
      metrics: { price: { value: 65000 } },
      openInterest: { changePct: 2.1 },
      timeframes: {
        '15m': { changePct: 0.8, structure: 'BULLISH', volumeRatio: 1.7 },
      },
    }
    const cvd = {
      tradeCount: 12,
      cvdNotional: 4_200_000,
      buyNotional: 7_100_000,
      sellNotional: 2_900_000,
      buySharePct: 61,
      sellSharePct: 39,
    }
    const liquidations = {
      long: { estimatedNotional: 0, count: 0 },
      short: { estimatedNotional: 0, count: 0 },
    }

    await evaluateCurrentMarketState('BTCUSDT', { snapshot, cvd, liquidations, db })
    await evaluateCurrentMarketState('BTCUSDT', { snapshot, cvd, liquidations, db })
    expect(listMarketStateObservations({ symbol: 'BTCUSDT' }, db)).toHaveLength(0)

    const first = await evaluateAndPersistMarketState('BTCUSDT', {
      snapshot,
      cvd,
      liquidations,
      db,
    })
    const second = await evaluateAndPersistMarketState('BTCUSDT', {
      snapshot,
      cvd,
      liquidations,
      db,
    })
    expect(first.persisted).toBe(true)
    expect(second.persisted).toBe(false)
    expect(listMarketStateObservations({ symbol: 'BTCUSDT' }, db)).toHaveLength(1)
  })
})
