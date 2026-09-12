import { describe, expect, it } from 'vitest'
import {
  NOT_CONNECTED_LABEL,
  NO_DATA_LABEL,
  buildRecentAnalysisRows,
  formatAnalysisTimestamp,
  formatCompactUsd,
  formatConfidence,
  formatFundingClock,
  formatFundingMetric,
  formatMetric,
  formatObservedLiquidationSide,
  formatRelativeUpdatedAt,
  formatSharePct,
  formatSignedCompactUsd,
  formatSignedValue,
  formatVolumeRatio,
  getBiasLabel,
  getCvdCollectorStatus,
  getCvdInterpretation,
  getMarketStatusLabel,
  getObservedLiquidationStatus,
  getOutcomeLabel,
  getStructureLabel,
  isMarketDataConnected,
  formatSignalStrength,
  getMarketStateLabel,
  getMarketStateModifier,
  getMarketStateShortLabel,
  buildMarketStateHistoryRows,
  formatMarketStateClock,
  MARKET_STATE_DISCLAIMER,
  SHADOW_TRADE_DISCLAIMER,
  SHADOW_QUICK_TAGS,
  formatShadowHorizon,
  formatShadowPrice,
  formatShadowResultShare,
  formatShadowReturnPct,
  getShadowResultLabel,
  getShadowTagLabel,
  splitShadowTrades,
  getStrategyCheckResultLabel,
  formatStrategyScore,
  STRATEGY_CHECK_DISCLAIMER,
} from './tradingLabView.js'

describe('bias / outcome 표시', () => {
  it('bias 라벨을 매핑한다', () => {
    expect(getBiasLabel('LONG')).toBe('LONG BIAS')
    expect(getBiasLabel('SHORT')).toBe('SHORT BIAS')
    expect(getBiasLabel('NEUTRAL')).toBe('NEUTRAL')
    expect(getBiasLabel(null)).toBe(NO_DATA_LABEL)
  })

  it('결과 미기록은 미확정으로 표시한다', () => {
    expect(getOutcomeLabel('SUCCESS')).toBe('성공')
    expect(getOutcomeLabel('FAILURE')).toBe('실패')
    expect(getOutcomeLabel(null)).toBe('미확정')
    expect(getOutcomeLabel('UNKNOWN_VALUE')).toBe('미확정')
  })

  it('confidence 를 퍼센트로 표시한다', () => {
    expect(formatConfidence(63)).toBe('63%')
    expect(formatConfidence(62.6)).toBe('63%')
    expect(formatConfidence(null)).toBe(NO_DATA_LABEL)
  })
})

describe('시장 데이터 미연결 표시', () => {
  it('metric 이 없으면 데이터 연결 전으로 표시한다', () => {
    expect(formatMetric(null)).toBe(NOT_CONNECTED_LABEL)
    expect(formatMetric({ status: 'NOT_CONFIGURED', value: null })).toBe(
      NOT_CONNECTED_LABEL,
    )
    expect(formatMetric({ status: 'ERROR', value: null })).toBe(NOT_CONNECTED_LABEL)
  })

  it('연결되었지만 값이 비어 있으면 빈 값으로 구분한다', () => {
    expect(formatMetric({ status: 'OK', value: null })).toBe(NO_DATA_LABEL)
  })

  it('값이 있으면 포맷한다', () => {
    expect(formatMetric({ status: 'OK', value: 65000 })).toBe('65,000')
    expect(formatMetric({ status: 'OK', value: 2.5 }, { signed: true })).toBe('+2.50')
    expect(
      formatMetric({ status: 'OK', value: -0.0001 }, { signed: true, digits: 4 }),
    ).toBe('-0.0001')
  })

  it('구조 판정 미연결은 데이터 연결 전으로 표시한다', () => {
    expect(getStructureLabel(null)).toBe(NOT_CONNECTED_LABEL)
    expect(getStructureLabel('BULLISH')).toBe('상승 구조 가능성')
    expect(getStructureLabel('RANGE')).toBe('혼조')
    expect(getStructureLabel('BEARISH')).toBe('하락 구조 가능성')
  })

  it('USD 값과 funding percent 를 포맷한다', () => {
    expect(formatMetric({ status: 'OK', value: 65000 }, { usd: true })).toBe('$65,000')
    expect(formatFundingMetric({ status: 'OK', value: 0.0001 })).toBe('+0.0100%')
  })

  it('funding rate 를 퍼센트로 표시한다', () => {
    expect(formatFundingMetric({ status: 'OK', value: 0.0001 })).toBe('+0.0100%')
    expect(formatFundingMetric({ status: 'OK', value: -0.0001 })).toBe('-0.0100%')
    expect(formatFundingMetric({ status: 'NOT_CONFIGURED', value: null })).toBe(
      NOT_CONNECTED_LABEL,
    )
  })

  it('상대 시각과 volume ratio 를 표시한다', () => {
    const now = Date.parse('2026-09-12T12:00:10.000Z')
    expect(formatRelativeUpdatedAt('2026-09-12T12:00:05.000Z', now)).toBe('방금 전')
    expect(formatVolumeRatio(1.8)).toBe('평균 대비 1.8배')
    expect(formatFundingClock('2026-09-12T08:00:00.000Z')).toMatch(/^\d{2}:\d{2}$/)
  })

  it('provider 미설정 상태를 연결 안 됨으로 판정한다', () => {
    expect(isMarketDataConnected(null)).toBe(false)
    expect(isMarketDataConnected({ configured: false, status: 'NOT_CONFIGURED' })).toBe(
      false,
    )
    expect(isMarketDataConnected({ configured: true, status: 'OK' })).toBe(true)

    expect(getMarketStatusLabel({ status: 'NOT_CONFIGURED' })).toBe(NOT_CONNECTED_LABEL)
    expect(getMarketStatusLabel({ status: 'PARTIAL' })).toBe('일부 연결')
    expect(getMarketStatusLabel({ status: 'OK' })).toBe('연결됨')
    expect(getMarketStatusLabel({ status: 'OK', stale: true })).toBe(
      '시장 데이터 일시 지연',
    )
  })
})

describe('formatSignedValue', () => {
  it('부호를 붙여 표시한다', () => {
    expect(formatSignedValue(3.1)).toBe('+3.10')
    expect(formatSignedValue(-3.1)).toBe('-3.10')
    expect(formatSignedValue(0)).toBe('0.00')
    expect(formatSignedValue(null)).toBe(NO_DATA_LABEL)
    expect(formatSignedValue(2, { suffix: '%' })).toBe('+2.00%')
  })

  it('반올림하면 0이 되는 값은 -0.0% 대신 0.0% 로 표시한다', () => {
    expect(formatSignedValue(-0.04, { digits: 1, suffix: '%' })).toBe('0.0%')
    expect(formatSignedValue(0.04, { digits: 1, suffix: '%' })).toBe('0.0%')
    expect(formatSignedValue(-0.05, { digits: 1, suffix: '%' })).toBe('-0.1%')
  })

  it('관측 청산 금액과 상태를 표시한다', () => {
    expect(formatCompactUsd(1_200_000)).toBe('$1.2M')
    expect(formatCompactUsd(800)).toBe('$800')
    expect(formatObservedLiquidationSide({ count: 14, estimatedNotional: 1_200_000 })).toBe(
      '$1.2M · 14건',
    )
    expect(getObservedLiquidationStatus({ connected: true }, { long: { count: 0 }, short: { count: 0 } })).toBe(
      'COLLECTING',
    )
    expect(getObservedLiquidationStatus({ connected: false }, null)).toBe('RECONNECTING')
    expect(getObservedLiquidationStatus({ connected: false }, { long: { count: 2 } })).toBe(
      'HAS_DATA',
    )
  })

  it('CVD 금액/비중/상태와 해석을 표시한다', () => {
    expect(formatSignedCompactUsd(12_400_000)).toBe('+$12.4M')
    expect(formatSignedCompactUsd(-12_400_000)).toBe('-$12.4M')
    expect(formatSharePct(58.4)).toBe('58%')
    expect(getCvdCollectorStatus({ connected: true }, { tradeCount: 0 })).toBe(
      'COLLECTING',
    )
    expect(getCvdCollectorStatus({ connected: false }, { tradeCount: 0 })).toBe(
      'RECONNECTING',
    )
    expect(getCvdCollectorStatus({ connected: true }, { tradeCount: 3 })).toBe(
      'HAS_DATA',
    )
    expect(getCvdInterpretation({ cvd: 100 }).label).toBe(
      '공격적 매수 체결 우세 가능성',
    )
    expect(getCvdInterpretation({ cvd: -100 }).label).toBe(
      '공격적 매도 체결 우세 가능성',
    )
    expect(getCvdInterpretation({ cvd: 100, priceChange: 1 }).label).toBe(
      '가격 상승과 매수 체결이 함께 증가',
    )
    expect(getCvdInterpretation({ cvd: -100, priceChange: 1 }).label).toBe(
      '가격 상승 대비 매수 체결 확인 약함',
    )
    expect(getCvdInterpretation({ cvd: 100 }).label).not.toContain('고래')
    expect(getCvdInterpretation({ cvd: 100 }).label).not.toContain('무조건')
  })
})

describe('formatAnalysisTimestamp', () => {
  it('분 단위까지 표시한다', () => {
    expect(formatAnalysisTimestamp('2026-09-11T23:20:00')).toBe('2026-09-11 23:20')
  })

  it('잘못된 값은 빈 값으로 표시한다', () => {
    expect(formatAnalysisTimestamp(null)).toBe(NO_DATA_LABEL)
    expect(formatAnalysisTimestamp('not-a-date')).toBe(NO_DATA_LABEL)
  })
})

describe('시장 상태 표시', () => {
  it('상태 라벨과 신호 강도를 확률로 표현하지 않는다', () => {
    expect(getMarketStateLabel('BULLISH_PRESSURE')).toBe('상승 압력 확대 가능성')
    expect(getMarketStateShortLabel('MIXED')).toBe('혼조')
    expect(getMarketStateModifier('NEW_LONG_BUILDUP')).toBe('bullish')
    expect(formatSignalStrength(68)).toBe('신호 강도 68 / 100')
    expect(formatSignalStrength(68).includes('%')).toBe(false)
    expect(MARKET_STATE_DISCLAIMER).toContain('매수·매도 추천이 아닙니다')
  })

  it('최근 시장 상태 이력을 시계열 행으로 만든다', () => {
    const rows = buildMarketStateHistoryRows([
      {
        id: '1',
        primaryState: 'BULLISH_PRESSURE',
        strengthScore: 68,
        evaluatedAt: '2026-09-12T02:35:00.000Z',
      },
      {
        id: '2',
        primaryState: 'MIXED',
        strengthScore: 51,
        evaluatedAt: '2026-09-12T02:30:00.000Z',
      },
    ])
    expect(rows[0].stateLabel).toBe('상승 압력')
    expect(rows[0].strength).toBe(68)
    expect(rows[0].timeLabel).toBe(
      formatMarketStateClock('2026-09-12T02:35:00.000Z'),
    )
    expect(buildMarketStateHistoryRows(null)).toEqual([])
  })
})

describe('buildRecentAnalysisRows', () => {
  it('목록 행을 구성한다', () => {
    const rows = buildRecentAnalysisRows([
      {
        id: 'a1',
        symbol: 'ETHUSDT',
        bias: 'LONG',
        confidence: 63,
        createdAt: '2026-09-11T23:20:00',
        outcome: { result: 'SUCCESS' },
      },
      {
        id: 'a2',
        symbol: 'BTCUSDT',
        bias: 'NEUTRAL',
        confidence: 51,
        createdAt: '2026-09-11T22:00:00',
        outcome: null,
      },
    ])

    expect(rows[0]).toEqual({
      id: 'a1',
      symbol: 'ETHUSDT',
      biasLabel: 'LONG BIAS',
      biasModifier: 'long',
      confidenceLabel: '63%',
      createdAtLabel: '2026-09-11 23:20',
      outcomeLabel: '성공',
      hasOutcome: true,
    })
    expect(rows[1].outcomeLabel).toBe('미확정')
    expect(rows[1].hasOutcome).toBe(false)
  })

  it('배열이 아니면 빈 목록을 반환한다', () => {
    expect(buildRecentAnalysisRows(null)).toEqual([])
  })
})

describe('Shadow Trading 표시', () => {
  it('가상 결과 라벨과 가격을 표시한다', () => {
    expect(getShadowResultLabel('WIN')).toBe('WIN')
    expect(getShadowTagLabel('support_ob')).toBe('support OB')
    expect(getShadowTagLabel('fomo')).toBe('FOMO')
    expect(getShadowTagLabel('has_stop')).toBe('손절 기준 있음')
    expect(getShadowTagLabel('has_target')).toBe('목표 기준 있음')
    expect(SHADOW_QUICK_TAGS).toEqual([
      'support',
      'resistance',
      'support_ob',
      'resistance_ob',
      'fvg',
      'trendline',
      'fakeout',
      'liquidity_sweep',
      'fomo',
      'has_stop',
      'has_target',
    ])
    expect(SHADOW_QUICK_TAGS).not.toContain('volume_divergence')
    expect(formatShadowPrice(2560)).toBe('$2,560')
    expect(formatShadowReturnPct(0.7)).toBe('+0.7%')
    expect(formatShadowHorizon(null, '1h')).toBe('1h 대기')
    expect(formatShadowHorizon({ return1hPct: 0.4 }, '1h')).toBe('1h +0.4%')
    expect(SHADOW_TRADE_DISCLAIMER).toContain('가상 계산')
    expect(SHADOW_TRADE_DISCLAIMER).not.toMatch(/승률|매수 추천|매도 추천/)
  })

  it('진행/완료를 나누고 승률 대신 완료 결과 비율을 쓴다', () => {
    const split = splitShadowTrades([
      { id: '1', status: 'OPEN' },
      { id: '2', status: 'CLOSED' },
      { id: '3', status: 'EVALUATING' },
    ])
    expect(split.open.map((item) => item.id)).toEqual(['1', '3'])
    expect(split.closed.map((item) => item.id)).toEqual(['2'])
    expect(formatShadowResultShare({ resultShare: { WIN: 1, LOSS: 2, NEUTRAL: 0 } })).toBe(
      '완료 결과 비율 WIN 1 · LOSS 2 · NEUTRAL 0',
    )
    expect(formatShadowResultShare({ resultShare: { WIN: 1, LOSS: 2, NEUTRAL: 0 } })).not.toMatch(
      /승률/,
    )
  })

  it('My Strategy 결과는 기준 충족도로 표시한다', () => {
    expect(getStrategyCheckResultLabel('READY')).toBe('기준 충족')
    expect(getStrategyCheckResultLabel('NOT_READY')).toBe('기준 부족')
    expect(getStrategyCheckResultLabel('RISK_HIGH')).toBe('리스크 높음')
    expect(formatStrategyScore({ score: 62 })).toBe('62 / 100')
    expect(STRATEGY_CHECK_DISCLAIMER).toContain('기준 점검')
    expect(STRATEGY_CHECK_DISCLAIMER).not.toMatch(/승률|수익 확률/)
  })
})
