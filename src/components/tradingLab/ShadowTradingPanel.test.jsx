import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ShadowTradingPanel from './ShadowTradingPanel.jsx'

describe('ShadowTradingPanel', () => {
  it('연결된 차트 근거와 annotation 기반 복기 요약을 표시한다', () => {
    const html = renderToStaticMarkup(
      <ShadowTradingPanel
        trades={[
          {
            id: 'trade-1',
            symbol: 'BTCUSDT',
            direction: 'LONG',
            status: 'OPEN',
            entryPrice: 77200,
            recordType: 'IMPULSE',
            recordTypeLabel: '충동 기록',
            linkedAnnotations: [
              { annotationType: 'SUPPORT_OB', label: 'support OB' },
              { annotationType: 'FVG', label: 'FVG' },
              { annotationType: 'SUPPORT', label: 'support' },
            ],
            outcome: { result: 'UNRESOLVED' },
          },
        ]}
        stats={{}}
        settings={{ autoRecord: false }}
        candidates={[]}
      />,
    )

    expect(html).toContain('연결된 차트 근거')
    expect(html).toContain('support OB')
    expect(html).toContain('FVG')
    expect(html).toContain('support')
    expect(html).toContain('support 기반 기록 1개')
    expect(html).toContain('support OB 기반 기록 1개')
    expect(html).toContain('FVG 기반 기록 1개')
    expect(html).not.toMatch(/매수하세요|승률|자동매매/)
  })
})
