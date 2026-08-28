import { describe, expect, it } from 'vitest'
import {
  TRADING_TRADE_SOURCE_PLAN,
  isClosedPlanEligibleForTrade,
  isTradingPlanSourceTrade,
  mapClosedPlanToTrade,
} from './tradingPlanTradeSync.js'

const CLOSED_PLAN = {
  id: 'plan-closed',
  symbol: 'BTC',
  entryPrice: 106_000_000,
  stopPrice: 103_000_000,
  targetPrice: 112_000_000,
  investedAmount: 500_000,
  stopLossRate: -3,
  expectedLoss: 15_000,
  targetReturnRate: 5,
  expectedProfit: 25_000,
  riskRewardRatio: 1.67,
  note: '계획 메모',
  status: 'CLOSED',
  createdAt: '2026-08-28T10:00:00.000Z',
  updatedAt: '2026-08-29T12:00:00.000Z',
  actualEntryPrice: 105_500_000,
  actualInvestedAmount: 480_000,
  enteredAt: '2026-08-28T11:00:00.000Z',
  entryNote: '실제 진입',
  actualExitPrice: 110_000_000,
  closedAt: '2026-08-29T12:00:00.000Z',
  exitNote: '청산 복기',
  actualProfitLoss: 20_000,
  actualReturnRate: 4.17,
}

describe('tradingPlanTradeSync', () => {
  it('CLOSED plan만 매매일지 생성 대상', () => {
    expect(isClosedPlanEligibleForTrade(CLOSED_PLAN)).toBe(true)
    expect(isClosedPlanEligibleForTrade({ ...CLOSED_PLAN, status: 'WAITING' })).toBe(
      false,
    )
    expect(isClosedPlanEligibleForTrade({ ...CLOSED_PLAN, status: 'ENTERED' })).toBe(
      false,
    )
    expect(
      isClosedPlanEligibleForTrade({ ...CLOSED_PLAN, status: 'CANCELLED' }),
    ).toBe(false)
  })

  it('actualEntryPrice 누락 시 생성 대상 아님', () => {
    expect(
      isClosedPlanEligibleForTrade({ ...CLOSED_PLAN, actualEntryPrice: undefined }),
    ).toBe(false)
  })

  it('actualExitPrice 누락 시 생성 대상 아님', () => {
    expect(
      isClosedPlanEligibleForTrade({ ...CLOSED_PLAN, actualExitPrice: undefined }),
    ).toBe(false)
  })

  it('actualInvestedAmount 누락 시 생성 대상 아님', () => {
    expect(
      isClosedPlanEligibleForTrade({
        ...CLOSED_PLAN,
        actualInvestedAmount: undefined,
      }),
    ).toBe(false)
  })

  it('CLOSED plan → trade 필드 매핑', () => {
    const trade = mapClosedPlanToTrade(CLOSED_PLAN)

    expect(trade).toMatchObject({
      symbol: 'BTC',
      entryPrice: 105_500_000,
      exitPrice: 110_000_000,
      investedAmount: 480_000,
      returnRate: 4.17,
      profitLoss: 20_000,
      entryReason: '실제 진입',
      review: '청산 복기',
      tags: [],
      tradedAt: '2026-08-29T12:00:00.000Z',
      source: TRADING_TRADE_SOURCE_PLAN,
      sourcePlanId: 'plan-closed',
    })
  })

  it('entryNote가 없으면 plan.note를 entryReason에 사용', () => {
    const trade = mapClosedPlanToTrade({
      ...CLOSED_PLAN,
      entryNote: '',
    })

    expect(trade?.entryReason).toBe('계획 메모')
  })

  it('isTradingPlanSourceTrade는 source/sourcePlanId를 확인한다', () => {
    expect(
      isTradingPlanSourceTrade({
        id: 't1',
        symbol: 'BTC',
        entryPrice: 1,
        exitPrice: 2,
        investedAmount: 100,
        returnRate: 1,
        profitLoss: 1,
        entryReason: '',
        review: '',
        tags: [],
        tradedAt: '2026-08-29T12:00:00.000Z',
        createdAt: '2026-08-29T12:00:00.000Z',
        source: TRADING_TRADE_SOURCE_PLAN,
        sourcePlanId: 'plan-closed',
      }),
    ).toBe(true)

    expect(
      isTradingPlanSourceTrade({
        id: 't2',
        symbol: 'BTC',
        entryPrice: 1,
        exitPrice: 2,
        investedAmount: 100,
        returnRate: 1,
        profitLoss: 1,
        entryReason: '',
        review: '',
        tags: [],
        tradedAt: '2026-08-29T12:00:00.000Z',
        createdAt: '2026-08-29T12:00:00.000Z',
      }),
    ).toBe(false)
  })
})
