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
  SHADOW_REVIEW_TITLE,
  SHADOW_REVIEW_HINT,
  SHADOW_AUTO_MODE_LABEL,
  STRATEGY_RECORD_HINT,
  formatShadowHorizon,
  formatShadowPrice,
  formatShadowResultShare,
  formatShadowReturnPct,
  getShadowResultLabel,
  getShadowTagLabel,
  formatShadowDirectionLabel,
  splitShadowTrades,
  getStrategyCheckResultLabel,
  formatStrategyScore,
  STRATEGY_CHECK_DISCLAIMER,
  STRATEGY_PANEL_TITLE,
  COMMAND_CENTER_TITLE,
  COMMAND_ROUTINE_TITLE,
  MARKET_DATA_TITLE,
  MARKET_ENGINE_TITLE,
  MARKET_FLOW_TITLE,
  MARKET_LIQUIDATION_TITLE,
  classifyShadowRecordType,
  getCommandStatus,
  getShadowRecordTypeLabel,
  getStrategyActionLabel,
  getStrategyDisplayResult,
  getStrategyPrimaryIssue,
  getStrategyReviewLabel,
  summarizeShadowReview,
  CHART_TIMEFRAMES,
  CHART_VIEW_TITLE,
  CHART_VIEW_DISCLAIMER,
  toUnixSeconds,
  toChartCandles,
  snapUnixSecondsToCandleTime,
  buildShadowEntryMarkers,
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
    expect(STRATEGY_PANEL_TITLE).toBe('내 진입 기준')
    expect(STRATEGY_PANEL_TITLE).not.toBe('My Strategy v1')
    expect(getStrategyCheckResultLabel('READY')).toBe('기준 충족')
    expect(getStrategyCheckResultLabel('NOT_READY')).toBe('기준 부족')
    expect(getStrategyCheckResultLabel('RISK_HIGH')).toBe('리스크 높음')
    expect(getStrategyCheckResultLabel('DATA_INSUFFICIENT')).toBe('데이터 부족')
    expect(formatStrategyScore({ score: 62 })).toBe('62 / 100')
    expect(STRATEGY_CHECK_DISCLAIMER).toContain('기준 점검')
    expect(STRATEGY_CHECK_DISCLAIMER).not.toMatch(/승률|수익 확률|매수하세요|매도하세요/)
    expect(getStrategyActionLabel('READY', 'LONG')).toBe('가상 기록 가능')
    expect(getStrategyReviewLabel('READY', 'LONG')).toBe('LONG 검토 가능')
    expect(getStrategyReviewLabel('READY', 'SHORT')).toBe('SHORT 검토 가능')
    expect(getStrategyActionLabel('NOT_READY')).toBe('추가 확인')
    expect(getStrategyActionLabel('RISK_HIGH')).toBe('리스크 높음')
    expect(getStrategyActionLabel('DATA_INSUFFICIENT')).toBe('대기')
    expect(getStrategyPrimaryIssue({
      selectedTags: ['fomo'],
      missingItems: ['손절 기준이 없습니다.'],
      riskWarnings: ['FOMO 태그가 선택되어 있습니다.'],
    })).toBe('FOMO 태그 있음')
    expect(getStrategyPrimaryIssue({
      selectedTags: [],
      missingItems: ['4H 구조가 아직 명확히 상승이 아닙니다.'],
    })).toBe('4H 방향 불명확')
    expect(getStrategyDisplayResult({
      result: 'NOT_READY',
      autoEvidence: {},
    })).toBe('DATA_INSUFFICIENT')
    expect(getStrategyCheckResultLabel('DATA_INSUFFICIENT')).toBe('데이터 부족')
  })

  it('복기 섹션은 독립 1초 기록이 아니라 가상 기록 조회용이다', () => {
    expect(SHADOW_REVIEW_TITLE).toBe('가상 기록 / 복기')
    expect(SHADOW_REVIEW_TITLE).not.toBe('Shadow Trading')
    expect(SHADOW_REVIEW_HINT).toContain('기준 체크 기반 가상 기록')
    expect(SHADOW_REVIEW_HINT).toContain('실제 주문은 없습니다')
    expect(SHADOW_REVIEW_HINT).not.toMatch(/1초 기록|가상 LONG 1초|가상 SHORT 1초/)
    expect(SHADOW_AUTO_MODE_LABEL).toBe('자동 기록')
    expect(STRATEGY_RECORD_HINT).toBe('기준 체크 기반 가상 기록 · 실제 주문 없음')
    expect(formatShadowDirectionLabel('LONG')).toBe('가상 LONG 기록')
    expect(formatShadowDirectionLabel('SHORT')).toBe('가상 SHORT 기록')
    expect(formatShadowDirectionLabel('LONG')).not.toBe('LONG')
    expect(formatShadowDirectionLabel('SHORT')).not.toBe('SHORT')
  })

  it('Command Center 와 화면 표시명을 사용자 흐름에 맞춘다', () => {
    expect(COMMAND_CENTER_TITLE).toBe('오늘의 ALADDIN')
    expect(COMMAND_ROUTINE_TITLE).toBe('오늘의 ALADDIN 루틴')
    expect(MARKET_DATA_TITLE).toBe('시장 데이터')
    expect(MARKET_ENGINE_TITLE).toBe('시장 상태')
    expect(MARKET_FLOW_TITLE).toBe('수급 확인')
    expect(MARKET_LIQUIDATION_TITLE).toBe('청산 확인')
    expect(CHART_VIEW_TITLE).toBe('시장 차트')
    expect(getCommandStatus(null).label).toBe('대기')
    expect(getCommandStatus({ result: 'READY', autoEvidence: { structure4h: 'BULLISH' } }).label).toBe(
      '검토 가능',
    )
    expect(getCommandStatus({ result: 'RISK_HIGH' }).label).toBe('리스크 높음')
    expect(getCommandStatus({ result: 'NOT_READY', autoEvidence: { structure4h: 'RANGE' } }).label).toBe(
      '기준 부족',
    )
    expect(JSON.stringify(COMMAND_CENTER_TITLE)).not.toMatch(/매수하세요|매도하세요|승률/)
  })

  it('가상 기록을 기준/충동/관찰로 분류한다', () => {
    expect(
      classifyShadowRecordType({
        result: 'READY',
        selectedTags: ['support', 'has_stop', 'has_target'],
        score: 82,
      }),
    ).toBe('STRATEGY')
    expect(
      classifyShadowRecordType({
        result: 'RISK_HIGH',
        selectedTags: ['support', 'has_stop', 'has_target', 'fomo'],
        score: 80,
      }),
    ).toBe('IMPULSE')
    expect(
      classifyShadowRecordType({
        result: 'NOT_READY',
        selectedTags: ['support', 'has_stop', 'has_target'],
        score: 60,
      }),
    ).toBe('OBSERVATION')
    expect(getShadowRecordTypeLabel('STRATEGY')).toBe('기준 기록')
    expect(getShadowRecordTypeLabel('IMPULSE')).toBe('충동 기록')
    expect(getShadowRecordTypeLabel('OBSERVATION')).toBe('관찰 기록')
    expect(
      summarizeShadowReview([
        { status: 'OPEN', recordType: 'STRATEGY', userTags: ['has_stop'] },
        { status: 'CLOSED', recordType: 'IMPULSE', userTags: ['fomo'] },
      ]).reviewCount,
    ).toBe(1)
  })

  it('Chart View 는 15m/1h/4h 캔들과 가상 진입 마커만 만든다', () => {
    expect(CHART_VIEW_TITLE).toBe('시장 차트')
    expect(CHART_TIMEFRAMES).toEqual(['15m', '1h', '4h'])
    expect(CHART_VIEW_DISCLAIMER).toContain('실제 주문은 없습니다')
    expect(CHART_VIEW_DISCLAIMER).not.toMatch(/승률|매수·매도 추천|자동매매/)

    expect(toUnixSeconds(1_700_000_000_000)).toBe(1_700_000_000)
    expect(toUnixSeconds('2023-11-14T22:13:20.000Z')).toBe(1_700_000_000)

    const candles = toChartCandles([
      { timestamp: 1_700_000_900_000, open: 3, high: 4, low: 2, close: 3.5 },
      { timestamp: 1_700_000_000_000, open: 1, high: 2, low: 0.5, close: 1.5 },
      { timestamp: 1_700_000_450_000, open: 2, high: 3, low: 1, close: 2.5 },
    ])
    expect(candles.map((row) => row.time)).toEqual([
      1_700_000_000, 1_700_000_450, 1_700_000_900,
    ])

    expect(snapUnixSecondsToCandleTime(1_699_999_000, candles.map((row) => row.time))).toBeNull()
    expect(snapUnixSecondsToCandleTime(1_700_000_500, candles.map((row) => row.time))).toBe(
      1_700_000_450,
    )

    const markers = buildShadowEntryMarkers(
      [
        {
          symbol: 'BTCUSDT',
          direction: 'LONG',
          createdAt: '2023-11-14T22:20:50.000Z',
          entryPrice: 65000,
        },
        {
          symbol: 'ETHUSDT',
          direction: 'SHORT',
          createdAt: '2023-11-14T22:20:50.000Z',
          entryPrice: 3500,
        },
        {
          symbol: 'BTCUSDT',
          direction: 'SHORT',
          createdAt: '2023-11-14T22:28:20.000Z',
          entryPrice: 64900,
        },
      ],
      candles,
      'BTCUSDT',
    )
    expect(markers).toHaveLength(2)
    expect(markers[0]).toMatchObject({
      time: 1_700_000_450,
      shape: 'arrowUp',
      text: '가상 LONG',
    })
    expect(markers[1]).toMatchObject({
      time: 1_700_000_900,
      shape: 'arrowDown',
      text: '가상 SHORT',
    })
    expect(JSON.stringify(markers)).not.toMatch(/주문|승률/)
  })
})
