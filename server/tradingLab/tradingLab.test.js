import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db.js'
import {
  createAnalysis,
  deleteAnalysisById,
  getAnalysisById,
  getAnalysisStats,
  listAnalyses,
} from './analysisRepository.js'
import {
  getOutcomeByAnalysisId,
  getOutcomesByAnalysisIds,
  upsertOutcome,
} from './outcomeRepository.js'
import {
  createLiquidationSnapshot,
  listLiquidationSnapshots,
} from './liquidationRepository.js'
import {
  createScreenshot,
  listScreenshotsByAnalysisId,
} from './screenshotRepository.js'
import {
  asBias,
  asConfidence,
  asCvdWindow,
  asLabSymbol,
  asLabTimeframe,
  asListLimit,
  sanitizeAnalysisInput,
  sanitizeLiquidationInput,
  sanitizeOutcomeInput,
  sanitizeScreenshotInput,
} from './validate.js'
import {
  MARKET_DATA_METHODS,
  PROVIDER_STATUS,
  callMarketData,
  getMarketDataProvider,
  isMarketDataConfigured,
  registerMarketDataProvider,
  resetMarketDataProvider,
  validateProviderShape,
} from './marketDataProvider.js'
import { getMarketSnapshot } from './marketSnapshotService.js'
import {
  CVD_SIGNALS,
  PRICE_OI_SIGNALS,
  buildMarketObservations,
  describeCvdFlow,
  describeFundingTilt,
  describeLiquidationProximity,
  describePriceOpenInterestRelation,
  describeVolumeParticipation,
} from './marketInterpretation.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-lab-'))
  const dbPath = path.join(dir, 'lab.sqlite')
  closeDb()
  return getDb({ dbPath })
}

/** 최소 유효 분석 입력 */
function baseAnalysis(overrides = {}) {
  return {
    symbol: 'BTCUSDT',
    bias: 'LONG',
    confidence: 63,
    ...overrides,
  }
}

afterEach(() => {
  closeDb()
  resetMarketDataProvider()
})

describe('Trading Lab 입력 검증', () => {
  it('symbol allowlist 밖의 값은 거부한다', () => {
    expect(asLabSymbol('BTCUSDT')).toBe('BTCUSDT')
    expect(asLabSymbol('ethusdt')).toBe('ETHUSDT')
    expect(asLabSymbol('SOLUSDT')).toBeNull()
    expect(asLabSymbol('BTCUSDT; DROP TABLE trade_analysis')).toBeNull()
    expect(asLabSymbol('')).toBeNull()
    expect(asLabSymbol(null)).toBeNull()
    expect(asLabSymbol(123)).toBeNull()
  })

  it('timeframe allowlist 밖의 값은 거부한다', () => {
    expect(asLabTimeframe('15m')).toBe('15m')
    expect(asLabTimeframe('4H')).toBe('4h')
    expect(asLabTimeframe('3m')).toBeNull()
    expect(asLabTimeframe('1w')).toBeNull()
  })

  it('CVD window 는 5m/15m/1h/4h 만 허용한다', () => {
    expect(asCvdWindow(undefined)).toBe('15m')
    expect(asCvdWindow('5m')).toBe('5m')
    expect(asCvdWindow('1H')).toBe('1h')
    expect(asCvdWindow('24h')).toBeNull()
    expect(asCvdWindow('3m')).toBeNull()
  })

  it('bias 는 LONG/SHORT/NEUTRAL 만 허용한다', () => {
    expect(asBias('long')).toBe('LONG')
    expect(asBias('SHORT')).toBe('SHORT')
    expect(asBias('NEUTRAL')).toBe('NEUTRAL')
    expect(asBias('MOON')).toBeNull()
    expect(asBias('BUY')).toBeNull()
  })

  it('confidence 는 0~100 범위만 허용한다', () => {
    expect(asConfidence(63)).toBe(63)
    expect(asConfidence('63.4')).toBe(63)
    expect(asConfidence(0)).toBe(0)
    expect(asConfidence(100)).toBe(100)
    expect(asConfidence(null)).toBeNull()
    expect(asConfidence(101)).toBeUndefined()
    expect(asConfidence(-1)).toBeUndefined()
    expect(asConfidence('high')).toBeUndefined()
  })

  it('limit 은 상한을 넘으면 거부한다', () => {
    expect(asListLimit(undefined, 20)).toBe(20)
    expect(asListLimit(50)).toBe(50)
    expect(asListLimit(0)).toBeNull()
    expect(asListLimit(9999)).toBeNull()
    expect(asListLimit(1.5)).toBeNull()
  })

  it('분석 입력에서 잘못된 bias/symbol 은 필드명과 함께 거부한다', () => {
    expect(sanitizeAnalysisInput(baseAnalysis({ symbol: 'DOGEUSDT' }))).toEqual({
      ok: false,
      field: 'symbol',
    })
    expect(sanitizeAnalysisInput(baseAnalysis({ bias: 'LONGISH' }))).toEqual({
      ok: false,
      field: 'bias',
    })
    expect(sanitizeAnalysisInput(null)).toEqual({ ok: false, field: 'body' })
  })

  it('시장 지표 누락은 정상 입력으로 취급하고 null 로 정규화한다', () => {
    const parsed = sanitizeAnalysisInput(baseAnalysis())
    expect(parsed.ok).toBe(true)
    expect(parsed.value.marketSnapshot).toEqual({
      volume: null,
      volumeZScore: null,
      openInterest: null,
      openInterestChange: null,
      fundingRate: null,
      cvd: null,
      liquidationAbove: null,
      liquidationBelow: null,
    })
    expect(parsed.value.referencePrice).toBeNull()
    expect(parsed.value.invalidationPrice).toBeNull()
  })

  it('funding/cvd 음수는 유효값으로 통과한다', () => {
    const parsed = sanitizeAnalysisInput(
      baseAnalysis({
        marketSnapshot: { fundingRate: -0.00012, cvd: -4200, openInterestChange: -3.5 },
      }),
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.value.marketSnapshot.fundingRate).toBeCloseTo(-0.00012)
    expect(parsed.value.marketSnapshot.cvd).toBe(-4200)
    expect(parsed.value.marketSnapshot.openInterestChange).toBe(-3.5)
  })

  it('음수 가격은 거부한다', () => {
    const parsed = sanitizeAnalysisInput(baseAnalysis({ referencePrice: -100 }))
    expect(parsed.value.referencePrice).toBeNull()
  })

  it('근거/주의 목록은 개수·길이 상한을 적용한다', () => {
    const ok = sanitizeAnalysisInput(
      baseAnalysis({ reasoning: ['거래량 증가', '  OI 증가  ', ''] }),
    )
    expect(ok.value.reasoning).toEqual(['거래량 증가', 'OI 증가'])

    const tooMany = sanitizeAnalysisInput(
      baseAnalysis({ reasoning: Array.from({ length: 21 }, (_, i) => `r${i}`) }),
    )
    expect(tooMany).toEqual({ ok: false, field: 'reasoning' })

    const tooLong = sanitizeAnalysisInput(
      baseAnalysis({ cautions: ['x'.repeat(201)] }),
    )
    expect(tooLong).toEqual({ ok: false, field: 'cautions' })

    const notArray = sanitizeAnalysisInput(baseAnalysis({ reasoning: { a: 1 } }))
    expect(notArray).toEqual({ ok: false, field: 'reasoning' })
  })

  it('outcome result allowlist 를 적용한다', () => {
    expect(sanitizeOutcomeInput({ result: 'SUCCESS' }).ok).toBe(true)
    expect(sanitizeOutcomeInput({}).value.result).toBe('UNRESOLVED')
    expect(sanitizeOutcomeInput({ result: 'PROFIT' })).toEqual({
      ok: false,
      field: 'result',
    })
    expect(sanitizeOutcomeInput({ result: 'SUCCESS', evaluatedAt: 'nope' })).toEqual({
      ok: false,
      field: 'evaluatedAt',
    })
  })

  it('liquidation side/sourceType allowlist 를 적용한다', () => {
    const ok = sanitizeLiquidationInput({
      symbol: 'ETHUSDT',
      side: 'long',
      sourceType: 'estimated',
    })
    expect(ok.value.side).toBe('LONG')
    expect(ok.value.sourceType).toBe('ESTIMATED')
    expect(sanitizeLiquidationInput({ symbol: 'ETHUSDT', side: 'BOTH' })).toEqual({
      ok: false,
      field: 'side',
    })
    expect(
      sanitizeLiquidationInput({
        symbol: 'ETHUSDT',
        side: 'LONG',
        sourceType: 'GUESS',
      }),
    ).toEqual({ ok: false, field: 'sourceType' })
  })

  it('screenshot metadata 는 symbol/timeframe allowlist 를 요구한다', () => {
    const ok = sanitizeScreenshotInput({ symbol: 'BTCUSDT', timeframe: '1h' })
    expect(ok.value.status).toBe('PENDING')
    expect(sanitizeScreenshotInput({ symbol: 'BTCUSDT', timeframe: '2h' })).toEqual({
      ok: false,
      field: 'timeframe',
    })
  })
})

describe('trade_analysis 저장/조회', () => {
  it('분석을 생성하고 다시 읽을 수 있다', () => {
    const db = makeTempDb()
    const parsed = sanitizeAnalysisInput({
      symbol: 'ETHUSDT',
      bias: 'LONG',
      confidence: 63,
      referencePrice: 3200.5,
      timeframe15m: 'BULLISH',
      timeframe1h: 'RANGE',
      timeframe4h: 'BULLISH',
      reasoning: ['거래량 증가', 'OI 증가'],
      cautions: ['청산 밀집 구간 접근'],
      invalidationPrice: 3100,
      notes: '복기용 메모',
      marketSnapshot: {
        volume: 1000,
        volumeZScore: 2.4,
        openInterest: 550000,
        openInterestChange: 3.1,
        fundingRate: 0.0001,
        cvd: 1200,
        liquidationAbove: 3300,
        liquidationBelow: 3050,
      },
      marketDataStatus: 'PARTIAL',
      marketDataSource: 'MANUAL',
    })

    const created = createAnalysis(parsed.value, db)
    expect(created.id).toBeTruthy()

    const found = getAnalysisById(created.id, db)
    expect(found.symbol).toBe('ETHUSDT')
    expect(found.bias).toBe('LONG')
    expect(found.confidence).toBe(63)
    expect(found.reasoning).toEqual(['거래량 증가', 'OI 증가'])
    expect(found.cautions).toEqual(['청산 밀집 구간 접근'])
    expect(found.invalidationPrice).toBe(3100)
    expect(found.marketSnapshot.volumeZScore).toBe(2.4)
    expect(found.marketSnapshot.liquidationBelow).toBe(3050)
    expect(found.marketDataStatus).toBe('PARTIAL')
  })

  it('시장 지표가 전부 없어도 분석을 저장한다', () => {
    const db = makeTempDb()
    const parsed = sanitizeAnalysisInput(baseAnalysis({ confidence: null }))
    const created = createAnalysis(parsed.value, db)

    expect(created.confidence).toBeNull()
    expect(created.referencePrice).toBeNull()
    expect(created.reasoning).toEqual([])
    for (const value of Object.values(created.marketSnapshot)) {
      expect(value).toBeNull()
    }
  })

  it('symbol 로 필터링하고 최신순으로 정렬한다', () => {
    const db = makeTempDb()
    createAnalysis(sanitizeAnalysisInput(baseAnalysis()).value, db)
    createAnalysis(
      sanitizeAnalysisInput(baseAnalysis({ symbol: 'ETHUSDT', bias: 'SHORT' })).value,
      db,
    )

    expect(listAnalyses({}, db)).toHaveLength(2)
    expect(listAnalyses({ symbol: 'ETHUSDT' }, db)).toHaveLength(1)
    expect(listAnalyses({ symbol: 'ETHUSDT' }, db)[0].bias).toBe('SHORT')
    expect(listAnalyses({ bias: 'LONG' }, db)).toHaveLength(1)
    expect(listAnalyses({ limit: 1 }, db)).toHaveLength(1)
  })

  it('분석 삭제 후에는 조회되지 않는다', () => {
    const db = makeTempDb()
    const created = createAnalysis(sanitizeAnalysisInput(baseAnalysis()).value, db)

    expect(deleteAnalysisById(created.id, db)).toEqual({ ok: true })
    expect(getAnalysisById(created.id, db)).toBeNull()
    expect(deleteAnalysisById(created.id, db)).toEqual({ ok: false })
  })

  it('DB 재연결 후에도 분석이 유지된다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-lab-'))
    const dbPath = path.join(dir, 'persist.sqlite')

    closeDb()
    const db1 = getDb({ dbPath })
    const created = createAnalysis(sanitizeAnalysisInput(baseAnalysis()).value, db1)
    db1.close()

    const db2 = getDb({ dbPath })
    expect(getAnalysisById(created.id, db2).bias).toBe('LONG')
    db2.close()
  })
})

describe('trade_analysis_outcomes 연결', () => {
  it('분석에 결과를 연결하고 갱신한다', () => {
    const db = makeTempDb()
    const analysis = createAnalysis(sanitizeAnalysisInput(baseAnalysis()).value, db)

    const first = upsertOutcome(
      analysis.id,
      sanitizeOutcomeInput({
        result: 'UNRESOLVED',
        price1h: 65000,
        maxFavorableMove: 1.2,
        maxAdverseMove: -0.4,
      }).value,
      db,
    )
    expect(first.ok).toBe(true)
    expect(first.action).toBe('inserted')
    expect(first.outcome.result).toBe('UNRESOLVED')
    expect(first.outcome.price4h).toBeNull()

    const second = upsertOutcome(
      analysis.id,
      sanitizeOutcomeInput({ result: 'SUCCESS', price24h: 67000 }).value,
      db,
    )
    expect(second.action).toBe('updated')
    expect(second.outcome.result).toBe('SUCCESS')
    expect(getOutcomeByAnalysisId(analysis.id, db).price24h).toBe(67000)
  })

  it('존재하지 않는 분석에는 결과를 붙이지 않는다', () => {
    const db = makeTempDb()
    const result = upsertOutcome(
      'does-not-exist',
      sanitizeOutcomeInput({ result: 'SUCCESS' }).value,
      db,
    )
    expect(result).toEqual({ ok: false, reason: 'analysis_not_found' })
  })

  it('분석 삭제 시 결과도 함께 정리된다', () => {
    const db = makeTempDb()
    const analysis = createAnalysis(sanitizeAnalysisInput(baseAnalysis()).value, db)
    upsertOutcome(analysis.id, sanitizeOutcomeInput({ result: 'SUCCESS' }).value, db)

    deleteAnalysisById(analysis.id, db)
    expect(getOutcomeByAnalysisId(analysis.id, db)).toBeNull()
  })

  it('여러 분석의 결과를 일괄 조회한다', () => {
    const db = makeTempDb()
    const a = createAnalysis(sanitizeAnalysisInput(baseAnalysis()).value, db)
    const b = createAnalysis(
      sanitizeAnalysisInput(baseAnalysis({ symbol: 'ETHUSDT' })).value,
      db,
    )
    upsertOutcome(a.id, sanitizeOutcomeInput({ result: 'FAILURE' }).value, db)

    const map = getOutcomesByAnalysisIds([a.id, b.id], db)
    expect(map.get(a.id).result).toBe('FAILURE')
    expect(map.get(b.id)).toBeUndefined()
    expect(getOutcomesByAnalysisIds([], db).size).toBe(0)
  })

  it('통계 기초 집계가 bias/result 분포를 반환한다', () => {
    const db = makeTempDb()
    const a = createAnalysis(sanitizeAnalysisInput(baseAnalysis()).value, db)
    createAnalysis(
      sanitizeAnalysisInput(baseAnalysis({ symbol: 'ETHUSDT', bias: 'NEUTRAL' })).value,
      db,
    )
    upsertOutcome(a.id, sanitizeOutcomeInput({ result: 'SUCCESS' }).value, db)

    const stats = getAnalysisStats(db)
    expect(stats.total).toBe(2)
    expect(stats.byBias.LONG).toBe(1)
    expect(stats.byBias.NEUTRAL).toBe(1)
    expect(stats.byBias.SHORT).toBe(0)
    expect(stats.byResult.SUCCESS).toBe(1)
    expect(stats.resolved).toBe(1)
    expect(stats.unresolved).toBe(1)
  })
})

describe('liquidation_snapshot 저장', () => {
  it('추정 출처를 구분해 저장한다', () => {
    const db = makeTempDb()
    const external = createLiquidationSnapshot(
      sanitizeLiquidationInput({
        symbol: 'BTCUSDT',
        side: 'LONG',
        priceLevel: 64000,
        estimatedValue: 12_000_000,
        sourceType: 'EXTERNAL',
        source: 'provider-x',
        referencePrice: 65000,
      }).value,
      db,
    )
    expect(external.sourceType).toBe('EXTERNAL')
    expect(external.source).toBe('provider-x')
    expect(external.timestamp).toBeTruthy()

    createLiquidationSnapshot(
      sanitizeLiquidationInput({
        symbol: 'BTCUSDT',
        side: 'SHORT',
        priceLevel: 66000,
        sourceType: 'ESTIMATED',
      }).value,
      db,
    )

    expect(listLiquidationSnapshots({ symbol: 'BTCUSDT' }, db)).toHaveLength(2)
    expect(listLiquidationSnapshots({ side: 'SHORT' }, db)).toHaveLength(1)
    expect(listLiquidationSnapshots({ symbol: 'ETHUSDT' }, db)).toHaveLength(0)
  })

  it('추정 수치가 없어도 저장된다', () => {
    const db = makeTempDb()
    const snapshot = createLiquidationSnapshot(
      sanitizeLiquidationInput({ symbol: 'ETHUSDT', side: 'LONG' }).value,
      db,
    )
    expect(snapshot.priceLevel).toBeNull()
    expect(snapshot.estimatedValue).toBeNull()
    expect(snapshot.sourceType).toBe('MANUAL')
  })
})

describe('차트 캡처 metadata', () => {
  it('분석에 연결된 캡처 metadata 를 저장한다', () => {
    const db = makeTempDb()
    const analysis = createAnalysis(sanitizeAnalysisInput(baseAnalysis()).value, db)

    const result = createScreenshot(
      sanitizeScreenshotInput({
        symbol: 'BTCUSDT',
        timeframe: '4h',
        note: '삼각수렴 이탈',
      }).value,
      analysis.id,
      db,
    )

    expect(result.ok).toBe(true)
    expect(result.screenshot.status).toBe('PENDING')
    expect(result.screenshot.imageRef).toBeNull()
    expect(listScreenshotsByAnalysisId(analysis.id, db)).toHaveLength(1)
  })

  it('존재하지 않는 분석에는 연결하지 않는다', () => {
    const db = makeTempDb()
    const result = createScreenshot(
      sanitizeScreenshotInput({ symbol: 'BTCUSDT', timeframe: '1h' }).value,
      'missing-id',
      db,
    )
    expect(result).toEqual({ ok: false, reason: 'analysis_not_found' })
  })
})

describe('MarketDataProvider 추상화', () => {
  it('provider 미설정 시 모든 조회가 NOT_CONFIGURED 를 반환한다', async () => {
    expect(isMarketDataConfigured()).toBe(false)

    for (const method of MARKET_DATA_METHODS) {
      const result = await callMarketData(method, { symbol: 'BTCUSDT' })
      expect(result.status, method).toBe(PROVIDER_STATUS.NOT_CONFIGURED)
      expect(result.data, method).toBeNull()
    }
  })

  it('provider 는 주문 관련 메서드를 노출하지 않는다', () => {
    const provider = getMarketDataProvider()
    for (const forbidden of [
      'createOrder',
      'placeOrder',
      'buy',
      'sell',
      'setLeverage',
      'cancelOrder',
    ]) {
      expect(provider[forbidden]).toBeUndefined()
      expect(MARKET_DATA_METHODS).not.toContain(forbidden)
    }
  })

  it('interface 를 만족하지 않는 provider 등록은 거부한다', () => {
    expect(validateProviderShape({}).ok).toBe(false)
    expect(validateProviderShape(null).ok).toBe(false)
    expect(() => registerMarketDataProvider({ getTicker: () => {} })).toThrow(
      /missing methods/,
    )
    expect(isMarketDataConfigured()).toBe(false)
  })

  it('등록된 provider 의 symbol/timeframe allowlist 를 강제한다', async () => {
    const stub = {}
    for (const method of MARKET_DATA_METHODS) {
      stub[method] = async () => ({ status: PROVIDER_STATUS.OK, data: { price: 1 } })
    }
    registerMarketDataProvider(stub)
    expect(isMarketDataConfigured()).toBe(true)

    expect((await callMarketData('getTicker', { symbol: 'BTCUSDT' })).status).toBe(
      PROVIDER_STATUS.OK,
    )
    expect((await callMarketData('getTicker', { symbol: 'SOLUSDT' })).status).toBe(
      PROVIDER_STATUS.INVALID_REQUEST,
    )
    expect(
      (await callMarketData('getCandles', { symbol: 'BTCUSDT', timeframe: '3m' }))
        .status,
    ).toBe(PROVIDER_STATUS.INVALID_REQUEST)
    expect((await callMarketData('placeOrder', { symbol: 'BTCUSDT' })).status).toBe(
      PROVIDER_STATUS.UNSUPPORTED,
    )
  })

  it('provider 예외는 ERROR 로 흡수하고 내부 메시지를 노출하지 않는다', async () => {
    const stub = {}
    for (const method of MARKET_DATA_METHODS) {
      stub[method] = async () => {
        throw new Error('secret api key abc123 rejected')
      }
    }
    registerMarketDataProvider(stub)

    const result = await callMarketData('getTicker', { symbol: 'BTCUSDT' })
    expect(result.status).toBe(PROVIDER_STATUS.ERROR)
    expect(JSON.stringify(result)).not.toContain('abc123')
  })

  it('시장 snapshot 은 provider 미연결 상태를 정상 응답으로 표현한다', async () => {
    const snapshot = await getMarketSnapshot('BTCUSDT')

    expect(snapshot.symbol).toBe('BTCUSDT')
    expect(snapshot.configured).toBe(false)
    expect(snapshot.status).toBe(PROVIDER_STATUS.NOT_CONFIGURED)
    expect(snapshot.metrics.price.value).toBeNull()
    expect(snapshot.metrics.price.status).toBe(PROVIDER_STATUS.NOT_CONFIGURED)
    expect(snapshot.metrics.fundingRate.value).toBeNull()
    expect(snapshot.structure).toHaveLength(3)
    expect(snapshot.structure.every((item) => item.state === null)).toBe(true)
    expect(snapshot.timeframes['15m'].candleCount).toBe(0)
    expect(snapshot.timeframes['1h'].candleCount).toBe(0)
    expect(snapshot.timeframes['4h'].candleCount).toBe(0)
    expect(snapshot.funding.rate).toBeNull()
    // fake 데이터를 만들지 않으므로 관찰도 비어 있다
    expect(snapshot.observations).toEqual([])
  })
})

describe('price/OI 해석 domain model', () => {
  it('price ↑ + OI ↑ 는 신규 롱 유입 가능성', () => {
    const result = describePriceOpenInterestRelation({
      priceChange: 1.2,
      openInterestChange: 3.4,
    })
    expect(result.code).toBe(PRICE_OI_SIGNALS.NEW_LONG_INFLOW)
    expect(result.label).toBe('신규 롱 유입 가능성')
    expect(result.leaning).toBe('LONG')
  })

  it('price ↑ + OI ↓ 는 숏 청산 영향 가능성', () => {
    expect(
      describePriceOpenInterestRelation({ priceChange: 1.2, openInterestChange: -3.4 })
        .code,
    ).toBe(PRICE_OI_SIGNALS.SHORT_LIQUIDATION_PRESSURE)
  })

  it('price ↓ + OI ↑ 는 신규 숏 유입 가능성', () => {
    expect(
      describePriceOpenInterestRelation({ priceChange: -1.2, openInterestChange: 3.4 })
        .code,
    ).toBe(PRICE_OI_SIGNALS.NEW_SHORT_INFLOW)
  })

  it('price ↓ + OI ↓ 는 롱 청산 영향 가능성', () => {
    expect(
      describePriceOpenInterestRelation({ priceChange: -1.2, openInterestChange: -3.4 })
        .code,
    ).toBe(PRICE_OI_SIGNALS.LONG_LIQUIDATION_PRESSURE)
  })

  it('데이터가 없으면 INSUFFICIENT_DATA 를 반환한다', () => {
    expect(
      describePriceOpenInterestRelation({ priceChange: null, openInterestChange: 1 })
        .code,
    ).toBe(PRICE_OI_SIGNALS.INSUFFICIENT_DATA)
    expect(describePriceOpenInterestRelation({}).code).toBe(
      PRICE_OI_SIGNALS.INSUFFICIENT_DATA,
    )
    expect(
      describePriceOpenInterestRelation({ priceChange: 0, openInterestChange: 1 }).code,
    ).toBe(PRICE_OI_SIGNALS.NO_CLEAR_SIGNAL)
  })

  it('모든 해석은 가능성 수준으로만 표현한다', () => {
    const assertive = [
      '고래',
      '조작',
      '확실',
      '반드시',
      '보장',
      '무조건',
      '전부 청산',
      '매수하라',
      '매도하라',
    ]

    const observations = [
      describePriceOpenInterestRelation({ priceChange: 1, openInterestChange: 1 }),
      describePriceOpenInterestRelation({ priceChange: 1, openInterestChange: -1 }),
      describePriceOpenInterestRelation({ priceChange: -1, openInterestChange: 1 }),
      describePriceOpenInterestRelation({ priceChange: -1, openInterestChange: -1 }),
      describeVolumeParticipation({ volumeZScore: 3.5 }),
      describeFundingTilt({ fundingRate: 0.0003 }),
      describeFundingTilt({ fundingRate: -0.0003 }),
      describeLiquidationProximity({
        referencePrice: 65000,
        liquidationAbove: 65100,
      }),
      describeCvdFlow({ cvd: 1200 }),
      describeCvdFlow({ cvd: -800, priceChange: 1 }),
    ]

    for (const observation of observations) {
      const text = `${observation.label} ${observation.detail}`
      for (const word of assertive) {
        expect(text, observation.code).not.toContain(word)
      }
      expect(observation.certainty).toBe('POSSIBILITY')
    }
  })

  it('거래량 이상치는 대형 참여자 개입 가능성까지만 표현한다', () => {
    expect(describeVolumeParticipation({ volumeZScore: 3 }).label).toBe(
      '대형 참여자 개입 가능성',
    )
    expect(describeVolumeParticipation({ volumeZScore: 0.5 }).code).toBe(
      'VOLUME_NORMAL_RANGE',
    )
    expect(describeVolumeParticipation({ volumeZScore: null }).code).toBe(
      'INSUFFICIENT_DATA',
    )
  })

  it('청산 구간 접근은 추정임을 함께 표현한다', () => {
    const near = describeLiquidationProximity({
      referencePrice: 65000,
      liquidationBelow: 64800,
    })
    expect(near.code).toBe('LIQUIDATION_CLUSTER_NEAR')
    expect(near.detail).toContain('추정')

    const distant = describeLiquidationProximity({
      referencePrice: 65000,
      liquidationBelow: 50000,
    })
    expect(distant.code).toBe('LIQUIDATION_CLUSTER_DISTANT')

    expect(describeLiquidationProximity({ referencePrice: null }).code).toBe(
      'INSUFFICIENT_DATA',
    )
  })

  it('관찰 목록은 데이터 있는 항목만 포함한다', () => {
    expect(buildMarketObservations({})).toEqual([])

    const observations = buildMarketObservations({
      priceChange: 1.5,
      openInterestChange: 2.5,
      volumeZScore: 3.1,
    })
    expect(observations.map((o) => o.code)).toEqual([
      PRICE_OI_SIGNALS.NEW_LONG_INFLOW,
      'LARGE_PARTICIPANT_ACTIVITY',
    ])

    expect(buildMarketObservations({}, { includeInsufficient: true })).toHaveLength(4)
  })

  it('CVD 해석은 가능성만 말하고 방향을 추천하지 않는다', () => {
    expect(describeCvdFlow({ cvd: 10 }).code).toBe(CVD_SIGNALS.BUY_PRESSURE)
    expect(describeCvdFlow({ cvd: -10 }).code).toBe(CVD_SIGNALS.SELL_PRESSURE)
    expect(describeCvdFlow({ cvd: 10, priceChange: 1 }).code).toBe(
      CVD_SIGNALS.PRICE_UP_WITH_BUY,
    )
    expect(describeCvdFlow({ cvd: -10, priceChange: 1 }).code).toBe(
      CVD_SIGNALS.PRICE_UP_WEAK_BUY,
    )
    expect(describeCvdFlow({ cvd: 10 }).leaning).toBe('NONE')
    expect(describeCvdFlow({}).code).toBe(CVD_SIGNALS.INSUFFICIENT_DATA)
  })
})
