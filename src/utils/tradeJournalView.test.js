import { describe, expect, it } from 'vitest'
import {
  calculateEntryPlanMetrics,
  formatPlanPct,
  formatRewardRisk,
  joinReviewNotes,
  journalMaeSummary,
  journalPricePlanSummary,
  journalRecordTypeLabel,
  journalReviewSummary,
  journalRiskSummary,
  journalStatusLabel,
  splitReviewNotes,
} from './tradeJournalView.js'

describe('journal review presentation', () => {
  it('keeps legacy reviewText intact and stores unfold notes without a schema change', () => {
    expect(splitReviewNotes('판단만 남김')).toEqual({ judgment: '판단만 남김', unfold: '' })
    expect(joinReviewNotes('판단', '전개')).toContain('[실제 전개]')
    expect(splitReviewNotes(joinReviewNotes('판단', '전개'))).toEqual({ judgment: '판단', unfold: '전개' })
  })
  it('summarizes risk, review, record type and tracking status for cards', () => {
    expect(journalRecordTypeLabel('IMPULSE')).toBe('충동 기록')
    expect(journalRiskSummary({ invalidationPrice: null, hasStopPlan: null })).toBe('손절 기준 부족 · 무효화 가격 미입력')
    expect(journalRiskSummary({ takeProfitPrice: 110, stopLossPrice: 95, invalidationPrice: 94 })).toContain('TP')
    expect(journalReviewSummary({ reviewText: '근거는 맞았다' })).toBe('근거는 맞았다')
    expect(journalReviewSummary({})).toBe('아직 복기 메모 없음')
    const trade = { createdAt: '2026-09-13T00:00:00Z', journal: {}, outcome: {} }
    expect(journalStatusLabel(trade, Date.parse('2026-09-13T00:30:00Z'))).toBe('1h 추적 대기')
    expect(journalStatusLabel({ ...trade, outcome: { return4hPct: 0.8 } }, Date.parse('2026-09-13T05:00:00Z'))).toBe('복기 필요')
    expect(journalStatusLabel({ ...trade, journal: { reviewedAt: '2026-09-13T06:00:00Z' }, outcome: { return4hPct: 0.8 } })).toBe('복기 완료')
    expect(journalMaeSummary({ outcome: { maxAdverseMovePct: -1.2 } })).toBe('먼저 -1.20%까지 흔들림')
  })
  it('calculates LONG/SHORT RR and warns on inverted price structure without inventing values', () => {
    const long = calculateEntryPlanMetrics({ direction: 'LONG', entryPrice: 77250, takeProfitPrice: 78100, stopLossPrice: 76900 })
    expect(long.rewardPct).toBeCloseTo(1.1003, 3)
    expect(long.riskPct).toBeCloseTo(0.4534, 3)
    expect(long.rewardRiskRatio).toBeCloseTo(2.426, 2)
    expect(formatRewardRisk(long.rewardRiskRatio)).toBe('1:2.43')
    expect(formatPlanPct(long.rewardPct, { signed: true })).toBe('+1.10%')
    expect(formatPlanPct(long.riskPct, { loss: true })).toBe('-0.45%')
    const short = calculateEntryPlanMetrics({ direction: 'SHORT', entryPrice: 100, takeProfitPrice: 90, stopLossPrice: 105 })
    expect(short).toMatchObject({ rewardPct: 10, riskPct: 5, rewardRiskRatio: 2, structureWarning: null })
    expect(calculateEntryPlanMetrics({ direction: 'LONG', entryPrice: 100, takeProfitPrice: 90, stopLossPrice: 95 }).structureWarning).toBe('가격 구조 확인 필요')
    expect(calculateEntryPlanMetrics({ direction: 'LONG', entryPrice: 100 }).rewardRiskRatio).toBeNull()
    expect(journalPricePlanSummary({ entryPrice: 100, journal: {} })).toBe('가격 계획 미입력')
    expect(journalPricePlanSummary({ journal: { takeProfitPrice: 110, stopLossPrice: 95 }, entryPrice: 100 })).toContain('RR 1:2.00')
    expect(journalPricePlanSummary({ journal: { entryPrice: 100, takeProfitPrice: 110, stopLossPrice: 95 }, direction: 'LONG' })).toBe('Entry 100 · TP 110 · SL 95 · RR 1:2.00')
    expect(journalPricePlanSummary({ journal: {} })).toBe('가격 계획 미입력')
  })
})
