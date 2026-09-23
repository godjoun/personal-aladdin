import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  UpbitClosedTable,
  UpbitTradeCard,
} from './UpbitRealTradesPanel.jsx'
import {
  sortUpbitTrades,
  summarizeUpbitTrades,
  upbitTradePnl,
} from '../../utils/upbitTradeView.js'

const openTrade = {
  id: 'open-1',
  market: 'KRW-BTC',
  status: 'OPEN',
  openedAt: '2026-09-21T00:00:00Z',
  closedAt: null,
  averageEntryPrice: 1_000,
  averageExitPrice: null,
  boughtQuantity: 2,
  soldQuantity: 0,
  remainingQuantity: 2,
  grossBuyAmount: 2_000,
  grossSellAmount: 0,
  buyFees: 1,
  sellFees: 0,
  realizedPnl: 0,
  realizedPnlPct: null,
}

const closedTrade = {
  ...openTrade,
  id: 'closed-1',
  market: 'KRW-ETH',
  status: 'CLOSED',
  closedAt: '2026-09-21T04:00:00Z',
  averageExitPrice: 900,
  remainingQuantity: 0,
  soldQuantity: 2,
  grossSellAmount: 1_800,
  sellFees: 1,
  realizedPnl: -202,
  realizedPnlPct: -10.1,
}

describe('UpbitRealTradesPanel cards', () => {
  it('OPEN 거래의 현재 평가손익과 핵심 보유 정보를 강조한다', () => {
    const html = renderToStaticMarkup(
      <UpbitTradeCard
        trade={openTrade}
        quote={{ market: 'KRW-BTC', tradePrice: 1_200 }}
        lastSyncAt="2026-09-21T05:00:00Z"
      />,
    )
    expect(html).toContain('보유 중')
    expect(html).toContain('현재 평가손익')
    expect(html).toContain('400원')
    expect(html).toContain('+20.00%')
    expect(html).toContain('BTC/KRW')
    for (const label of ['평균 진입가', '매수금액', '남은 수량', '보유시간']) expect(html).toContain(label)
    expect(html).toContain('lab-upbit-card--open')
    expect(html).toContain('lab-upbit-pnl--profit')
  })

  it('CLOSED 거래의 실현손익과 복기 중심 정보를 표시한다', () => {
    const html = renderToStaticMarkup(
      <UpbitTradeCard trade={closedTrade} lastSyncAt="2026-09-21T05:00:00Z" />,
    )
    expect(html).toContain('종료')
    expect(html).toContain('실현손익')
    expect(html).toContain('-202원')
    expect(html).toContain('-10.10%')
    expect(html).toContain('ETH/KRW')
    for (const label of ['평균 진입가', '평균 청산가', '매수금액', '보유시간', '상세 보기']) expect(html).toContain(label)
    expect(html).toContain('lab-upbit-card--closed')
    expect(html).toContain('lab-upbit-pnl--loss')
  })

  it('CLOSED 카드에 복기 미작성 / 복기 완료 배지를 표시한다', () => {
    const pending = renderToStaticMarkup(
      <UpbitTradeCard trade={{ ...closedTrade, review: { reminderState: 'LATER', reasonTags: [] } }} />,
    )
    const done = renderToStaticMarkup(
      <UpbitTradeCard trade={{ ...closedTrade, review: { reminderState: 'COMPLETED', reasonTags: ['FVG'] } }} />,
    )
    const open = renderToStaticMarkup(<UpbitTradeCard trade={openTrade} />)
    expect(pending).toContain('복기 미작성')
    expect(done).toContain('복기 완료')
    expect(open).not.toContain('복기 미작성')
    expect(open).not.toContain('복기 완료')
  })

  it('상세 정보는 기본 접힘이며 요청 시 펼친 상태로 렌더링한다', () => {
    const collapsed = renderToStaticMarkup(<UpbitTradeCard trade={closedTrade} />)
    const expanded = renderToStaticMarkup(<UpbitTradeCard trade={closedTrade} detailsOpen />)
    expect(collapsed).toContain('<details class="lab-upbit-card__details">')
    expect(collapsed).not.toContain('<details class="lab-upbit-card__details" open="">')
    expect(expanded).toContain('<details class="lab-upbit-card__details" open="">')
    for (const label of ['상세 닫기', '매도금액', '총 수수료', '진입 시각', '청산 시각', '마지막 동기화', '누적 매수 체결', '누적 매도 체결']) {
      expect(expanded).toContain(label)
    }
  })

  it('UNKNOWN_BASIS는 계산된 것처럼 보이는 손익을 표시하지 않는다', () => {
    const html = renderToStaticMarkup(<UpbitTradeCard trade={{
      ...closedTrade,
      id: 'unknown-1',
      status: 'UNKNOWN_BASIS',
      averageEntryPrice: null,
      realizedPnl: 999,
      realizedPnlPct: 9.99,
    }} />)
    expect(html).toContain('매수 원가 확인 불가')
    expect(html).toContain('lab-upbit-pnl--unknown')
    expect(html).not.toContain('999원')
    expect(html).not.toContain('+9.99%')
  })

  it('종료 포지션은 데스크톱용 compact table로 종목·손익·복기·상세를 보여 준다', () => {
    const html = renderToStaticMarkup(
      <UpbitClosedTable
        trades={[
          { ...closedTrade, review: { reminderState: 'LATER', reasonTags: [] } },
          { ...closedTrade, id: 'closed-2', market: 'KRW-XRP', realizedPnl: 50, realizedPnlPct: 2.5, review: { reminderState: 'COMPLETED', reasonTags: [] } },
        ]}
      />,
    )
    for (const label of ['종목', '실현손익', '수익률', '평균 매수가', '평균 매도가', '보유시간', '종료일시', '복기 상태', '상세', '복기 미작성', '복기 완료', 'ETH/KRW', 'XRP/KRW', '상세 보기']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('lab-upbit-closed-table')
    expect(html).toContain('lab-upbit-pnl--loss')
    expect(html).toContain('lab-upbit-pnl--profit')
  })

  it('OPEN을 먼저, CLOSED는 최근 종료 순으로 정렬하고 요약한다', () => {
    const olderClosed = { ...closedTrade, id: 'closed-older', closedAt: '2026-09-20T04:00:00Z', realizedPnl: 100 }
    const sorted = sortUpbitTrades([olderClosed, closedTrade, openTrade])
    expect(sorted.map((trade) => trade.id)).toEqual(['open-1', 'closed-1', 'closed-older'])
    expect(summarizeUpbitTrades(sorted)).toEqual({
      total: 3,
      openCount: 1,
      closedCount: 2,
      totalRealizedPnl: -102,
    })
    expect(upbitTradePnl(openTrade, { tradePrice: 800 })).toMatchObject({ amount: -400, rate: -20, tone: 'loss' })
  })
})
