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
  })
})
