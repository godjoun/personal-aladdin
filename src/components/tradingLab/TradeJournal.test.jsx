import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TradeJournalDialog from './TradeJournalDialog.jsx'
import TradeJournalList from './TradeJournalList.jsx'
import ObservationPanel from './ObservationPanel.jsx'
import { JournalOutcome, JournalSnapshot } from './JournalOutcome.jsx'
import { journalForm, journalOutcomeLabel, validateImageFile } from '../../utils/tradeJournalView.js'

describe('Journal interface', () => {
  it('has image/paste entry, scenario tags, nullable risk plans and personal review fields', () => {
    const html = renderToStaticMarkup(<TradeJournalDialog symbol="BTCUSDT" timeframe="4h" />)
    for (const label of ['차트 캡처', '⌘V', '진입 시나리오', '내 진입 근거', 'support OB', 'FVG', '무효화 가격', '손절 기준', 'FOMO 여부', '들어가면 안 되는 이유', '다음에 고칠 한 가지', '가상 기록으로 저장']) expect(html).toContain(label)
    expect(html).toContain('aria-labelledby="journal-dialog-title"')
    expect(html).not.toMatch(/iframe|매수하세요|매도하세요|성공 확률|수익 확률|확정 신호/)
  })
  it('shows empty and API-error states with useful actions', () => {
    const empty = renderToStaticMarkup(<TradeJournalList trades={[]} filter="all" />)
    expect(empty).toContain('첫 시나리오 남기기')
    const error = renderToStaticMarkup(<TradeJournalList trades={[]} filter="all" error="일지를 불러오지 못했습니다." />)
    expect(error).toContain('role="alert"')
    expect(error).toContain('목록 새로고침')
  })
  it('shows both directions, record type, image count and horizon result on clickable records', () => {
    const html = renderToStaticMarkup(<TradeJournalList filter="all" trades={['LONG', 'SHORT'].map((direction) => ({ id: direction, symbol: 'ETHUSDT', direction, recordType: 'IMPULSE', createdAt: '2026-09-13T00:00:00Z', outcome: { return4hPct: 1.25 }, journal: { journalTitle: 'FVG 관찰', reasonTags: ['FVG'], imageCount: 2 } }))} />)
    for (const label of ['가상 LONG', '가상 SHORT', '충동', 'FVG 관찰', '캡처 2장', '+1.25%', '일지 열기']) expect(html).toContain(label)
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
    for (const label of ['1h 후', '4h 후', '12h 후', '24h 후', 'MFE', 'MAE']) expect(result).toContain(label)
    expect(journalForm(null, trade)).toMatchObject({ hasStopPlan: null, hasTargetPlan: null, fomo: null, revision: 0 })
  })
  it('checks clipboard/file format and size before reading the image', () => {
    expect(validateImageFile({ name: 'chart.webp', type: 'image/webp', size: 1000 })).toBeNull()
    expect(validateImageFile({ name: 'chart.svg', type: 'image/svg+xml', size: 1000 })).toBeTruthy()
    expect(validateImageFile({ name: 'chart.png', type: 'image/png', size: 6 * 1024 * 1024 })).toBeTruthy()
  })
})
