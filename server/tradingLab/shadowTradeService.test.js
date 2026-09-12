import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db.js'
import {
  createManualShadowTrade,
  createQuickShadowTrade,
  evaluateOpenShadowTrade,
  getPresentedShadowStats,
  maybeCreateAutoShadowTrade,
  patchShadowTradeAnnotations,
} from './shadowTradeService.js'
import { setShadowTradeSettings } from './shadowTradeRepository.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-shadow-'))
  closeDb()
  const dbPath = path.join(dir, 'lab.sqlite')
  return { db: getDb({ dbPath }), dbPath }
}

function autoEval(overrides = {}) {
  return {
    primaryState: 'BULLISH_PRESSURE',
    strengthScore: 70,
    secondaryStates: [],
    evaluatedAt: '2026-09-12T00:00:00.000Z',
    context: {
      timeframe15m: 'BULLISH',
      timeframe1h: 'BULLISH',
      timeframe4h: 'BULLISH',
    },
    ...overrides,
  }
}

function assembled(overrides = {}) {
  return {
    symbol: 'ETHUSDT',
    referencePrice: 2560,
    structure15m: 'BULLISH',
    structure1h: 'BULLISH',
    structure4h: 'BULLISH',
    cvdNotional: 1000,
    buySharePct: 58,
    sellSharePct: 42,
    oiChangePct: 1.2,
    fundingRate: 0.0001,
    volumeRatio: 1.4,
    longLiquidationNotional: 0,
    shortLiquidationNotional: 0,
    ...overrides,
  }
}

afterEach(() => {
  closeDb()
})

describe('shadowTradeService', () => {
  it('수동 LONG/SHORT 를 만들고 빈 메모 경고를 남긴다', async () => {
    const { db } = makeTempDb()
    const long = await createManualShadowTrade(
      {
        symbol: 'ETHUSDT',
        direction: 'LONG',
        entryPrice: 2560,
        userTags: ['support'],
        userNote: null,
      },
      { db, currentPrice: 2560 },
    )
    expect(long.ok).toBe(true)
    expect(long.trade.source).toBe('MANUAL_USER')
    expect(long.trade.warnings).toContain('진입 이유가 비어 있습니다')

    const short = await createManualShadowTrade(
      {
        symbol: 'ETHUSDT',
        direction: 'SHORT',
        entryPrice: 2560,
        userNote: 'resistance',
      },
      { db, currentPrice: 2560 },
    )
    expect(short.trade.direction).toBe('SHORT')
    expect(short.trade.warnings).not.toContain('진입 이유가 비어 있습니다')
  })

  it('자동 기록이 OFF 면 생성하지 않는다', async () => {
    const { db } = makeTempDb()
    const result = await maybeCreateAutoShadowTrade({
      symbol: 'BTCUSDT',
      evaluation: autoEval(),
      assembled: assembled({ symbol: 'BTCUSDT', referencePrice: 65000 }),
      nowMs: Date.parse('2026-09-12T00:00:00.000Z'),
      db,
      currentPrice: 65000,
    })
    expect(result.created).toBe(false)
    expect(result.reason).toBe('auto_off')
  })

  it('자동 ON + 조건 충족 시 생성하고 30분 중복을 막는다', async () => {
    const { db } = makeTempDb()
    setShadowTradeSettings({ autoRecord: true }, db)
    const first = await maybeCreateAutoShadowTrade({
      symbol: 'BTCUSDT',
      evaluation: autoEval(),
      assembled: assembled({ symbol: 'BTCUSDT', referencePrice: 65000 }),
      nowMs: Date.parse('2026-09-12T00:10:00.000Z'),
      db,
      currentPrice: 65000,
    })
    expect(first.created).toBe(true)
    expect(first.trade.direction).toBe('LONG')
    expect(first.trade.source).toBe('AUTO_MARKET_STATE')

    const second = await maybeCreateAutoShadowTrade({
      symbol: 'BTCUSDT',
      evaluation: autoEval(),
      assembled: assembled({ symbol: 'BTCUSDT', referencePrice: 65000 }),
      nowMs: Date.parse('2026-09-12T00:20:00.000Z'),
      db,
      currentPrice: 65000,
    })
    expect(second.created).toBe(false)
    expect(second.reason).toBe('duplicate')
  })

  it('청산 주도 상태는 자동 진입 대신 후보만 기록한다', async () => {
    const { db } = makeTempDb()
    setShadowTradeSettings({ autoRecord: true }, db)
    const result = await maybeCreateAutoShadowTrade({
      symbol: 'ETHUSDT',
      evaluation: autoEval({
        primaryState: 'SHORT_LIQUIDATION_DRIVEN',
        strengthScore: 90,
      }),
      assembled: assembled(),
      nowMs: Date.parse('2026-09-12T01:00:00.000Z'),
      db,
      currentPrice: 2560,
    })
    expect(result.created).toBe(false)
    expect(result.reason).toBe('observe_only')
    expect(result.candidate.primaryState).toBe('SHORT_LIQUIDATION_DRIVEN')
  })

  it('24h 평가와 MFE/MAE, 비용 반영 수익률을 저장한다', async () => {
    const { db } = makeTempDb()
    const created = await createManualShadowTrade(
      { symbol: 'BTCUSDT', direction: 'LONG', entryPrice: 100, userNote: 'note' },
      {
        db,
        nowMs: Date.parse('2026-09-12T00:00:00.000Z'),
        currentPrice: 100,
      },
    )
    const createdMs = Date.parse(created.trade.createdAt)
    const evaluated = await evaluateOpenShadowTrade(created.trade, {
      db,
      nowMs: createdMs + 24 * 60 * 60 * 1000 + 1000,
      currentPrice: 106,
      candles: [
        { timestamp: createdMs + 60 * 60 * 1000, close: 101, high: 102, low: 99 },
        { timestamp: createdMs + 4 * 60 * 60 * 1000, close: 103, high: 104, low: 100 },
        { timestamp: createdMs + 12 * 60 * 60 * 1000, close: 102, high: 105, low: 98 },
        { timestamp: createdMs + 24 * 60 * 60 * 1000, close: 106, high: 107, low: 97 },
      ],
    })
    expect(evaluated.status).toBe('CLOSED')
    expect(evaluated.outcome.return24hPct).toBeCloseTo(6)
    expect(evaluated.outcome.feeAdjustedReturnPct).toBeCloseTo(5.84)
    expect(evaluated.outcome.result).toBe('WIN')
    expect(evaluated.outcome.maxFavorableMovePct).toBeCloseTo(7)
    expect(evaluated.outcome.maxAdverseMovePct).toBeCloseTo(-3)
  })

  it('quick LONG/SHORT 를 만들고 태그와 FOMO 를 저장한다', async () => {
    const { db } = makeTempDb()
    const long = await createQuickShadowTrade(
      {
        symbol: 'ETHUSDT',
        direction: 'LONG',
        userTags: ['support', 'fomo'],
      },
      {
        db,
        nowMs: Date.parse('2026-09-12T03:00:00.000Z'),
        currentPrice: 2539.99,
        assembled: assembled(),
        evaluation: autoEval(),
      },
    )
    expect(long.ok).toBe(true)
    expect(long.trade.entryReason).toBe('quick_manual')
    expect(long.trade.entryPrice).toBe(2539.99)
    expect(long.trade.userTags).toEqual(['support', 'fomo'])
    expect(long.trade.primaryState).toBe('BULLISH_PRESSURE')
    expect(long.trade.warnings).not.toContain('진입 이유가 비어 있습니다')

    const short = await createQuickShadowTrade(
      { symbol: 'ETHUSDT', direction: 'SHORT', userTags: [] },
      {
        db,
        nowMs: Date.parse('2026-09-12T03:00:00.000Z'),
        currentPrice: 2539.99,
        assembled: assembled(),
        evaluation: autoEval({ primaryState: 'BEARISH_PRESSURE' }),
      },
    )
    expect(short.ok).toBe(true)
    expect(short.trade.direction).toBe('SHORT')
    expect(short.trade.userTags).toEqual([])
  })

  it('quick 기록은 같은 방향 60초 중복을 막는다', async () => {
    const { db } = makeTempDb()
    const first = await createQuickShadowTrade(
      { symbol: 'BTCUSDT', direction: 'LONG' },
      {
        db,
        nowMs: Date.parse('2026-09-12T03:00:00.000Z'),
        currentPrice: 77000,
        assembled: assembled({ symbol: 'BTCUSDT', referencePrice: 77000 }),
        evaluation: autoEval(),
      },
    )
    expect(first.ok).toBe(true)
    const second = await createQuickShadowTrade(
      { symbol: 'BTCUSDT', direction: 'LONG' },
      {
        db,
        nowMs: Date.parse('2026-09-12T03:00:40.000Z'),
        currentPrice: 77010,
        assembled: assembled({ symbol: 'BTCUSDT', referencePrice: 77010 }),
        evaluation: autoEval(),
      },
    )
    expect(second.ok).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.message).toBe('방금 같은 방향을 기록했습니다')
    expect(second.trade.id).toBe(first.trade.id)

    const later = await createQuickShadowTrade(
      { symbol: 'BTCUSDT', direction: 'LONG' },
      {
        db,
        nowMs: Date.parse('2026-09-12T03:01:01.000Z'),
        currentPrice: 77020,
        assembled: assembled({ symbol: 'BTCUSDT', referencePrice: 77020 }),
        evaluation: autoEval(),
      },
    )
    expect(later.ok).toBe(true)
    expect(later.trade.id).not.toBe(first.trade.id)
  })

  it('나중에 메모와 태그를 보강할 수 있다', async () => {
    const { db } = makeTempDb()
    const created = await createQuickShadowTrade(
      { symbol: 'ETHUSDT', direction: 'SHORT' },
      {
        db,
        nowMs: Date.parse('2026-09-12T04:00:00.000Z'),
        currentPrice: 2560,
        assembled: assembled(),
        evaluation: autoEval(),
      },
    )
    const patched = await patchShadowTradeAnnotations(
      created.trade.id,
      { userNote: '4H 저항 관찰', userTags: ['resistance', 'fomo'] },
      { db },
    )
    expect(patched.userNote).toBe('4H 저항 관찰')
    expect(patched.userTags).toEqual(['resistance', 'fomo'])
  })

  it('SQLite 재시작 후에도 가상 기록이 남는다', async () => {
    const { dbPath } = makeTempDb()
    const firstDb = getDb({ dbPath })
    const created = await createManualShadowTrade(
      { symbol: 'ETHUSDT', direction: 'SHORT', entryPrice: 2560, userNote: 'note' },
      { db: firstDb, currentPrice: 2560 },
    )
    const id = created.trade.id
    closeDb()
    const restarted = getDb({ dbPath })
    const stats = getPresentedShadowStats({ db: restarted })
    expect(stats.total).toBe(1)
    expect(stats.short).toBe(1)
    const again = await createManualShadowTrade(
      { symbol: 'ETHUSDT', direction: 'LONG', entryPrice: 2560, userNote: 'keep' },
      { db: restarted, currentPrice: 2560 },
    )
    expect(again.trade.id).not.toBe(id)
    expect(getPresentedShadowStats({ db: restarted }).total).toBe(2)
  })
})
