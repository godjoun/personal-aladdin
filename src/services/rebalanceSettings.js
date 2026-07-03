/**
 * rebalanceSettings.js — 리밸런싱 목표 모드 설정
 */

const MODE_KEY = 'aladdin_rebalance_mode'
const CONSENT_KEY = 'aladdin_host_consent'
const AUTO_UPLOAD_KEY = 'aladdin_auto_upload'

/** @typedef {'fixed' | 'network'} RebalanceMode */

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
