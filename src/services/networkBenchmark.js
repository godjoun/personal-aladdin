/**
 * networkBenchmark.js — 중앙 서버 네트워크 벤치마크 (리밸런싱 목표용)
 */

import { getStationCredentials } from './stationClient.js'

const CACHE_KEY = 'aladdin_network_benchmark'

function getApiBase() {
  const configured = import.meta.env.VITE_CENTRAL_API_URL?.trim()

  if (configured) {
    return configured.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined' && import.meta.env.PROD) {
    return window.location.origin
  }

  return 'http://localhost:3001'
}

export function getCachedNetworkBenchmark() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveCachedNetworkBenchmark(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data))
}

/**
 * 중앙 서버에서 네트워크 합산 비중을 가져옵니다.
 * 스테이션 등록·동의 업로드가 선행되어야 의미 있는 데이터가 있습니다.
 *
 * @param {{ targetMode?: 'latest' | 'average', windowDays?: number }} [options]
 */
export async function fetchNetworkBenchmark(options = {}) {
  const credentials = getStationCredentials()

  if (!credentials?.stationKey) {
    throw new Error('스테이션 등록 후 네트워크 벤치마크를 사용할 수 있습니다.')
  }

  const params = new URLSearchParams()
  if (options.targetMode) {
    params.set('targetMode', options.targetMode)
  }
  if (options.windowDays) {
    params.set('windowDays', String(options.windowDays))
  }

  const query = params.toString()
  const url = `${getApiBase()}/api/network/benchmark${query ? `?${query}` : ''}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${credentials.stationKey}`,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `네트워크 벤치마크 조회 실패 (${response.status})`)
  }

  saveCachedNetworkBenchmark(data)
  return data
}
