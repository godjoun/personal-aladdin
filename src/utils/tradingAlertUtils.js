/**
 * tradingAlertUtils.js — 매매 계획 가격 알림 판단
 */

import {
  deriveEnteredPriceState,
  deriveWaitingPriceState,
} from './tradingPlanMonitor.js'

/**
 * @typedef {'ENTRY_REACHED' | 'STOP_REACHED' | 'TARGET_REACHED'} TradingAlertType
 */

/**
 * @typedef {Object} TradingAlertEvent
 * @property {string} id
 * @property {string} planId
 * @property {string} symbol
 * @property {TradingAlertType} type
 * @property {string} label
 * @property {number} triggerPrice
 * @property {string} message
 * @property {string} createdAt
 */

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan} plan
 * @param {number | null | undefined} currentPrice
 * @returns {'WAITING' | 'ENTRY_REACHED' | 'HOLDING' | 'STOP_REACHED' | 'TARGET_REACHED' | null}
 */
export function resolvePlanPriceState(plan, currentPrice) {
  if (plan.status === 'WAITING') {
    return deriveWaitingPriceState({
      currentPrice,
      entryPrice: plan.entryPrice,
    })
  }

  if (plan.status === 'ENTERED') {
    return deriveEnteredPriceState({
      currentPrice,
      stopPrice: plan.stopPrice,
      targetPrice: plan.targetPrice,
    })
  }

  return null
}

/**
 * @param {'WAITING' | 'ENTRY_REACHED' | 'HOLDING' | 'STOP_REACHED' | 'TARGET_REACHED' | null | undefined} priceState
 * @returns {TradingAlertType | null}
 */
export function getAlertTypeForPriceState(priceState) {
  if (priceState === 'ENTRY_REACHED') return 'ENTRY_REACHED'
  if (priceState === 'STOP_REACHED') return 'STOP_REACHED'
  if (priceState === 'TARGET_REACHED') return 'TARGET_REACHED'
  return null
}

/**
 * @param {TradingAlertType} type
 */
export function getAlertLabel(type) {
  if (type === 'ENTRY_REACHED') return '진입가 도달'
  if (type === 'STOP_REACHED') return '손절가 도달'
  return '목표가 도달'
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan} plan
 * @param {TradingAlertType} type
 */
export function getAlertTriggerPrice(plan, type) {
  if (type === 'ENTRY_REACHED') return plan.entryPrice
  if (type === 'STOP_REACHED') return plan.stopPrice
  return plan.targetPrice
}

/**
 * @param {number} price
 * @param {(value: number) => string} [formatPrice]
 */
export function formatAlertPrice(price, formatPrice) {
  const formatter =
    formatPrice ??
    ((value) =>
      new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        maximumFractionDigits: 0,
      }).format(value))
  return formatter(price)
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan} plan
 * @param {TradingAlertType} type
 * @param {(value: number) => string} [formatPrice]
 */
export function buildAlertMessage(plan, type, formatPrice) {
  const triggerPrice = getAlertTriggerPrice(plan, type)
  const formatted = formatAlertPrice(triggerPrice, formatPrice)

  if (type === 'ENTRY_REACHED') {
    return `설정한 진입가 ${formatted}에 도달했습니다.`
  }
  if (type === 'STOP_REACHED') {
    return `설정한 손절가 ${formatted}에 도달했습니다.`
  }
  return `설정한 목표가 ${formatted}에 도달했습니다.`
}

/**
 * @param {{
 *   plan: import('../services/tradingPlanStorage.js').TradingPlan,
 *   type: TradingAlertType,
 *   now?: Date,
 *   formatPrice?: (value: number) => string,
 * }} input
 * @returns {TradingAlertEvent}
 */
export function buildTradingAlertEvent(input) {
  const now = input.now ?? new Date()
  const type = input.type
  const triggerPrice = getAlertTriggerPrice(input.plan, type)

  return {
    id: `${input.plan.id}-${type}-${now.getTime()}`,
    planId: input.plan.id,
    symbol: input.plan.symbol,
    type,
    label: getAlertLabel(type),
    triggerPrice,
    message: buildAlertMessage(input.plan, type, input.formatPrice),
    createdAt: now.toISOString(),
  }
}

/**
 * @param {{
 *   plan: import('../services/tradingPlanStorage.js').TradingPlan,
 *   currentPriceState: 'WAITING' | 'ENTRY_REACHED' | 'HOLDING' | 'STOP_REACHED' | 'TARGET_REACHED' | null,
 *   previousState: import('../services/tradingAlertStorage.js').PlanAlertState | null,
 *   settingsEnabled: boolean,
 *   quoteIsLive: boolean,
 *   now?: Date,
 *   formatPrice?: (value: number) => string,
 * }} input
 * @returns {{
 *   alert: TradingAlertEvent | null,
 *   nextState: import('../services/tradingAlertStorage.js').PlanAlertState | null,
 * }}
 */
export function evaluatePlanAlertTransition(input) {
  const now = input.now ?? new Date()
  const currentPriceState = input.currentPriceState

  if (input.plan.status !== 'WAITING' && input.plan.status !== 'ENTERED') {
    return { alert: null, nextState: null }
  }

  if (!currentPriceState) {
    return { alert: null, nextState: input.previousState }
  }

  const planStatus = input.plan.status
  const previous = input.previousState

  if (!previous || previous.planStatus !== planStatus) {
    const nextState = {
      planStatus,
      lastPriceState: currentPriceState,
      updatedAt: now.toISOString(),
    }
    return { alert: null, nextState }
  }

  const alertType = getAlertTypeForPriceState(currentPriceState)
  const shouldEvaluateAlert =
    input.settingsEnabled && input.quoteIsLive && alertType != null
  const previousWasSameAlert = previous.lastPriceState === currentPriceState

  let alert = null
  if (shouldEvaluateAlert && !previousWasSameAlert) {
    alert = buildTradingAlertEvent({
      plan: input.plan,
      type: alertType,
      now,
      formatPrice: input.formatPrice,
    })
  }

  const nextState = {
    planStatus,
    lastPriceState: input.quoteIsLive ? currentPriceState : previous.lastPriceState,
    updatedAt: input.quoteIsLive ? now.toISOString() : previous.updatedAt,
  }

  return { alert, nextState }
}

/**
 * @param {TradingAlertEvent} alert
 */
export function getBrowserNotificationTitle(alert) {
  return `ALADDIN · ${alert.symbol}`
}

/**
 * @param {TradingAlertEvent} alert
 */
export function getBrowserNotificationBody(alert) {
  return alert.message
}

/**
 * @param {import('../services/tradingAlertStorage.js').TradingAlertSettings} settings
 */
export function shouldUseBrowserNotifications(settings) {
  if (!settings.enabled || !settings.browserNotifications) return false
  if (typeof Notification === 'undefined') return false
  return Notification.permission === 'granted'
}
