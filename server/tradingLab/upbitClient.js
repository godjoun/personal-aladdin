/**
 * Upbit 주문조회 전용 REST client.
 * POST /orders, cancel, deposit, withdraw endpoint는 존재하지 않는다.
 */

import { createUpbitJwt } from './upbitAuth.js'

export const UPBIT_API_BASE_URL = 'https://api.upbit.com'
export const UPBIT_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const UPBIT_CLOSED_ORDER_LIMIT = 1000

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeErrorCode(payload, status) {
  return String(payload?.error?.name || payload?.name || `HTTP_${status}`).slice(0, 80)
}

function safeErrorMessage(payload) {
  return String(payload?.error?.message || payload?.message || 'Upbit request failed').slice(0, 160)
}

export function buildUpbitQuery(pairs = []) {
  const raw = pairs.map(([key, value]) => `${key}=${value}`).join('&')
  const encoded = pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  return { raw, encoded }
}

export function splitUpbitWindows(startMs, endMs, maxWindowMs = UPBIT_MAX_WINDOW_MS) {
  const windows = []
  let cursor = startMs
  while (cursor < endMs) {
    const next = Math.min(cursor + maxWindowMs, endMs)
    windows.push({ startMs: cursor, endMs: next })
    cursor = next
  }
  return windows
}

/**
 * @param {{
 *  accessKey: string,
 *  secretKey: string,
 *  fetchImpl?: typeof fetch,
 *  baseUrl?: string,
 *  maxRetries?: number,
 *  retryBaseMs?: number,
 * }} options
 */
export function createUpbitRestClient(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const baseUrl = options.baseUrl || UPBIT_API_BASE_URL
  const maxRetries = options.maxRetries ?? 2
  const retryBaseMs = options.retryBaseMs ?? 250

  async function request(path, pairs = []) {
    const { raw, encoded } = buildUpbitQuery(pairs)
    const url = `${baseUrl}${path}${encoded ? `?${encoded}` : ''}`
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const token = createUpbitJwt({
        accessKey: options.accessKey,
        secretKey: options.secretKey,
        queryString: raw,
      })
      let response
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
      } catch {
        if (attempt >= maxRetries) {
          const safe = new Error('Upbit network request failed')
          safe.code = 'NETWORK_ERROR'
          throw safe
        }
        await delay(retryBaseMs * 2 ** attempt)
        continue
      }
      const payload = await response.json().catch(() => null)
      if (response.ok) {
        return {
          data: payload,
          remainingReq: response.headers?.get?.('Remaining-Req') || null,
        }
      }
      if (response.status === 429 && attempt < maxRetries) {
        await delay(retryBaseMs * 2 ** attempt)
        continue
      }
      const safe = new Error(safeErrorMessage(payload))
      safe.code = safeErrorCode(payload, response.status)
      safe.status = response.status
      throw safe
    }
    throw new Error('Upbit request failed')
  }

  return {
    async getOrder(uuid) {
      return (await request('/v1/order', [['uuid', uuid]])).data
    },
    async listClosedOrders({ startMs, endMs }) {
      const pairs = [
        ['states[]', 'done'],
        ['states[]', 'cancel'],
        ['start_time', new Date(startMs).toISOString()],
        ['end_time', new Date(endMs).toISOString()],
        ['limit', String(UPBIT_CLOSED_ORDER_LIMIT)],
        ['order_by', 'asc'],
      ]
      return (await request('/v1/orders/closed', pairs)).data
    },
  }
}
