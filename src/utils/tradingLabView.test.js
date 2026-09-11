import { describe, expect, it } from 'vitest'
import {
  NOT_CONNECTED_LABEL,
  NO_DATA_LABEL,
  buildRecentAnalysisRows,
  formatAnalysisTimestamp,
  formatConfidence,
  formatFundingClock,
  formatFundingMetric,
  formatMetric,
  formatRelativeUpdatedAt,
  formatSignedValue,
  formatVolumeRatio,
  getBiasLabel,
  getMarketStatusLabel,
  getOutcomeLabel,
  getStructureLabel,
  isMarketDataConnected,
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
