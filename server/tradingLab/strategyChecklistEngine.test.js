import { describe, expect, it } from 'vitest'
import {
  evaluateStrategyChecklist,
  structureAlignment,
} from './strategyChecklistEngine.js'
import { STRATEGY_CHECKLIST_THRESHOLDS as T } from './strategyChecklistThresholds.js'

function assembled(overrides = {}) {
  return {
    structure4h: 'BULLISH',
    structure1h: 'BULLISH',
    structure15m: 'BULLISH',
    priceChange15m: 0.4,
    cvdNotional: 800,
    buySharePct: 61,
    sellSharePct: 39,
    oiChangePct: 0.8,
    volumeRatio: 1.8,
    fundingRate: 0.0001,
    longLiquidationNotional: 0,
    shortLiquidationNotional: 0,
    ...overrides,
  }
}

describe('structureAlignment', () => {
  it('LONG 은 상승을 정렬, 하락을 반대로 본다', () => {
    expect(structureAlignment('LONG', 'BULLISH')).toBe('aligned')
    expect(structureAlignment('LONG', 'RANGE')).toBe('mixed')
    expect(structureAlignment('LONG', 'BEARISH')).toBe('opposite')
  })

  it('SHORT 는 하락을 정렬, 상승을 반대로 본다', () => {
    expect(structureAlignment('SHORT', 'BEARISH')).toBe('aligned')
    expect(structureAlignment('SHORT', 'RANGE')).toBe('mixed')
    expect(structureAlignment('SHORT', 'BULLISH')).toBe('opposite')
  })
})

describe('evaluateStrategyChecklist', () => {
  it('LONG 기준이 잘 맞으면 기준 충족이 된다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['support', 'support_ob', 'fvg', 'has_stop', 'has_target'],
      assembled: assembled(),
    })
    expect(result.result).toBe('READY')
    expect(result.resultLabel).toBe('기준 충족')
    expect(result.scoreLabel).toBe('기준 충족도')
    expect(result.score).toBeGreaterThanOrEqual(T.READY_MIN)
    expect(result.disclaimer).not.toMatch(/승률|수익 확률/)
    expect(result.confirmedEvidence).toEqual(
      expect.arrayContaining([
        'support 태그 선택됨',
        'support OB 태그 선택됨',
        'FVG 태그 선택됨',
        'CVD 매수 우세',
        '거래량 평균 대비 1.8배',
        '손절 기준 있음',
        '목표 기준 있음',
      ]),
    )
  })

  it('SHORT 기준이 잘 맞으면 기준 충족이 된다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'SHORT',
      selectedTags: [
        'resistance',
        'resistance_ob',
        'trendline',
        'has_stop',
        'has_target',
      ],
      assembled: assembled({
        structure4h: 'BEARISH',
        structure1h: 'BEARISH',
        structure15m: 'BEARISH',
        priceChange15m: -0.5,
        cvdNotional: -900,
        buySharePct: 38,
        sellSharePct: 62,
      }),
    })
    expect(result.result).toBe('READY')
    expect(result.confirmedEvidence).toEqual(
      expect.arrayContaining([
        'resistance 태그 선택됨',
        'resistance OB 태그 선택됨',
        'trendline 태그 선택됨',
        'CVD 매도 우세',
      ]),
    )
  })

  it('support / support OB / FVG / trendline / fakeout / liquidity sweep 을 반영한다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: [
        'support',
        'support_ob',
        'fvg',
        'trendline',
        'fakeout',
        'liquidity_sweep',
        'has_stop',
        'has_target',
      ],
      assembled: assembled(),
    })
    expect(result.categories.location.score).toBe(T.LOCATION_MAX)
    expect(result.confirmedEvidence).toEqual(
      expect.arrayContaining([
        'fakeout 태그 선택됨 · 주의 관찰',
        'liquidity sweep 태그 선택됨 · 주의 관찰',
      ]),
    )
  })

  it('resistance / resistance OB 는 SHORT 진입 위치에 점수를 준다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'SHORT',
      selectedTags: ['resistance', 'resistance_ob', 'has_stop', 'has_target'],
      assembled: assembled({
        structure4h: 'BEARISH',
        structure1h: 'BEARISH',
        structure15m: 'BEARISH',
        priceChange15m: -0.4,
        cvdNotional: -400,
        sellSharePct: 60,
      }),
    })
    expect(result.categories.location.score).toBe(14)
  })

  it('손절 기준이 없으면 리스크 높음이 된다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['support', 'has_target'],
      assembled: assembled(),
    })
    expect(result.result).toBe('RISK_HIGH')
    expect(result.resultLabel).toBe('리스크 높음')
    expect(result.missingItems).toContain('손절 기준이 없습니다.')
    expect(result.riskWarnings).toContain('손절 기준이 없습니다.')
  })

  it('목표 기준이 없으면 부족 항목에 남긴다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['support', 'has_stop'],
      assembled: assembled({
        structure4h: 'RANGE',
        structure1h: 'RANGE',
        structure15m: 'RANGE',
        cvdNotional: -10,
        buySharePct: 48,
        volumeRatio: 0.6,
        oiChangePct: null,
      }),
    })
    expect(result.missingItems).toContain('목표 기준이 없습니다.')
    expect(result.result).toBe('NOT_READY')
  })

  it('FOMO 태그가 있으면 리스크 높음이 된다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['support', 'has_stop', 'has_target', 'fomo'],
      assembled: assembled(),
    })
    expect(result.result).toBe('RISK_HIGH')
    expect(result.riskWarnings).toContain('FOMO 태그가 선택되어 있습니다.')
    expect(result.score).toBeGreaterThan(0)
  })

  it('4H 반대 방향이면 큰 흐름을 감점한다', () => {
    const aligned = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['has_stop', 'has_target'],
      assembled: assembled(),
    })
    const opposite = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['has_stop', 'has_target'],
      assembled: assembled({ structure4h: 'BEARISH' }),
    })
    expect(opposite.categories.higherTimeframe.score).toBeLessThan(
      aligned.categories.higherTimeframe.score,
    )
    expect(opposite.missingItems.some((item) => item.includes('4H 구조'))).toBe(
      true,
    )
  })

  it('CVD 방향 일치/불일치를 반영한다', () => {
    const match = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['has_stop', 'has_target'],
      assembled: assembled({ cvdNotional: 500, buySharePct: 60 }),
    })
    const mismatch = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['has_stop', 'has_target'],
      assembled: assembled({ cvdNotional: -500, buySharePct: 40 }),
    })
    expect(match.categories.market.score).toBeGreaterThan(
      mismatch.categories.market.score,
    )
    expect(mismatch.missingItems).toContain('CVD 방향이 선택 방향과 다릅니다.')
  })

  it('OI 방향과 거래량을 반영한다', () => {
    const good = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['has_stop', 'has_target'],
      assembled: assembled({
        oiChangePct: 0.9,
        priceChange15m: 0.5,
        volumeRatio: 1.8,
      }),
    })
    const weak = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['has_stop', 'has_target'],
      assembled: assembled({
        oiChangePct: 0.9,
        priceChange15m: -0.5,
        volumeRatio: 0.4,
      }),
    })
    expect(good.categories.market.score).toBeGreaterThan(weak.categories.market.score)
    expect(weak.missingItems).toContain('거래량이 평균보다 부족합니다.')
    expect(weak.missingItems).toContain('OI 증가와 가격 방향이 같지 않습니다.')
  })

  it('최근 과도한 재진입이면 리스크 높음이 된다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['support', 'has_stop', 'has_target'],
      assembled: assembled(),
      sameDirectionCount30m: 2,
    })
    expect(result.result).toBe('RISK_HIGH')
    expect(result.riskWarnings).toContain(
      '최근 30분 같은 방향 Shadow Trade 가 과다합니다.',
    )
  })

  it('최근 연속 LOSS 면 리스크 높음이 된다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'SHORT',
      selectedTags: ['resistance', 'has_stop', 'has_target'],
      assembled: assembled({
        structure4h: 'BEARISH',
        structure1h: 'BEARISH',
        structure15m: 'BEARISH',
        cvdNotional: -200,
      }),
      recentClosedResults: ['LOSS', 'LOSS'],
    })
    expect(result.result).toBe('RISK_HIGH')
    expect(result.riskWarnings).toContain(
      '최근 완료 Shadow Trade 가 연속 LOSS 입니다.',
    )
  })

  it('청산 주도 움직임은 주의 관찰로만 표시한다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['support', 'has_stop', 'has_target'],
      assembled: assembled(),
      primaryState: 'SHORT_LIQUIDATION_DRIVEN',
    })
    expect(result.autoEvidence.liquidationWatch).toBe(true)
    expect(result.riskWarnings.some((item) => item.includes('주의 관찰'))).toBe(
      true,
    )
    expect(result.result).not.toBe('RISK_HIGH')
  })

  it('중간 점수면 기준 부족이 된다', () => {
    const result = evaluateStrategyChecklist({
      direction: 'LONG',
      selectedTags: ['support', 'has_stop', 'has_target'],
      assembled: assembled({
        structure4h: 'RANGE',
        structure1h: 'RANGE',
        structure15m: 'RANGE',
        cvdNotional: -20,
        buySharePct: 45,
        volumeRatio: 1.1,
        oiChangePct: null,
        fundingRate: 0.0001,
      }),
    })
    expect(result.result).toBe('NOT_READY')
    expect(result.resultLabel).toBe('기준 부족')
    expect(result.score).toBeGreaterThanOrEqual(T.NOT_READY_MIN)
    expect(result.score).toBeLessThan(T.READY_MIN)
  })
})
