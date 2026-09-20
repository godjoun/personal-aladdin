import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TradeJournalDialog from './TradeJournalDialog.jsx'
import TradeJournalList from './TradeJournalList.jsx'
import ObservationPanel from './ObservationPanel.jsx'
import { JournalOutcome, JournalSnapshot } from './JournalOutcome.jsx'
import { journalForm, journalOutcomeLabel, validateImageFile } from '../../utils/tradeJournalView.js'

const sampleTrade = (overrides = {}) => ({
  id: 'long-1', symbol: 'BTCUSDT', direction: 'LONG', recordType: 'OBSERVATION', createdAt: '2026-09-13T09:42:00Z',
  entryPrice: 100,
  outcome: { return4hPct: 0.8, maxAdverseMovePct: -1.2 },
  journal: {
    journalTitle: '첫 매매일지', scenarioText: '4H 저항 구간 근처, liquidity sweep 이후 단기 반등 가능성 관찰.',
    entryReasonText: 'FVG 반응 확인 후 가상 LONG', reasonTags: ['liquidity sweep', 'FVG', 'resistance'],
    chartLocationText: '4H 박스권 하단 근처', marketStructureText: '고점은 낮아지고 있지만 저점은 아직 유지',
    conclusionText: '하단 재터치 후 15m 회복 확인 시 LONG 관찰',
    riskPlanText: '76500 봉 마감 시 재검토', invalidationPrice: null, entryPrice: 100, takeProfitPrice: 110, stopLossPrice: 95,
    leverage: 10, marginMode: 'ISOLATED', marginAmount: 100, positionSize: 1000, liquidationPrice: 69800,
    hasStopPlan: null, fomo: true,
    reviewText: '판단은 성급했다', mistakeText: '충돌 신호를 늦게 봄', lessonText: '봉 마감 후 기록',
    emotionTag: '조급함', imageCount: 1, coverImageUrl: '/api/trading-lab/journals/j1/images/img1',
  },
  ...overrides,
})

describe('Journal interface', () => {
  it('has image/paste entry, scenario tags, nullable risk plans and personal review fields', () => {
    const html = renderToStaticMarkup(<TradeJournalDialog symbol="BTCUSDT" timeframe="4h" />)
    for (const label of ['캡처와 근거', '⌘V', '진입 전 사고 과정', '현재 위치', '지지 / 저항', '시장 구조', '추세', '거래량', '추가 근거', '내 결론', '진입 요약', 'Entry', 'TP', 'SL', 'RR', '레버리지', '마진 방식', '증거금', '포지션 크기', '청산가', 'Scenario', 'Risk Plan', '진입 시나리오', '진입 근거', 'support OB', 'FVG', '무효화 가격', '손절 기준', 'FOMO 여부', '들어가면 안 되는 이유', '내 판단이 맞았나?', '실제 전개는 어땠나?', '놓친 점은 무엇인가?', '다음에는 무엇을 바꿀 것인가?', '가상 기록으로 저장']) expect(html).toContain(label)
    expect(html).toContain('aria-labelledby="journal-dialog-title"')
    expect(html).toContain('캡처 없음')
    expect(html.indexOf('진입 전 사고 과정')).toBeLessThan(html.indexOf('진입 요약'))
    expect(html.indexOf('진입 요약')).toBeLessThan(html.indexOf('리스크 계획'))
    expect(html).not.toMatch(/iframe|매수하세요|매도하세요|성공 확률|수익 확률|확정 신호|분석 완료/)
  })
  it('shows empty and API-error states with useful actions', () => {
    const empty = renderToStaticMarkup(<TradeJournalList trades={[]} filter="all" />)
    expect(empty).toContain('첫 시나리오 남기기')
    expect(empty).toContain('캡처와 근거')
    const error = renderToStaticMarkup(<TradeJournalList trades={[]} filter="all" error="일지를 불러오지 못했습니다." />)
    expect(error).toContain('role="alert"')
    expect(error).toContain('목록 새로고침')
  })
  it('renders review cards with thumbnail, summaries, tags, record type and outcome status', () => {
    const html = renderToStaticMarkup(<TradeJournalList filter="all" trades={[
      sampleTrade(),
      sampleTrade({ id: 'short-1', symbol: 'ETHUSDT', direction: 'SHORT', recordType: 'IMPULSE', journal: { journalTitle: 'FVG 관찰', reasonTags: ['FVG'], imageCount: 0, coverImageUrl: null } }),
    ]} />)
    for (const label of ['가상 LONG', '가상 SHORT', '관찰 기록', '충동 기록', '첫 매매일지', 'FVG 관찰', '캡처 없음', '진입 시나리오', '리스크 계획', '무효화 가격 미입력', '아직 복기 메모 없음', 'liquidity sweep', '4h 후 +0.80%', '먼저 -1.20%까지 흔들림', '일지 열기', '복기 필요', 'Entry 100', 'TP 110', 'SL 95', 'RR 1:2.00', '10x · Isolated · 증거금 100 USDT · 포지션 1,000 USDT', '가격 계획 미입력', '내 결론', '하단 재터치 후 15m 회복 확인 시 LONG 관찰', '구조', '고점은 낮아지고 있지만 저점은 아직 유지']) expect(html).toContain(label)
    expect(html).toContain('/api/trading-lab/journals/j1/images/img1')
    expect(html).toContain('판단은 성급했다')
    expect(html).toContain('봉 마감 후 기록')
    expect(html).toContain('FOMO')
    expect(html).not.toMatch(/성공 확률|수익 확률|매수하세요|실제 진입/)
  })
  it('summarizes observation as evidence and conflicts without presenting certainty', () => {
    const html = renderToStaticMarkup(<ObservationPanel state={{ primaryState: 'NEW_LONG_BUILDUP', evidence: ['가격 상승', 'OI 증가', '거래량 증가', '숨겨진 네 번째 근거'], counterEvidence: ['CVD 충돌'] }} />)
    expect(html).toContain('현재 관찰 근거')
    expect(html).toContain('신규 롱 유입 가능성')
    expect(html).toContain('다음 확인 하나')
    expect(html).not.toContain('숨겨진 네 번째 근거')
    expect(html).not.toMatch(/성공 확률|수익 확률|매수하세요|매도하세요/)
  })
  it('keeps unavailable historical metrics nullable and distinguishes not-yet-due from missing data', () => {
    const html = renderToStaticMarkup(<JournalSnapshot snapshot={{ kind: 'HISTORICAL_PARTIAL', indicators: null }} />)
    expect(html).toContain('현재 값으로 채우지 않습니다')
    expect(html).toContain('데이터 없음')
    const trade = { direction: 'LONG', createdAt: '2026-09-13T00:00:00Z', outcome: {} }
    expect(journalOutcomeLabel(trade, '4h', Date.parse('2026-09-13T01:00:00Z'))).toBe('추적 대기')
    expect(journalOutcomeLabel(trade, '4h', Date.parse('2026-09-13T05:00:00Z'))).toBe('데이터 대기')
    const result = renderToStaticMarkup(<JournalOutcome trade={trade} />)
    for (const label of ['시간별 결과', '1h', '4h', '12h', '24h', 'MFE', 'MAE', '추적 대기']) expect(result).toContain(label)
    expect(journalForm(null, trade)).toMatchObject({ hasStopPlan: null, hasTargetPlan: null, fomo: null, revision: 0, unfoldText: '' })
  })
  it('renders entry summary after thinking notes with Entry / TP / SL / leverage inputs', () => {
    const html = renderToStaticMarkup(<TradeJournalDialog symbol="BTCUSDT" timeframe="1h" />)
    expect(html.indexOf('캡처 없음')).toBeLessThan(html.indexOf('진입 전 사고 과정'))
    expect(html.indexOf('진입 전 사고 과정')).toBeLessThan(html.indexOf('진입 요약'))
    expect(html).toContain('Entry')
    expect(html).toContain('손절가 · SL / SP')
    expect(html).toContain('레버리지')
    expect(html).toContain('청산가')
    expect(html).toContain('미입력')
    expect(html).not.toContain('가격 구조 확인 필요')
    expect(html).not.toContain('레버리지 반영 값은 수수료')
    expect(html).not.toMatch(/성공 확률|수익 확률|실제 주문 실행|자동매매|Bybit private/)
  })
  it('keeps thinking-process fields empty by default and maps saved notes into the form', () => {
    expect(journalForm(null, null)).toMatchObject({
      chartLocationText: '', supportResistanceText: '', marketStructureText: '',
      trendText: '', volumeText: '', conclusionText: '', reasonTags: [],
    })
    expect(journalForm({
      chartLocationText: '4H 하단', marketStructureText: '저점 유지', conclusionText: 'LONG 관찰', reasonTags: ['FVG'],
    }, null)).toMatchObject({
      chartLocationText: '4H 하단', marketStructureText: '저점 유지', conclusionText: 'LONG 관찰', reasonTags: ['FVG'],
    })
  })
  it('checks clipboard/file format and size before reading the image', () => {
    expect(validateImageFile({ name: 'chart.webp', type: 'image/webp', size: 1000 })).toBeNull()
    expect(validateImageFile({ name: 'chart.svg', type: 'image/svg+xml', size: 1000 })).toBeTruthy()
    expect(validateImageFile({ name: 'chart.png', type: 'image/png', size: 6 * 1024 * 1024 })).toBeTruthy()
  })
})
