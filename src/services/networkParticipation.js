/**
 * networkParticipation.js — 네트워크 참여 통합 설정
 * 동의 · 자동 업로드 · 네트워크 리밸런싱 목표를 한 스위치로 묶습니다.
 */

import {
  getHostConsentSaved,
  setHostConsentSaved,
  setAutoUploadEnabled,
  getRebalanceMode,
  setRebalanceMode,
} from './rebalanceSettings.js'

export const NETWORK_PARTICIPATION_CHANGED = 'aladdin:network-participation-changed'

export function getNetworkParticipationEnabled() {
  return getHostConsentSaved() && getRebalanceMode() === 'network'
}

export function setNetworkParticipationEnabled(enabled) {
  if (enabled) {
    setHostConsentSaved(true)
    setAutoUploadEnabled(true)
    setRebalanceMode('network')
  } else {
    setHostConsentSaved(false)
    setAutoUploadEnabled(false)
    setRebalanceMode('fixed')
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(NETWORK_PARTICIPATION_CHANGED, {
        detail: { enabled },
      }),
    )
  }
}

export function syncNetworkParticipationState() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(NETWORK_PARTICIPATION_CHANGED, {
        detail: { enabled: getNetworkParticipationEnabled() },
      }),
    )
  }
}
