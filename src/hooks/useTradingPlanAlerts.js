/**
 * useTradingPlanAlerts.js — 매매 계획 가격 알림 hook
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getTradingAlertSettings,
  getTradingAlertStates,
  pruneTradingAlertStates,
  saveTradingAlertSettings,
  saveTradingAlertStates,
} from '../services/tradingAlertStorage.js'
import { getActiveTradingPlans } from '../utils/tradingPlanCalculator.js'
import { buildTradingPlanMonitorSnapshot } from '../utils/tradingPlanMonitor.js'
import {
  evaluatePlanAlertTransition,
  getBrowserNotificationBody,
  getBrowserNotificationTitle,
  shouldUseBrowserNotifications,
} from '../utils/tradingAlertUtils.js'
import { formatCurrency } from '../utils/formatters.js'

const TOAST_DURATION_MS = 6000
const MAX_TOASTS = 4

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan[]} plans
 * @param {ReturnType<import('./useUpbitTicker.js').useUpbitTicker>} ticker
 */
export function useTradingPlanAlerts(plans, ticker) {
  const [settings, setSettingsState] = useState(() => getTradingAlertSettings())
  const [toasts, setToasts] = useState([])
  const toastTimersRef = useRef(new Map())

  const activePlans = useMemo(() => getActiveTradingPlans(plans), [plans])

  const persistSettings = useCallback((next) => {
    setSettingsState(next)
    saveTradingAlertSettings(next)
  }, [])

  const dismissToast = useCallback((toastId) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId))
    const timer = toastTimersRef.current.get(toastId)
    if (timer) {
      window.clearTimeout(timer)
      toastTimersRef.current.delete(toastId)
    }
  }, [])

  const pushToast = useCallback(
    (alert) => {
      setToasts((prev) => {
        const next = [{ ...alert, toastId: alert.id }, ...prev]
        return next.slice(0, MAX_TOASTS)
      })

      const timer = window.setTimeout(() => {
        dismissToast(alert.id)
      }, TOAST_DURATION_MS)
      toastTimersRef.current.set(alert.id, timer)
    },
    [dismissToast],
  )

  const showBrowserNotification = useCallback((alert) => {
    if (!shouldUseBrowserNotifications(getTradingAlertSettings())) return
    try {
      new Notification(getBrowserNotificationTitle(alert), {
        body: getBrowserNotificationBody(alert),
      })
    } catch {
      // ignore unsupported environments
    }
  }, [])

  const enableAlerts = useCallback(async () => {
    const next = { ...getTradingAlertSettings(), enabled: true }

    if (
      next.browserNotifications &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      const permission = await Notification.requestPermission()
      next.browserNotifications = permission === 'granted'
    }

    persistSettings(next)
  }, [persistSettings])

  const disableAlerts = useCallback(() => {
    persistSettings({ ...getTradingAlertSettings(), enabled: false })
  }, [persistSettings])

  const toggleAlerts = useCallback(async () => {
    if (settings.enabled) {
      disableAlerts()
      return
    }
    await enableAlerts()
  }, [settings.enabled, disableAlerts, enableAlerts])

  useEffect(() => {
    pruneTradingAlertStates(activePlans.map((plan) => plan.id))
  }, [activePlans])

  useEffect(() => {
    if (!settings.enabled) return

    const tickerContext = {
      isConnected: ticker.isConnected,
      connectionFailed: ticker.connectionFailed,
      getTickerForMarket: ticker.getTickerForMarket,
      now: ticker.now,
      formatPrice: formatCurrency,
    }

    const storedStates = getTradingAlertStates()
    /** @type {Record<string, import('../services/tradingAlertStorage.js').PlanAlertState>} */
    const nextStates = { ...storedStates }
    const newAlerts = []

    for (const plan of activePlans) {
      const snapshot = buildTradingPlanMonitorSnapshot(plan, tickerContext)
      const currentPriceState =
        plan.status === 'WAITING'
          ? snapshot.waitingPriceState
          : snapshot.enteredPriceState

      const { alert, nextState } = evaluatePlanAlertTransition({
        plan,
        currentPriceState,
        previousState: storedStates[plan.id] ?? null,
        settingsEnabled: settings.enabled,
        quoteIsLive: snapshot.isLiveQuote,
        formatPrice: formatCurrency,
      })

      if (nextState) {
        nextStates[plan.id] = nextState
      } else {
        delete nextStates[plan.id]
      }

      if (alert) {
        newAlerts.push(alert)
      }
    }

    saveTradingAlertStates(nextStates)

    for (const alert of newAlerts) {
      pushToast(alert)
      showBrowserNotification(alert)
    }
  }, [
    activePlans,
    settings.enabled,
    ticker.isConnected,
    ticker.connectionFailed,
    ticker.getTickerForMarket,
    ticker.now,
    pushToast,
    showBrowserNotification,
  ])

  useEffect(() => {
    const timers = toastTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  return {
    settings,
    toasts,
    toggleAlerts,
    dismissToast,
    enableAlerts,
    disableAlerts,
  }
}
