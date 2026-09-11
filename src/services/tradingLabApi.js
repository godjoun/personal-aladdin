/**
 * tradingLabApi.js — Trading Lab 서버 API 클라이언트
 *
 * 인증 쿠키 + CSRF 는 apiFetch 가 처리한다.
 * 조회/기록 전용이며 주문 관련 호출은 존재하지 않는다.
 */

import { apiFetch } from './apiClient.js'

const BASE = '/api/trading-lab'

/**
 * @param {Response} response
 */
async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 */
async function call(url, options = {}) {
  const response = await apiFetch(url, options)
  const payload = await readJson(response)

  if (!response.ok) {
    const error = new Error(payload?.message || 'Trading Lab 요청이 실패했습니다.')
    error.status = response.status
    error.field = payload?.field || null
    throw error
  }

  return payload
}

export async function fetchTradingLabConfig() {
  return call(`${BASE}/config`)
}

/**
 * @param {string} symbol
 */
export async function fetchMarketSnapshot(symbol) {
  return call(`${BASE}/market/${encodeURIComponent(symbol)}`)
}

/**
 * @param {{ symbol?: string, bias?: string, limit?: number }} [filter]
 */
export async function fetchAnalyses(filter = {}) {
  const params = new URLSearchParams()
  if (filter.symbol) params.set('symbol', filter.symbol)
  if (filter.bias) params.set('bias', filter.bias)
  if (filter.limit) params.set('limit', String(filter.limit))
  const query = params.toString()
  return call(`${BASE}/analyses${query ? `?${query}` : ''}`)
}

/**
 * @param {string} id
 */
export async function fetchAnalysisDetail(id) {
  return call(`${BASE}/analyses/${encodeURIComponent(id)}`)
}

/**
 * @param {object} payload
 */
export async function createAnalysis(payload) {
  return call(`${BASE}/analyses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * @param {string} id
 */
export async function deleteAnalysis(id) {
  return call(`${BASE}/analyses/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * @param {string} id
 * @param {object} payload
 */
export async function saveAnalysisOutcome(id, payload) {
  return call(`${BASE}/analyses/${encodeURIComponent(id)}/outcome`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

/**
 * 차트 캡처 metadata 등록. 이미지 자체는 아직 업로드하지 않는다.
 *
 * @param {string} analysisId
 * @param {object} payload
 */
export async function createAnalysisScreenshot(analysisId, payload) {
  return call(`${BASE}/analyses/${encodeURIComponent(analysisId)}/screenshots`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * @param {string} symbol
 * @param {{ window?: string }} [options]
 */
export async function fetchObservedLiquidations(symbol, options = {}) {
  const params = new URLSearchParams()
  if (options.window) params.set('window', options.window)
  const query = params.toString()
  return call(
    `${BASE}/liquidations/${encodeURIComponent(symbol)}${query ? `?${query}` : ''}`,
  )
}

export async function fetchLiquidationCollectorStatus() {
  return call(`${BASE}/liquidations/status`)
}

/**
 * @param {{ symbol?: string, limit?: number }} [filter]
 */
export async function fetchLiquidationSnapshots(filter = {}) {
  const params = new URLSearchParams()
  if (filter.symbol) params.set('symbol', filter.symbol)
  if (filter.limit) params.set('limit', String(filter.limit))
  const query = params.toString()
  return call(`${BASE}/liquidations${query ? `?${query}` : ''}`)
}

/**
 * @param {object} payload
 */
export async function createLiquidationSnapshot(payload) {
  return call(`${BASE}/liquidations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchTradingLabStats() {
  return call(`${BASE}/stats`)
}
