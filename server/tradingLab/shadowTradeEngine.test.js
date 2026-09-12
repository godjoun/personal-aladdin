import { describe, expect, it } from 'vitest'
import {
  applyRoundTripCost,
  buildShadowRiskWarnings,
  classifyShadowResult,
  computeMfeMae,
  decideAutoShadowAction,
  evaluateShadowOutcome,
  resolveShadowDedupBucket,
  signedReturnPct,
  SHADOW_TRADE_DISCLAIMER,
} from './shadowTradeEngine.js'

const FORBIDDEN = ['승률', '매수 추천', '매도 추천', '확정 수익', '고래', '세력']

describe('shadowTradeEngine', () => {
  it('LONG/SHORT 수익률을 반대 부호로 계산한다', () => {
    expect(signedReturnPct('LONG', 100, 101)).toBeCloseTo(1)
    expect(signedReturnPct('SHORT', 100, 101)).toBeCloseTo(-1)
    expect(signedReturnPct('SHORT', 2560, 2542.24)).toBeCloseTo(0.69375)
  })

  it('왕복 수수료+슬리피지를 raw return에서 뺀다', () => {
    expect(applyRoundTripCost(1)).toBeCloseTo(0.84)
    expect(applyRoundTripCost(0)).toBeCloseTo(-0.16)
  })

  it('24h 이전에는 UNRESOLVED, 이후 fee-adjusted 로 분류한다', () => {
    expect(classifyShadowResult(0.2, true)).toBe('WIN')
    expect(classifyShadowResult(-0.2, true)).toBe('LOSS')
    expect(classifyShadowResult(0.05, true)).toBe('NEUTRAL')
    expect(classifyShadowResult(1, false)).toBe('UNRESOLVED')
  })

  it('LONG MFE/MAE 는 고가 유리·저가 불리', () => {
    const result = computeMfeMae({
      direction: 'LONG',
      entryPrice: 100,
      fromMs: 0,
      toMs: 1000,
      candles: [
        { timestamp: 100, high: 110, low: 95 },
        { timestamp: 200, high: 108, low: 97 },
      ],
    })
    expect(result.maxFavorableMovePct).toBeCloseTo(10)
    expect(result.maxAdverseMovePct).toBeCloseTo(-5)
  })

  it('SHORT MFE/MAE 는 저가 유리·고가 불리', () => {
    const result = computeMfeMae({
      direction: 'SHORT',
      entryPrice: 100,
      fromMs: 0,
      toMs: 1000,
      candles: [{ timestamp: 100, high: 110, low: 95 }],
    })
    expect(result.maxFavorableMovePct).toBeCloseTo(5)
    expect(result.maxAdverseMovePct).toBeCloseTo(-10)
  })

  it('1h/4h/12h/24h 가격과 수익률을 채운다', () => {
    const createdAt = '2026-09-12T00:00:00.000Z'
    const createdMs = Date.parse(createdAt)
    const candles = [
      { timestamp: createdMs + 60 * 60 * 1000, close: 101, high: 102, low: 99 },
      { timestamp: createdMs + 4 * 60 * 60 * 1000, close: 103, high: 104, low: 100 },
      { timestamp: createdMs + 12 * 60 * 60 * 1000, close: 102, high: 105, low: 98 },
      { timestamp: createdMs + 24 * 60 * 60 * 1000, close: 106, high: 107, low: 97 },
    ]
    const result = evaluateShadowOutcome({
      direction: 'LONG',
      entryPrice: 100,
      createdAt,
      nowMs: createdMs + 24 * 60 * 60 * 1000 + 1,
      currentPrice: 106,
      candles,
    })
    expect(result.return1hPct).toBeCloseTo(1)
    expect(result.return4hPct).toBeCloseTo(3)
    expect(result.return12hPct).toBeCloseTo(2)
    expect(result.return24hPct).toBeCloseTo(6)
    expect(result.feeAdjustedReturnPct).toBeCloseTo(5.84)
    expect(result.result).toBe('WIN')
    expect(result.status).toBe('CLOSED')
    expect(result.maxFavorableMovePct).toBeCloseTo(7)
    expect(result.maxAdverseMovePct).toBeCloseTo(-3)
  })

  it('자동 진입은 강도·4H 반대·청산 주도를 구분한다', () => {
    expect(
      decideAutoShadowAction({
        primaryState: 'BULLISH_PRESSURE',
        strengthScore: 70,
        timeframe4h: 'BULLISH',
      }).action,
    ).toBe('enter')
    expect(
      decideAutoShadowAction({
        primaryState: 'BULLISH_PRESSURE',
        strengthScore: 70,
        timeframe4h: 'BEARISH',
      }).action,
    ).toBe('skip')
    expect(
      decideAutoShadowAction({
        primaryState: 'BEARISH_PRESSURE',
        strengthScore: 64,
        timeframe4h: 'BEARISH',
      }).action,
    ).toBe('skip')
    expect(
      decideAutoShadowAction({
        primaryState: 'SHORT_LIQUIDATION_DRIVEN',
        strengthScore: 80,
        timeframe4h: 'BULLISH',
      }).action,
    ).toBe('observe')
    expect(
      decideAutoShadowAction({
        primaryState: 'LONG_LIQUIDATION_DRIVEN',
        strengthScore: 80,
      }).action,
    ).toBe('observe')
  })

  it('30분 bucket 을 맞춘다', () => {
    expect(resolveShadowDedupBucket('2026-09-12T00:17:00.000Z')).toBe(
      '2026-09-12T00:00:00.000Z',
    )
    expect(resolveShadowDedupBucket('2026-09-12T00:30:00.000Z')).toBe(
      '2026-09-12T00:30:00.000Z',
    )
  })

  it('FOMO 경고만 만들고 차단하지 않는다', () => {
    expect(
      buildShadowRiskWarnings({
        recentClosedResults: ['LOSS', 'LOSS', 'LOSS'],
        sameDirectionCount30m: 3,
        noteEmpty: true,
      }),
    ).toEqual([
      '연속 실패 구간입니다. 실전 진입 검토를 멈추고 복기하세요.',
      '과도한 재진입 패턴 가능성',
      '진입 이유가 비어 있습니다',
    ])
  })

  it('금지 표현을 쓰지 않는다', () => {
    const text = SHADOW_TRADE_DISCLAIMER
    for (const word of FORBIDDEN) {
      expect(text).not.toContain(word)
    }
  })
})
