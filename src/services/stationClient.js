/**
 * stationClient.js — 중앙 서버(ALADDIN Host) 연동
 */

import { exportLocalVault } from './dataExport.js'
import {
  getAutoUploadEnabled,
  getHostConsentSaved,
  setAutoUploadEnabled,
  setHostConsentSaved,
} from './rebalanceSettings.js'

const CREDENTIALS_KEY = 'aladdin_station_credentials'
const DEFAULT_API_BASE = 'http://localhost:3001'

function getApiBase() {
  const configured = import.meta.env.VITE_CENTRAL_API_URL?.trim()

  if (configured) {
    return configured.replace(/\/$/, '')
  }

  // 배포 후에는 앱·API 가 같은 주소 (예: https://내앱.onrender.com)
  if (typeof window !== 'undefined' && import.meta.env.PROD) {
    return window.location.origin
  }

  return DEFAULT_API_BASE
}

export function getStationCredentials() {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveStationCredentials(credentials) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
}

export function clearStationCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY)
}

/**
 * 중앙 서버에 새 스테이션 등록
 */
export async function registerStation(name) {
  const response = await fetch(`${getApiBase()}/api/stations/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `등록 실패 (${response.status})`)
  }

  const credentials = {
    stationId: data.stationId,
    stationKey: data.stationKey,
    name: data.name,
    registeredAt: new Date().toISOString(),
  }

  saveStationCredentials(credentials)

  return credentials
}

/**
 * 로컬 vault → 중앙 서버 업로드
 */
export async function pushVaultToCentral({ consentHostMonitoring = false } = {}) {
  const credentials = getStationCredentials()

  if (!credentials?.stationKey) {
    throw new Error('스테이션이 등록되지 않았습니다.')
  }

  if (!consentHostMonitoring) {
    throw new Error('호스트 모니터링 동의가 필요합니다.')
  }

  const payload = {
    ...exportLocalVault(),
    consent: {
      hostMonitoring: true,
      agreedAt: new Date().toISOString(),
      scope: 'portfolio_trades_snapshots',
    },
  }

  const response = await fetch(`${getApiBase()}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.stationKey}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `업로드 실패 (${response.status})`)
  }

  return data
}

/**
 * 가격 갱신 후 자동 업로드 (설정·동의·등록이 모두 있을 때만)
 */
export async function maybeAutoPushToCentral() {
  if (!getAutoUploadEnabled() || !getHostConsentSaved()) {
    return null
  }

  const credentials = getStationCredentials()

  if (!credentials?.stationKey) {
    return null
  }

  try {
    return await pushVaultToCentral({ consentHostMonitoring: true })
  } catch (error) {
    console.warn('[stationClient] 자동 업로드 실패:', error.message)
    return null
  }
}

/**
 * 중앙 서버 연결 확인
 */
export async function checkCentralHealth() {
  try {
    const response = await fetch(`${getApiBase()}/api/health`)
    if (!response.ok) return false
    const data = await response.json()
    return data.ok === true
  } catch {
    return false
  }
}

export function getCentralAdminUrl() {
  return `${getApiBase()}/admin/`
}

/** 호스트 콘솔 → 앱 홈 링크용 (localStorage 에 기억) */
export function getHomeAppUrl() {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/`
  }
  return '/'
}

export function rememberHomeAppUrl() {
  if (typeof window !== 'undefined') {
    localStorage.setItem('aladdin_home_url', getHomeAppUrl())
  }
}
