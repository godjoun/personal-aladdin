import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChartViewPanel from './ChartViewPanel.jsx'

describe('ChartViewPanel', () => {
  it('시장 차트 섹션과 15m/1h/4h 전환 버튼을 렌더링한다', () => {
    const html = renderToStaticMarkup(
      <ChartViewPanel symbol="BTCUSDT" trades={[]} />,
    )

    expect(html).toContain('시장 차트')
    expect(html).toContain('BTCUSDT · 1h')
    expect(html).toContain('15m')
    expect(html).toContain('1h')
    expect(html).toContain('4h')
    expect(html).toContain('데이터 연결 전')
    expect(html).toContain('실제 주문은 없습니다')
    expect(html).not.toMatch(/iframe|Pine Script|webhook|자동매매|매수하세요|매도하세요/)
    expect(html).toContain('차트 도구')
    expect(html).toContain('support OB')
    expect(html).toContain('liquidity')
    expect(html).toContain('fakeout')
  })

  it('저장된 annotation 라벨을 현재 symbol/timeframe 목록에 표시한다', () => {
    const html = renderToStaticMarkup(
      <ChartViewPanel
        symbol="BTCUSDT"
        trades={[]}
        annotations={[
          {
            id: 'ann-1',
            symbol: 'BTCUSDT',
            timeframe: '1h',
            annotationType: 'SUPPORT_OB',
            topPrice: 66000,
            bottomPrice: 65000,
          },
          {
            id: 'ann-2',
            symbol: 'ETHUSDT',
            timeframe: '1h',
            annotationType: 'FVG',
            topPrice: 2600,
            bottomPrice: 2500,
          },
        ]}
      />,
    )

    expect(html).toContain('support OB')
    expect(html).toContain('표시 1개')
    expect(html).toContain('65000 ~ 66000')
    expect(html).not.toContain('2500 ~ 2600')
    expect(html).not.toMatch(/매수하세요|자동매매/)
  })
})
