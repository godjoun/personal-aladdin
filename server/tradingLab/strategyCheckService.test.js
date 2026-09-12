import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db.js'
import {
  createShadowTradeFromStrategyCheck,
  createStrategyCheck,
} from './strategyCheckService.js'
import {
  insertShadowTrade,
  upsertShadowTradeOutcome,
  updateShadowTradeStatus,
  getShadowTradeById,
} from './shadowTradeRepository.js'
import { insertChartAnnotation } from './chartAnnotationRepository.js'
import {
  listPresentedShadowTrades,
  presentShadowTrade,
} from './shadowTradeService.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-strategy-'))
  closeDb()
  const dbPath = path.join(dir, 'lab.sqlite')
  return { db: getDb({ dbPath }), dbPath }
}

function assembled(overrides = {}) {
  return {
    symbol: 'BTCUSDT',
    referencePrice: 77200,
    structure15m: 'BULLISH',
    structure1h: 'BULLISH',
    structure4h: 'BULLISH',
    priceChange15m: 0.3,
    cvdNotional: 700,
    buySharePct: 60,
    sellSharePct: 40,
    oiChangePct: 0.6,
    fundingRate: 0.0001,
    volumeRatio: 1.8,
    longLiquidationNotional: 0,
    shortLiquidationNotional: 0,
    ...overrides,
  }
}

afterEach(() => {
  closeDb()
})

describe('strategyCheckService', () => {
  it('체크 결과를 저장하고 Shadow Trade 와 연결한다', async () => {
    const { db } = makeTempDb()
    const created = await createStrategyCheck(
      {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        selectedTags: ['support', 'has_stop', 'has_target'],
      },
      {
        db,
        assembled: assembled(),
        evaluation: { primaryState: 'MIXED', strengthScore: 44 },
      },
    )
    expect(created.ok).toBe(true)
    expect(created.check.strategyVersion).toBe('my_strategy_v1')
    expect(created.check.selectedTags).toEqual([
      'support',
      'has_stop',
      'has_target',
    ])
    expect(created.check.shadowTradeId).toBeNull()

    const linked = await createShadowTradeFromStrategyCheck(created.check.id, {
      db,
      currentPrice: 77200,
    })
    expect(linked.ok).toBe(true)
    expect(linked.trade.entryReason).toBe('my_strategy_v1')
    expect(linked.trade.userTags).toEqual(['support', 'has_stop', 'has_target'])
    expect(linked.trade.userNote).toContain('기준 충족도')
    expect(linked.trade.userNote).not.toMatch(/승률/)
    expect(linked.check.shadowTradeId).toBe(linked.trade.id)
    expect(linked.trade.source).toBe('MANUAL_USER')
    expect(linked.trade.recordType).toBe('STRATEGY')
    expect(linked.check.recordType).toBe('STRATEGY')
  })

  it('RISK_HIGH 또는 FOMO 는 충동 기록, NOT_READY 는 관찰 기록이다', async () => {
    const { db } = makeTempDb()
    const impulseCheck = await createStrategyCheck(
      {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        selectedTags: ['support', 'has_stop', 'has_target', 'fomo'],
      },
      {
        db,
        assembled: assembled(),
        evaluation: { primaryState: 'MIXED', strengthScore: 44 },
      },
    )
    expect(impulseCheck.check.result).toBe('RISK_HIGH')
    const impulse = await createShadowTradeFromStrategyCheck(impulseCheck.check.id, {
      db,
      currentPrice: 77200,
    })
    expect(impulse.trade.recordType).toBe('IMPULSE')

    const observeCheck = await createStrategyCheck(
      {
        symbol: 'ETHUSDT',
        direction: 'SHORT',
        selectedTags: ['resistance', 'has_stop', 'has_target'],
      },
      {
        db,
        assembled: assembled({
          symbol: 'ETHUSDT',
          structure4h: 'UNKNOWN',
          structure1h: 'UNKNOWN',
          structure15m: 'UNKNOWN',
          cvdNotional: null,
          buySharePct: null,
          volumeRatio: 0.2,
          oiChangePct: null,
        }),
        evaluation: { primaryState: 'DATA_INSUFFICIENT', strengthScore: 10 },
      },
    )
    expect(observeCheck.check.result).toBe('NOT_READY')
    const observed = await createShadowTradeFromStrategyCheck(observeCheck.check.id, {
      db,
      currentPrice: 2560,
    })
    expect(observed.trade.recordType).toBe('OBSERVATION')
  })

  it('최근 같은 방향 과다 기록을 리스크 높음으로 본다', async () => {
    const { db } = makeTempDb()
    const now = Date.parse('2026-09-12T07:00:00.000Z')
    insertShadowTrade(
      {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        source: 'MANUAL_USER',
        status: 'OPEN',
        createdAt: '2026-09-12T06:40:00.000Z',
        entryPrice: 77000,
        entryReason: 'quick_manual',
      },
      db,
    )
    insertShadowTrade(
      {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        source: 'MANUAL_USER',
        status: 'OPEN',
        createdAt: '2026-09-12T06:50:00.000Z',
        entryPrice: 77100,
        entryReason: 'quick_manual',
      },
      db,
    )

    const created = await createStrategyCheck(
      {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        selectedTags: ['support', 'has_stop', 'has_target'],
      },
      {
        db,
        nowMs: now,
        assembled: assembled(),
        evaluation: { primaryState: 'MIXED', strengthScore: 40 },
      },
    )
    expect(created.check.result).toBe('RISK_HIGH')
    expect(created.check.riskWarnings).toContain(
      '최근 30분 같은 방향 Shadow Trade 가 과다합니다.',
    )
  })

  it('최근 연속 LOSS 를 리스크 높음으로 본다', async () => {
    const { db } = makeTempDb()
    for (const [id, createdAt] of [
      ['a', '2026-09-12T05:00:00.000Z'],
      ['b', '2026-09-12T06:00:00.000Z'],
    ]) {
      insertShadowTrade(
        {
          id,
          symbol: 'ETHUSDT',
          direction: 'SHORT',
          source: 'MANUAL_USER',
          status: 'OPEN',
          createdAt,
          entryPrice: 2560,
        },
        db,
      )
      upsertShadowTradeOutcome(id, { result: 'LOSS' }, db)
      updateShadowTradeStatus(id, 'CLOSED', db)
    }

    const created = await createStrategyCheck(
      {
        symbol: 'ETHUSDT',
        direction: 'SHORT',
        selectedTags: ['resistance', 'has_stop', 'has_target'],
      },
      {
        db,
        assembled: assembled({
          symbol: 'ETHUSDT',
          structure4h: 'BEARISH',
          structure1h: 'BEARISH',
          structure15m: 'BEARISH',
          cvdNotional: -300,
        }),
        evaluation: { primaryState: 'BEARISH_PRESSURE', strengthScore: 70 },
      },
    )
    expect(created.check.result).toBe('RISK_HIGH')
    expect(created.check.riskWarnings).toContain(
      '최근 완료 Shadow Trade 가 연속 LOSS 입니다.',
    )
  })

  it('가상 기록 생성 시 근처 chart annotation 을 함께 저장한다', async () => {
    const { db } = makeTempDb()
    const annotation = insertChartAnnotation(
      {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        annotationType: 'FVG',
        topPrice: 77400,
        bottomPrice: 77000,
        startTime: '2026-09-12T06:00:00.000Z',
        endTime: '2026-09-12T07:00:00.000Z',
      },
      db,
    )
    const created = await createStrategyCheck(
      {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        selectedTags: ['support', 'has_stop', 'has_target'],
      },
      {
        db,
        assembled: assembled(),
        evaluation: { primaryState: 'MIXED', strengthScore: 44 },
      },
    )
    expect(created.check.linkedAnnotations).toEqual([
      expect.objectContaining({
        id: annotation.id,
        annotationType: 'FVG',
        evidence: '검토 가능 근거 · FVG 안',
      }),
    ])
    expect(created.check.autoEvidence.linkedAnnotations[0].id).toBe(annotation.id)

    const linked = await createShadowTradeFromStrategyCheck(created.check.id, {
      db,
      currentPrice: 77200,
    })
    expect(linked.trade.linkedAnnotations).toEqual([
      expect.objectContaining({
        id: annotation.id,
        annotationType: 'FVG',
      }),
    ])
    expect(linked.trade.linkedAnnotations[0].evidence).not.toMatch(/매수하세요|승률/)
  })

  it('목록 응답에도 strategy_check.linkedAnnotations 를 붙인다', async () => {
    const { db } = makeTempDb()
    insertChartAnnotation(
      {
        symbol: 'BTCUSDT',
        timeframe: '15m',
        annotationType: 'SUPPORT',
        price: 77200,
      },
      db,
    )
    insertChartAnnotation(
      {
        symbol: 'BTCUSDT',
        timeframe: '15m',
        annotationType: 'FVG',
        topPrice: 77400,
        bottomPrice: 77000,
        startTime: '2026-09-12T06:00:00.000Z',
        endTime: '2026-09-12T07:00:00.000Z',
      },
      db,
    )
    insertChartAnnotation(
      {
        symbol: 'BTCUSDT',
        timeframe: '15m',
        annotationType: 'SUPPORT_OB',
        topPrice: 77400,
        bottomPrice: 77000,
        startTime: '2026-09-12T06:00:00.000Z',
        endTime: '2026-09-12T07:00:00.000Z',
      },
      db,
    )
    const created = await createStrategyCheck(
      {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        selectedTags: ['support', 'has_stop', 'has_target'],
      },
      {
        db,
        assembled: assembled(),
        evaluation: { primaryState: 'MIXED', strengthScore: 44 },
      },
    )
    const linked = await createShadowTradeFromStrategyCheck(created.check.id, {
      db,
      currentPrice: 77200,
    })
    expect(linked.check.shadowTradeId).toBe(linked.trade.id)
    expect(linked.trade.linkedAnnotations.map((item) => item.annotationType).sort()).toEqual(
      ['FVG', 'SUPPORT', 'SUPPORT_OB'],
    )

    const listed = await listPresentedShadowTrades({
      db,
      symbol: 'BTCUSDT',
      prices: { BTCUSDT: 77200 },
    })
    expect(listed).toHaveLength(1)
    expect(listed[0]).toHaveProperty('linkedAnnotations')
    expect(listed[0].linkedAnnotations).toEqual(linked.trade.linkedAnnotations)
    expect(listed[0].linkedAnnotations.map((item) => item.label).sort()).toEqual([
      'FVG',
      'support',
      'support OB',
    ])

    const raw = getShadowTradeById(linked.trade.id, db)
    const single = presentShadowTrade(raw, 77200, db)
    expect(single.linkedAnnotations).toEqual(listed[0].linkedAnnotations)
    expect(single.id).toBe(listed[0].id)
  })
})
