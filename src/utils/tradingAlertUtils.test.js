import { describe, expect, it } from 'vitest'
import {
  buildAlertMessage,
  buildTradingAlertEvent,
  evaluatePlanAlertTransition,
  getAlertLabel,
  resolvePlanPriceState,
  shouldUseBrowserNotifications,
} from './tradingAlertUtils.js'

const FIXED_NOW = new Date('2026-08-28T12:00:00.000Z')

const WAITING_PLAN = {
  id: 'plan-waiting',
  symbol: 'BTC',
  entryPrice: 106_000_000,
  stopPrice: 103_000_000,
  targetPrice: 112_000_000,
  investedAmount: 1_000_000,
  stopLossRate: -3,
  expectedLoss: 30_000,
  targetReturnRate: 5,
  expectedProfit: 50_000,
  riskRewardRatio: 1.67,
  note: '',
  status: 'WAITING',
  createdAt: '2026-08-28T10:00:00.000Z',
  updatedAt: '2026-08-28T10:00:00.000Z',
}

const ENTERED_PLAN = {
  ...WAITING_PLAN,
  id: 'plan-entered',
  status: 'ENTERED',
  actualEntryPrice: 105_000_000,
  actualInvestedAmount: 1_000_000,
  enteredAt: '2026-08-28T11:00:00.000Z',
  entryNote: '',
}

const CLOSED_PLAN = {
  ...ENTERED_PLAN,
  id: 'plan-closed',
  status: 'CLOSED',
  actualExitPrice: 110_000_000,
  actualProfitLoss: 50_000,
  actualReturnRate: 5,
  closedAt: '2026-08-28T13:00:00.000Z',
  exitNote: '',
}

const CANCELLED_PLAN = {
  ...WAITING_PLAN,
  id: 'plan-cancelled',
  status: 'CANCELLED',
  cancelledAt: '2026-08-28T10:30:00.000Z',
}

const formatPrice = (value) => `₩${value.toLocaleString('ko-KR')}`

describe('tradingAlertUtils', () => {
  it('WAITING → ENTRY_REACHED 알림 발생', () => {
    const result = evaluatePlanAlertTransition({
      plan: WAITING_PLAN,
      currentPriceState: 'ENTRY_REACHED',
      previousState: {
        planStatus: 'WAITING',
        lastPriceState: 'WAITING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
      formatPrice,
    })

    expect(result.alert?.type).toBe('ENTRY_REACHED')
    expect(result.alert?.label).toBe('진입가 도달')
    expect(result.alert?.message).toBe(
      '설정한 진입가 ₩106,000,000에 도달했습니다.',
    )
    expect(result.nextState?.lastPriceState).toBe('ENTRY_REACHED')
  })

  it('ENTRY_REACHED 유지 시 중복 없음', () => {
    const previous = {
      planStatus: 'WAITING',
      lastPriceState: 'ENTRY_REACHED',
      updatedAt: '2026-08-28T11:00:00.000Z',
    }

    const result = evaluatePlanAlertTransition({
      plan: WAITING_PLAN,
      currentPriceState: 'ENTRY_REACHED',
      previousState: previous,
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
    expect(result.nextState?.lastPriceState).toBe('ENTRY_REACHED')
  })

  it('ENTRY_REACHED → WAITING → ENTRY_REACHED 재진입 시 다시 알림', () => {
    const backToWaiting = evaluatePlanAlertTransition({
      plan: WAITING_PLAN,
      currentPriceState: 'WAITING',
      previousState: {
        planStatus: 'WAITING',
        lastPriceState: 'ENTRY_REACHED',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })
    expect(backToWaiting.alert).toBeNull()
    expect(backToWaiting.nextState?.lastPriceState).toBe('WAITING')

    const reEntry = evaluatePlanAlertTransition({
      plan: WAITING_PLAN,
      currentPriceState: 'ENTRY_REACHED',
      previousState: backToWaiting.nextState,
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })
    expect(reEntry.alert?.type).toBe('ENTRY_REACHED')
  })

  it('HOLDING → STOP_REACHED 알림', () => {
    const result = evaluatePlanAlertTransition({
      plan: ENTERED_PLAN,
      currentPriceState: 'STOP_REACHED',
      previousState: {
        planStatus: 'ENTERED',
        lastPriceState: 'HOLDING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
      formatPrice,
    })

    expect(result.alert?.type).toBe('STOP_REACHED')
    expect(result.alert?.label).toBe('손절가 도달')
    expect(result.alert?.message).toBe(
      '설정한 손절가 ₩103,000,000에 도달했습니다.',
    )
  })

  it('STOP_REACHED 유지 중 중복 없음', () => {
    const result = evaluatePlanAlertTransition({
      plan: ENTERED_PLAN,
      currentPriceState: 'STOP_REACHED',
      previousState: {
        planStatus: 'ENTERED',
        lastPriceState: 'STOP_REACHED',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
  })

  it('HOLDING → TARGET_REACHED 알림', () => {
    const result = evaluatePlanAlertTransition({
      plan: ENTERED_PLAN,
      currentPriceState: 'TARGET_REACHED',
      previousState: {
        planStatus: 'ENTERED',
        lastPriceState: 'HOLDING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
      formatPrice,
    })

    expect(result.alert?.type).toBe('TARGET_REACHED')
    expect(result.alert?.label).toBe('목표가 도달')
    expect(result.alert?.message).toBe(
      '설정한 목표가 ₩112,000,000에 도달했습니다.',
    )
  })

  it('TARGET_REACHED 유지 중 중복 없음', () => {
    const result = evaluatePlanAlertTransition({
      plan: ENTERED_PLAN,
      currentPriceState: 'TARGET_REACHED',
      previousState: {
        planStatus: 'ENTERED',
        lastPriceState: 'TARGET_REACHED',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
  })

  it('STALE 시 알림 없음', () => {
    const result = evaluatePlanAlertTransition({
      plan: WAITING_PLAN,
      currentPriceState: 'ENTRY_REACHED',
      previousState: {
        planStatus: 'WAITING',
        lastPriceState: 'WAITING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: false,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
    expect(result.nextState?.lastPriceState).toBe('WAITING')
  })

  it('DISCONNECTED 시 알림 없음', () => {
    const result = evaluatePlanAlertTransition({
      plan: ENTERED_PLAN,
      currentPriceState: 'TARGET_REACHED',
      previousState: {
        planStatus: 'ENTERED',
        lastPriceState: 'HOLDING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: false,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
    expect(result.nextState?.lastPriceState).toBe('HOLDING')
  })

  it('CLOSED 알림 없음', () => {
    const result = evaluatePlanAlertTransition({
      plan: CLOSED_PLAN,
      currentPriceState: 'TARGET_REACHED',
      previousState: {
        planStatus: 'ENTERED',
        lastPriceState: 'HOLDING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
    expect(result.nextState).toBeNull()
  })

  it('CANCELLED 알림 없음', () => {
    const result = evaluatePlanAlertTransition({
      plan: CANCELLED_PLAN,
      currentPriceState: 'ENTRY_REACHED',
      previousState: {
        planStatus: 'WAITING',
        lastPriceState: 'WAITING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
    expect(result.nextState).toBeNull()
  })

  it('알림 OFF 시 알림 없음', () => {
    const result = evaluatePlanAlertTransition({
      plan: WAITING_PLAN,
      currentPriceState: 'ENTRY_REACHED',
      previousState: {
        planStatus: 'WAITING',
        lastPriceState: 'WAITING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: false,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
    expect(result.nextState?.lastPriceState).toBe('ENTRY_REACHED')
  })

  it('동일 symbol 여러 plan 독립 처리', () => {
    const planA = { ...WAITING_PLAN, id: 'plan-a', entryPrice: 106_000_000 }
    const planB = { ...WAITING_PLAN, id: 'plan-b', entryPrice: 101_000_000 }

    const alertA = evaluatePlanAlertTransition({
      plan: planA,
      currentPriceState: 'ENTRY_REACHED',
      previousState: {
        planStatus: 'WAITING',
        lastPriceState: 'WAITING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    const alertB = evaluatePlanAlertTransition({
      plan: planB,
      currentPriceState: 'WAITING',
      previousState: {
        planStatus: 'WAITING',
        lastPriceState: 'WAITING',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(alertA.alert?.planId).toBe('plan-a')
    expect(alertB.alert).toBeNull()
  })

  it('새로고침 후 동일 상태 중복 방지', () => {
    const result = evaluatePlanAlertTransition({
      plan: WAITING_PLAN,
      currentPriceState: 'ENTRY_REACHED',
      previousState: {
        planStatus: 'WAITING',
        lastPriceState: 'ENTRY_REACHED',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
  })

  it('최초 관측 시 baseline만 저장하고 알림 없음', () => {
    const result = evaluatePlanAlertTransition({
      plan: WAITING_PLAN,
      currentPriceState: 'ENTRY_REACHED',
      previousState: null,
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
    expect(result.nextState).toEqual({
      planStatus: 'WAITING',
      lastPriceState: 'ENTRY_REACHED',
      updatedAt: FIXED_NOW.toISOString(),
    })
  })

  it('WAITING → ENTERED 상태 변경 시 알림 없이 baseline 재설정', () => {
    const enteredPlan = {
      ...WAITING_PLAN,
      status: 'ENTERED',
      actualEntryPrice: 105_000_000,
      actualInvestedAmount: 1_000_000,
      enteredAt: '2026-08-28T12:00:00.000Z',
      entryNote: '',
    }

    const result = evaluatePlanAlertTransition({
      plan: enteredPlan,
      currentPriceState: 'HOLDING',
      previousState: {
        planStatus: 'WAITING',
        lastPriceState: 'ENTRY_REACHED',
        updatedAt: '2026-08-28T11:00:00.000Z',
      },
      settingsEnabled: true,
      quoteIsLive: true,
      now: FIXED_NOW,
    })

    expect(result.alert).toBeNull()
    expect(result.nextState?.planStatus).toBe('ENTERED')
    expect(result.nextState?.lastPriceState).toBe('HOLDING')
  })

  it('알림 메시지에 추천 표현을 포함하지 않는다', () => {
    const event = buildTradingAlertEvent({
      plan: WAITING_PLAN,
      type: 'ENTRY_REACHED',
      now: FIXED_NOW,
      formatPrice,
    })

    expect(event.message).not.toMatch(/매수|매도|추천|손절하|익절|타점/)
    expect(getAlertLabel('ENTRY_REACHED')).toBe('진입가 도달')
    expect(buildAlertMessage(WAITING_PLAN, 'STOP_REACHED', formatPrice)).toBe(
      '설정한 손절가 ₩103,000,000에 도달했습니다.',
    )
  })

  it('resolvePlanPriceState는 plan status에 맞는 상태를 반환한다', () => {
    expect(resolvePlanPriceState(WAITING_PLAN, 107_000_000)).toBe('WAITING')
    expect(resolvePlanPriceState(WAITING_PLAN, 106_000_000)).toBe(
      'ENTRY_REACHED',
    )
    expect(resolvePlanPriceState(ENTERED_PLAN, 110_000_000)).toBe('HOLDING')
    expect(resolvePlanPriceState(ENTERED_PLAN, 103_000_000)).toBe(
      'STOP_REACHED',
    )
    expect(resolvePlanPriceState(ENTERED_PLAN, 112_000_000)).toBe(
      'TARGET_REACHED',
    )
    expect(resolvePlanPriceState(CLOSED_PLAN, 112_000_000)).toBeNull()
  })

  it('shouldUseBrowserNotifications는 enabled와 permission을 확인한다', () => {
    expect(
      shouldUseBrowserNotifications({
        enabled: false,
        browserNotifications: true,
      }),
    ).toBe(false)

    expect(
      shouldUseBrowserNotifications({
        enabled: true,
        browserNotifications: false,
      }),
    ).toBe(false)
  })
})
