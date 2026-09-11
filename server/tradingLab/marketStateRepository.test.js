import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db.js'
import {
  insertMarketStateObservation,
  listMarketStateObservations,
} from './marketStateRepository.js'
import { evaluateMarketState } from './marketStateEngine.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-state-'))
  closeDb()
  return {
    db: getDb({ dbPath: path.join(dir, 'lab.sqlite') }),
    dbPath: path.join(dir, 'lab.sqlite'),
  }
}

function payload(overrides = {}) {
  const evaluated = evaluateMarketState({
    symbol: 'BTCUSDT',
    evaluatedAt: '2026-09-12T02:37:00.000Z',
    priceChange15m: 0.8,
    oiChangePct: 2.1,
    cvdNotional: 4_200_000,
    buySharePct: 62,
    sellSharePct: 38,
    volumeRatio: 1.7,
    tradeCount: 10,
    ...overrides,
  })
  return {
    ...evaluated,
    referencePrice: 65000,
    ...overrides,
  }
}

afterEach(() => {
  closeDb()
})

describe('market_state_observation persistence', () => {
  it('같은 symbol + 5분 bucket 은 한 번만 저장한다', () => {
    const { db } = makeTempDb()
    const first = insertMarketStateObservation(payload(), db)
    const second = insertMarketStateObservation(
      payload({
        evaluatedAt: '2026-09-12T02:39:00.000Z',
        primaryState: 'MIXED',
        strengthScore: 10,
      }),
      db,
    )
    expect(first.inserted).toBe(true)
    expect(second.inserted).toBe(false)
    expect(second.observation.primaryState).toBe('NEW_LONG_BUILDUP')
    expect(second.observation.strengthScore).not.toBe(10)
    expect(listMarketStateObservations({ symbol: 'BTCUSDT' }, db)).toHaveLength(1)
  })

  it('다음 5분 bucket 은 새로 저장한다', () => {
    const { db } = makeTempDb()
    insertMarketStateObservation(payload(), db)
    const next = insertMarketStateObservation(
      payload({ evaluatedAt: '2026-09-12T02:40:00.000Z' }),
      db,
    )
    expect(next.inserted).toBe(true)
    expect(listMarketStateObservations({ symbol: 'BTCUSDT' }, db)).toHaveLength(2)
  })

  it('BTC/ETH 를 분리하고 재시작 후에도 유지한다', () => {
    const { db, dbPath } = makeTempDb()
    insertMarketStateObservation(payload(), db)
    insertMarketStateObservation(
      payload({
        symbol: 'ETHUSDT',
        evaluatedAt: '2026-09-12T02:37:00.000Z',
        referencePrice: 3500,
      }),
      db,
    )
    db.close()

    const db2 = getDb({ dbPath })
    const btc = listMarketStateObservations({ symbol: 'BTCUSDT' }, db2)
    const eth = listMarketStateObservations({ symbol: 'ETHUSDT' }, db2)
    expect(btc).toHaveLength(1)
    expect(eth).toHaveLength(1)
    expect(btc[0].symbol).toBe('BTCUSDT')
    expect(eth[0].symbol).toBe('ETHUSDT')
    expect(eth[0].referencePrice).toBe(3500)
    expect(btc[0].evidence.length).toBeGreaterThan(0)
  })
})
