/**
 * tradingAlertStorage.js — 매매 계획 가격 알림 설정·상태 (localStorage)
 */

export const TRADING_ALERT_SETTINGS_KEY = 'aladdin.tradingAlertSettings.v1'
export const TRADING_ALERT_STATE_KEY = 'aladdin.tradingAlertState.v1'

/**
 * @typedef {Object} TradingAlertSettings
 * @property {boolean} enabled
 * @property {boolean} browserNotifications
 */

/**
 * @typedef {Object} PlanAlertState
 * @property {'WAITING' | 'ENTERED'} planStatus
 * @property {'WAITING' | 'ENTRY_REACHED' | 'HOLDING' | 'STOP_REACHED' | 'TARGET_REACHED'} lastPriceState
 * @property {string} updatedAt
 */

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  browserNotifications: true,
})

/**
 * @returns {TradingAlertSettings}
 */
export function getTradingAlertSettings() {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const raw = localStorage.getItem(TRADING_ALERT_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }

    return {
      enabled: Boolean(parsed.enabled),
      browserNotifications: parsed.browserNotifications !== false,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * @param {TradingAlertSettings} settings
 */
export function saveTradingAlertSettings(settings) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    TRADING_ALERT_SETTINGS_KEY,
    JSON.stringify({
      enabled: Boolean(settings.enabled),
      browserNotifications: settings.browserNotifications !== false,
    }),
  )
}

/**
 * @returns {Record<string, PlanAlertState>}
 */
export function getTradingAlertStates() {
  if (typeof localStorage === 'undefined') return {}

  try {
    const raw = localStorage.getItem(TRADING_ALERT_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    /** @type {Record<string, PlanAlertState>} */
    const result = {}
    for (const [planId, value] of Object.entries(parsed)) {
      const normalized = normalizePlanAlertState(value)
      if (normalized) result[planId] = normalized
    }
    return result
  } catch {
    return {}
  }
}

/**
 * @param {unknown} value
 * @returns {PlanAlertState | null}
 */
export function normalizePlanAlertState(value) {
  if (!value || typeof value !== 'object') return null

  const planStatus = String(value.planStatus ?? '')
  const lastPriceState = String(value.lastPriceState ?? '')
  const updatedAt = String(value.updatedAt ?? '')

  if (planStatus !== 'WAITING' && planStatus !== 'ENTERED') return null
  if (
    lastPriceState !== 'WAITING' &&
    lastPriceState !== 'ENTRY_REACHED' &&
    lastPriceState !== 'HOLDING' &&
    lastPriceState !== 'STOP_REACHED' &&
    lastPriceState !== 'TARGET_REACHED'
  ) {
    return null
  }
  if (Number.isNaN(new Date(updatedAt).getTime())) return null

  return {
    planStatus: /** @type {'WAITING' | 'ENTERED'} */ (planStatus),
    lastPriceState: /** @type {PlanAlertState['lastPriceState']} */ (lastPriceState),
    updatedAt,
  }
}

/**
 * @param {Record<string, PlanAlertState>} states
 */
export function saveTradingAlertStates(states) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TRADING_ALERT_STATE_KEY, JSON.stringify(states))
}

/**
 * @param {string} planId
 * @returns {PlanAlertState | null}
 */
export function getPlanAlertState(planId) {
  const key = String(planId ?? '').trim()
  if (!key) return null
  return getTradingAlertStates()[key] ?? null
}

/**
 * @param {string} planId
 * @param {PlanAlertState} state
 */
export function setPlanAlertState(planId, state) {
  const key = String(planId ?? '').trim()
  if (!key) return

  const next = getTradingAlertStates()
  next[key] = state
  saveTradingAlertStates(next)
}

/**
 * @param {string} planId
 */
export function removePlanAlertState(planId) {
  const key = String(planId ?? '').trim()
  if (!key) return

  const next = getTradingAlertStates()
  if (!Object.prototype.hasOwnProperty.call(next, key)) return
  delete next[key]
  saveTradingAlertStates(next)
}

/**
 * @param {string[]} activePlanIds
 */
export function pruneTradingAlertStates(activePlanIds) {
  const allowed = new Set(
    (Array.isArray(activePlanIds) ? activePlanIds : [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  )

  const current = getTradingAlertStates()
  const next = {}
  let changed = false

  for (const [planId, state] of Object.entries(current)) {
    if (allowed.has(planId)) {
      next[planId] = state
    } else {
      changed = true
    }
  }

  if (changed) {
    saveTradingAlertStates(next)
  }
}

/** 테스트용 */
export function clearTradingAlertStorage() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(TRADING_ALERT_SETTINGS_KEY)
  localStorage.removeItem(TRADING_ALERT_STATE_KEY)
}
