/**
 * tradingLabApi.js — Trading Lab 서버 API 클라이언트
 *
 * 인증 쿠키 + CSRF 는 apiFetch 가 처리한다.
 * 조회/기록 전용이며 주문 관련 호출은 존재하지 않는다.
 */

import { apiFetch } from './apiClient.js'

const BASE = '/api/trading-lab'

export function fetchTradeJournals(symbol, { filter = 'all', offset = 0 } = {}) {
  return call(`${BASE}/journals?${new URLSearchParams({ symbol, filter, offset: String(offset) })}`)
}
export function fetchTradeJournal(tradeId) {
  return call(`${BASE}/shadow-trades/${encodeURIComponent(tradeId)}/journal`)
}
export function createTradeJournal(payload) {
  return call(`${BASE}/journals`, { method: 'POST', body: JSON.stringify(payload) })
}
export function saveTradeJournal(tradeId, payload) {
  return call(`${BASE}/shadow-trades/${encodeURIComponent(tradeId)}/journal`, { method: 'PUT', body: JSON.stringify(payload) })
}
export function uploadJournalImage(journalId, file, uploadId) {
  return call(`${BASE}/journals/${encodeURIComponent(journalId)}/images`, {
    method: 'POST', body: file,
    headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name), 'X-Upload-Id': uploadId },
  })
}
export function removeJournalImage(journalId, imageId) {
  return call(`${BASE}/journals/${encodeURIComponent(journalId)}/images/${encodeURIComponent(imageId)}`, { method: 'DELETE' })
}

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
 * Chart View 공개 캔들. 주문/프라이빗 시세와 무관하다.
 *
 * @param {string} symbol
 * @param {{ timeframe?: string, limit?: number }} [options]
 */
export async function fetchMarketCandles(symbol, options = {}) {
  const params = new URLSearchParams()
  params.set('timeframe', options.timeframe || '1h')
  if (options.limit) params.set('limit', String(options.limit))
  return call(
    `${BASE}/market/${encodeURIComponent(symbol)}/candles?${params.toString()}`,
  )
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
 * @param {string} symbol
 * @param {{ window?: string }} [options]
 */
export async function fetchCvdSummary(symbol, options = {}) {
  const params = new URLSearchParams()
  if (options.window) params.set('window', options.window)
  const query = params.toString()
  return call(
    `${BASE}/cvd/${encodeURIComponent(symbol)}${query ? `?${query}` : ''}`,
  )
}

export async function fetchTradeFlowCollectorStatus() {
  return call(`${BASE}/cvd/status`)
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

/**
 * @param {string} symbol
 */
export async function fetchMarketState(symbol) {
  return call(`${BASE}/market-state/${encodeURIComponent(symbol)}`)
}

/**
 * @param {string} symbol
 * @param {{ limit?: number }} [options]
 */
export async function fetchMarketStateHistory(symbol, options = {}) {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  const query = params.toString()
  return call(
    `${BASE}/market-state/${encodeURIComponent(symbol)}/history${
      query ? `?${query}` : ''
    }`,
  )
}

/**
 * @param {{ symbol?: string, status?: string, limit?: number }} [filter]
 */
export async function fetchShadowTrades(filter = {}) {
  const params = new URLSearchParams()
  if (filter.symbol) params.set('symbol', filter.symbol)
  if (filter.status) params.set('status', filter.status)
  if (filter.limit) params.set('limit', String(filter.limit))
  const query = params.toString()
  return call(`${BASE}/shadow-trades${query ? `?${query}` : ''}`)
}

/**
 * @param {string} id
 */
export async function fetchShadowTrade(id) {
  return call(`${BASE}/shadow-trades/${encodeURIComponent(id)}`)
}

/**
 * @param {object} payload
 */
export async function createShadowTrade(payload) {
  return call(`${BASE}/shadow-trades`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * @param {{ symbol?: string }} [filter]
 */
export async function fetchShadowTradeStats(filter = {}) {
  const params = new URLSearchParams()
  if (filter.symbol) params.set('symbol', filter.symbol)
  const query = params.toString()
  return call(`${BASE}/shadow-trades/stats${query ? `?${query}` : ''}`)
}

export async function fetchShadowTradeSettings() {
  return call(`${BASE}/shadow-trades/settings`)
}

/**
 * @param {{ autoRecord: boolean }} payload
 */
export async function saveShadowTradeSettings(payload) {
  return call(`${BASE}/shadow-trades/settings`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchUpbitStatus() {
  return call(`${BASE}/upbit/status`)
}

export function syncUpbitTrades() {
  return call(`${BASE}/upbit/sync`, { method: 'POST' })
}

export function fetchUpbitTrades(filter = {}) {
  const params = new URLSearchParams()
  if (filter.market) params.set('market', filter.market)
  if (filter.status) params.set('status', filter.status)
  if (filter.limit) params.set('limit', String(filter.limit))
  if (filter.offset) params.set('offset', String(filter.offset))
  const query = params.toString()
  return call(`${BASE}/upbit/trades${query ? `?${query}` : ''}`)
}

export function fetchUpbitQuotes(markets = []) {
  const params = new URLSearchParams({ markets: markets.join(',') })
  return call(`${BASE}/upbit/quotes?${params}`)
}

/**
 * @param {string} id
 * @param {{ userNote?: string | null, userTags?: string[] }} payload
 */
/**
 * @param {{ symbol?: string, limit?: number }} [filter]
 */
export async function fetchStrategyChecks(filter = {}) {
  const params = new URLSearchParams()
  if (filter.symbol) params.set('symbol', filter.symbol)
  if (filter.limit) params.set('limit', String(filter.limit))
  const query = params.toString()
  return call(`${BASE}/strategy-checks${query ? `?${query}` : ''}`)
}

/**
 * @param {object} payload
 */
export async function createStrategyCheck(payload) {
  return call(`${BASE}/strategy-checks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * @param {string} id
 */
export async function createStrategyShadowTrade(id) {
  return call(`${BASE}/strategy-checks/${encodeURIComponent(id)}/shadow-trade`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/**
 * @param {{ symbol: string, timeframe?: string }} filter
 */
export async function fetchChartAnnotations(filter) {
  const params = new URLSearchParams()
  params.set('symbol', filter.symbol)
  if (filter.timeframe) params.set('timeframe', filter.timeframe)
  return call(`${BASE}/chart-annotations?${params.toString()}`)
}

/**
 * @param {object} payload
 */
export async function createChartAnnotation(payload) {
  return call(`${BASE}/chart-annotations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * @param {string} id
 * @param {object} payload
 */
export async function patchChartAnnotation(id, payload) {
  return call(`${BASE}/chart-annotations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * @param {string} id
 */
export async function deleteChartAnnotation(id) {
  return call(`${BASE}/chart-annotations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/**
 * @param {string} id
 * @param {{ userNote?: string | null, userTags?: string[] }} payload
 */
export async function patchShadowTrade(id, payload) {
  return call(`${BASE}/shadow-trades/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
