/**
 * rebalanceSettings.js — 리밸런싱 목표 모드 설정
 */

const MODE_KEY = 'aladdin_rebalance_mode'
const CONSENT_KEY = 'aladdin_host_consent'
const AUTO_UPLOAD_KEY = 'aladdin_auto_upload'
const NETWORK_TARGET_MODE_KEY = 'aladdin_network_target_mode'
const NETWORK_WINDOW_DAYS_KEY = 'aladdin_network_window_days'

export const NETWORK_TARGET_SETTINGS_CHANGED = 'aladdin:network-target-settings-changed'

function dispatchNetworkTargetSettingsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NETWORK_TARGET_SETTINGS_CHANGED))
  }
}

/** @typedef {'fixed' | 'network'} RebalanceMode */
/** @typedef {'latest' | 'average'} NetworkTargetMode */

/**
 * @returns {RebalanceMode}
 */
export function getRebalanceMode() {
  const stored = localStorage.getItem(MODE_KEY)
  return stored === 'network' ? 'network' : 'fixed'
}

/**
 * @param {RebalanceMode} mode
 */
export function setRebalanceMode(mode) {
  localStorage.setItem(MODE_KEY, mode)
}

export function getHostConsentSaved() {
  return localStorage.getItem(CONSENT_KEY) === 'true'
}

export function setHostConsentSaved(agreed) {
  localStorage.setItem(CONSENT_KEY, agreed ? 'true' : 'false')
}

export function getAutoUploadEnabled() {
  return localStorage.getItem(AUTO_UPLOAD_KEY) === 'true'
}

export function setAutoUploadEnabled(enabled) {
  localStorage.setItem(AUTO_UPLOAD_KEY, enabled ? 'true' : 'false')
}

/**
 * @returns {NetworkTargetMode}
 */
export function getNetworkTargetMode() {
  return localStorage.getItem(NETWORK_TARGET_MODE_KEY) === 'average'
    ? 'average'
    : 'latest'
}

/**
 * @param {NetworkTargetMode} mode
 */
export function setNetworkTargetMode(mode) {
  localStorage.setItem(NETWORK_TARGET_MODE_KEY, mode === 'average' ? 'average' : 'latest')
  dispatchNetworkTargetSettingsChanged()
}

export function getNetworkWindowDays() {
  const stored = Number.parseInt(localStorage.getItem(NETWORK_WINDOW_DAYS_KEY) ?? '30', 10)
  if (stored === 7 || stored === 14 || stored === 30) {
    return stored
  }
  return 30
}

/**
 * @param {7 | 14 | 30} days
 */
export function setNetworkWindowDays(days) {
  localStorage.setItem(NETWORK_WINDOW_DAYS_KEY, String(days))
  dispatchNetworkTargetSettingsChanged()
}
