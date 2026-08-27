/**
 * apiClient.js — credentials + CSRF 포함 fetch
 */

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './authConstants.js'

let csrfTokenMemory = ''

function readCookie(name) {
  if (typeof document === 'undefined') return ''
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  if (!match) return ''
  try {
    return decodeURIComponent(match.slice(name.length + 1))
  } catch {
    return match.slice(name.length + 1)
  }
}

export function getCsrfToken() {
  return csrfTokenMemory || readCookie(CSRF_COOKIE_NAME)
}

export function setCsrfToken(token) {
  csrfTokenMemory = token || ''
}

/**
 * CSRF 쿠키/토큰 확보
 */
export async function ensureCsrf(fetchImpl = globalThis.fetch) {
  const existing = getCsrfToken()
  if (existing) return existing

  const response = await fetchImpl('/api/auth/csrf', {
    method: 'GET',
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error('Failed to obtain CSRF token')
  }
  const payload = await response.json()
  if (payload?.csrfToken) {
    setCsrfToken(payload.csrfToken)
  }
  return getCsrfToken()
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {typeof fetch} [fetchImpl]
 */
export async function apiFetch(url, options = {}, fetchImpl = globalThis.fetch) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})

  if (method !== 'GET' && method !== 'HEAD') {
    const token = await ensureCsrf(fetchImpl)
    if (token) {
      headers.set(CSRF_HEADER_NAME, token)
    }
  }

  if (
    options.body &&
    !headers.has('Content-Type') &&
    !(options.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchImpl(url, {
    ...options,
    method,
    headers,
    credentials: 'include',
  })

  if (response.status === 401) {
    const event = new CustomEvent('aladdin:unauthorized')
    window.dispatchEvent?.(event)
  }

  return response
}
