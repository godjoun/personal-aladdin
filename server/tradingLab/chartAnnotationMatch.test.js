import { describe, expect, it } from 'vitest'
import {
  matchAnnotationToPrice,
  matchChartAnnotations,
} from './chartAnnotationMatch.js'

describe('chartAnnotationMatch', () => {
  it('support line 근처와 support OB 안을 구분한다', () => {
    expect(
      matchAnnotationToPrice({ annotationType: 'SUPPORT', price: 100 }, 100.2),
    ).toEqual({ relation: 'near' })
    expect(
      matchAnnotationToPrice({ annotationType: 'SUPPORT', price: 100 }, 110),
    ).toBeNull()
    expect(
      matchAnnotationToPrice(
        { annotationType: 'SUPPORT_OB', topPrice: 102, bottomPrice: 98 },
        100,
      ),
    ).toEqual({ relation: 'inside' })
  })

  it('LONG 은 support/FVG 를 검토 가능 근거로 표시한다', () => {
    const matched = matchChartAnnotations({
      direction: 'LONG',
      price: 65000,
      annotations: [
        { id: 'a', annotationType: 'SUPPORT', timeframe: '1h', price: 65010 },
        {
          id: 'b',
          annotationType: 'FVG',
          timeframe: '15m',
          topPrice: 65200,
          bottomPrice: 64800,
        },
        { id: 'c', annotationType: 'RESISTANCE', timeframe: '1h', price: 70000 },
      ],
    })
    expect(matched.map((item) => item.id)).toEqual(['a', 'b'])
    expect(matched[0].evidence).toBe('검토 가능 근거 · support 근처')
    expect(matched[1].evidence).toBe('검토 가능 근거 · FVG 안')
    expect(JSON.stringify(matched)).not.toMatch(/매수하세요|매도하세요|승률/)
  })
})
