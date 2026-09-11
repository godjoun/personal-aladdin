import { describe, expect, it } from 'vitest'
import {
  computeCvdImbalancePct,
  evaluateMarketState,
  formatSignedPct,
  formatSignedUsdCompact,
  isLiquidationSignificant,
  resolveMarketStateBucketStart,
} from './marketStateEngine.js'
import { MARKET_STATE_DISCLAIMER, MARKET_STATES } from './constants.js'

const FORBIDDEN = [
  '고래',
  '세력',
  '조작',
  '무조건',
  '승률',
  '매수 추천',
  '매도 추천',
  '진입',
  '손절',
  '익절',
]

function base(overrides = {}) {
  return {
    symbol: 'BTCUSDT',
    evaluatedAt: '2026-09-12T02:35:00.000Z',
    referencePrice: 65000,
    tradeCount: 80,
    ...overrides,
  }
}

function texts(result) {
  return [
    result.primaryState,
    ...result.secondaryStates,
    ...result.evidence,
    ...result.counterEvidence,
  ].join(' ')
}

describe('market state engine v1', () => {
  it('price↑ + OI↑ + CVD↑ 는 신규 롱 유입 / 상승 압력', () => {
    const result = evaluateMarketState(
      base({
        priceChange15m: 0.8,
        oiChangePct: 2.1,
        cvdNotional: 4_200_000,
        buyNotional: 7_100_000,
        sellNotional: 2_900_000,
        volumeRatio: 1.7,
        buySharePct: 62,
        sellSharePct: 38,
        structure15m: 'BULLISH',
      }),
    )
    expect(result.primaryState).toBe('NEW_LONG_BUILDUP')
    expect(result.secondaryStates).toContain('BULLISH_PRESSURE')
    expect(result.strengthScore).toBeGreaterThanOrEqual(0)
    expect(result.strengthScore).toBeLessThanOrEqual(100)
    expect(result.evidence.some((line) => line.includes('15분 가격 +0.8%'))).toBe(
      true,
    )
    expect(result.evidence.some((line) => line.includes('OI +2.1%'))).toBe(true)
    expect(result.evidence.some((line) => line.includes('CVD +$4.2M'))).toBe(true)
    expect(result.evidence.some((line) => line.includes('1.7배'))).toBe(true)
  })

  it('price↓ + OI↑ + CVD↓ 는 신규 숏 유입 / 하락 압력', () => {
    const result = evaluateMarketState(
      base({
        priceChange15m: -0.9,
        oiChangePct: 1.8,
        cvdNotional: -3_500_000,
        buySharePct: 38,
        sellSharePct: 62,
      }),
    )
    expect(result.primaryState).toBe('NEW_SHORT_BUILDUP')
    expect(result.secondaryStates).toContain('BEARISH_PRESSURE')
  })

  it('price↑ + OI↓ + short liquidation 은 숏 청산 영향', () => {
    const result = evaluateMarketState(
      base({
        priceChange15m: 0.7,
        oiChangePct: -1.2,
        cvdNotional: 100_000,
        shortLiquidationNotional: 5_000_000,
        shortLiquidationCount: 3,
        longLiquidationNotional: 0,
        longLiquidationCount: 0,
      }),
    )
    expect(result.primaryState).toBe('SHORT_LIQUIDATION_DRIVEN')
    expect(result.evidence.some((line) => line.includes('숏 청산'))).toBe(true)
  })

  it('price↓ + OI↓ + long liquidation 은 롱 청산 영향', () => {
    const result = evaluateMarketState(
      base({
        priceChange15m: -0.6,
        oiChangePct: -1.5,
        cvdNotional: -80_000,
        longLiquidationNotional: 4_000_000,
        longLiquidationCount: 4,
        shortLiquidationNotional: 0,
        shortLiquidationCount: 0,
      }),
    )
    expect(result.primaryState).toBe('LONG_LIQUIDATION_DRIVEN')
    expect(result.evidence.some((line) => line.includes('롱 청산'))).toBe(true)
  })

  it('price↑ + CVD 크게 ↓ 는 약세 다이버전스', () => {
    const result = evaluateMarketState(
      base({
        priceChange15m: 0.9,
        oiChangePct: 0.1,
        cvdNotional: -5_000_000,
        buySharePct: 35,
        sellSharePct: 65,
      }),
    )
    expect(result.primaryState).toBe('PRICE_CVD_BEARISH_DIVERGENCE')
  })

  it('price↓ + CVD 크게 ↑ 는 강세 다이버전스', () => {
    const result = evaluateMarketState(
      base({
        priceChange15m: -0.8,
        oiChangePct: 0.1,
        cvdNotional: 5_000_000,
        buySharePct: 68,
        sellSharePct: 32,
      }),
    )
    expect(result.primaryState).toBe('PRICE_CVD_BULLISH_DIVERGENCE')
  })

  it('지표가 엇갈리면 MIXED', () => {
    const result = evaluateMarketState(
      base({
        priceChange15m: 0.8,
        oiChangePct: 2.0,
        cvdNotional: -900_000,
        buySharePct: 44,
        sellSharePct: 56,
      }),
    )
    expect(result.primaryState).toBe('MIXED')
  })

  it('데이터가 부족하면 DATA_INSUFFICIENT', () => {
    expect(evaluateMarketState({ symbol: 'BTCUSDT' }).primaryState).toBe(
      'DATA_INSUFFICIENT',
    )
    expect(
      evaluateMarketState(base({ priceChange15m: 0.8 })).primaryState,
    ).toBe('DATA_INSUFFICIENT')
  })

  it('다중 시간대 정렬은 강도를 올리고 충돌은 반대 근거를 넣는다', () => {
    const aligned = evaluateMarketState(
      base({
        priceChange15m: 0.8,
        priceChange1h: 1.2,
        priceChange4h: 2.0,
        oiChangePct: 2.1,
        cvdNotional: 4_200_000,
        buySharePct: 62,
        sellSharePct: 38,
        volumeRatio: 1.7,
        structure15m: 'BULLISH',
        structure1h: 'BULLISH',
        structure4h: 'BULLISH',
      }),
    )
    const opposed = evaluateMarketState(
      base({
        priceChange15m: 0.8,
        priceChange1h: 1.2,
        priceChange4h: -2.0,
        oiChangePct: 2.1,
        cvdNotional: 4_200_000,
        buySharePct: 62,
        sellSharePct: 38,
        volumeRatio: 1.7,
        structure15m: 'BULLISH',
        structure1h: 'BULLISH',
        structure4h: 'BEARISH',
        fundingRate: 0.0002,
      }),
    )
    expect(aligned.primaryState).toBe('NEW_LONG_BUILDUP')
    expect(opposed.primaryState).toBe('NEW_LONG_BUILDUP')
    expect(aligned.strengthScore).toBeGreaterThan(opposed.strengthScore)
    expect(opposed.counterEvidence.some((line) => line.includes('4시간'))).toBe(
      true,
    )
    expect(opposed.counterEvidence.some((line) => line.includes('Funding'))).toBe(
      true,
    )
    expect(aligned.context.timeframe15m).toBe('BULLISH')
    expect(aligned.context.timeframe4h).toBe('BULLISH')
  })

  it('strengthScore 는 항상 0~100 이고 확률이 아니다', () => {
    const samples = [
      evaluateMarketState({ symbol: 'ETHUSDT' }),
      evaluateMarketState(
        base({
          symbol: 'ETHUSDT',
          priceChange15m: 0.5,
          oiChangePct: 0.9,
          cvdNotional: 80_000,
          buySharePct: 61,
          sellSharePct: 39,
          volumeRatio: 1.4,
        }),
      ),
      evaluateMarketState(
        base({
          priceChange15m: 3,
          oiChangePct: 5,
          cvdNotional: 20_000_000,
          buySharePct: 70,
          sellSharePct: 30,
          volumeRatio: 3,
          structure1h: 'BULLISH',
          structure4h: 'BULLISH',
        }),
      ),
    ]
    for (const result of samples) {
      expect(result.strengthScore).toBeGreaterThanOrEqual(0)
      expect(result.strengthScore).toBeLessThanOrEqual(100)
      expect(result.disclaimer).toBe(MARKET_STATE_DISCLAIMER)
      expect(MARKET_STATES).toContain(result.primaryState)
      const blob = texts(result)
      for (const word of FORBIDDEN) {
        expect(blob.includes(word), word).toBe(false)
      }
    }
  })

  it('ETH 임계값으로도 같은 규칙을 적용한다', () => {
    const result = evaluateMarketState(
      base({
        symbol: 'ETHUSDT',
        priceChange15m: 0.6,
        oiChangePct: 1.1,
        cvdNotional: 80_000,
        buySharePct: 61,
        sellSharePct: 39,
        volumeRatio: 1.5,
      }),
    )
    expect(result.primaryState).toBe('NEW_LONG_BUILDUP')
  })

  it('CVD 는 절대 달러가 아니라 상대 불균형을 우선한다', () => {
    expect(
      computeCvdImbalancePct({
        cvdNotional: 80_000,
        buyNotional: 244_000,
        sellNotional: 164_000,
      }),
    ).toBeCloseTo(19.6, 1)

    const smallDollarStrongShare = evaluateMarketState(
      base({
        symbol: 'ETHUSDT',
        priceChange15m: 0.6,
        oiChangePct: 1.1,
        cvdNotional: 80_000,
        buySharePct: 61,
        sellSharePct: 39,
        volumeRatio: 1.5,
      }),
    )
    expect(smallDollarStrongShare.primaryState).toBe('NEW_LONG_BUILDUP')

    const largeDollarBalanced = evaluateMarketState(
      base({
        priceChange15m: 0.9,
        oiChangePct: 0.1,
        cvdNotional: -5_000_000,
        buyNotional: 51_000_000,
        sellNotional: 56_000_000,
        buySharePct: 47.7,
        sellSharePct: 52.3,
      }),
    )
    expect(largeDollarBalanced.primaryState).not.toBe(
      'PRICE_CVD_BEARISH_DIVERGENCE',
    )
  })

  it('청산 유의성은 비중·건수·체결 대비로 본다', () => {
    expect(
      isLiquidationSignificant({
        sideNotional: 50_000,
        sideCount: 1,
        totalNotional: 50_000,
      }),
    ).toBe(false)
    expect(
      isLiquidationSignificant({
        sideNotional: 80_000,
        sideCount: 3,
        totalNotional: 80_000,
      }),
    ).toBe(true)
    expect(
      isLiquidationSignificant({
        sideNotional: 80_000,
        sideCount: 1,
        totalNotional: 80_000,
        totalTradeNotional: 1_000_000,
      }),
    ).toBe(true)
  })

  it('5분 bucket 과 숫자 포맷을 계산한다', () => {
    expect(resolveMarketStateBucketStart('2026-09-12T02:37:12.000Z')).toBe(
      '2026-09-12T02:35:00.000Z',
    )
    expect(formatSignedPct(0.8)).toBe('+0.8%')
    expect(formatSignedUsdCompact(4_200_000)).toBe('+$4.2M')
  })
})
