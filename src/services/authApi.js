/**
 * authApi.js — 로그인/세션 API
 */

import { apiFetch, ensureCsrf, setCsrfToken } from './apiClient.js'

export async function fetchAuthMe(fetchImpl = globalThis.fetch) {
  const response = await apiFetch('/api/auth/me', { method: 'GET' }, fetchImpl)
  if (response.status === 401) {
    return { ok: false, authenticated: false }
  }
  if (!response.ok) {
    return { ok: false, authenticated: false }
  }
  return response.json()
}

export async function login(username, password, fetchImpl = globalThis.fetch) {
  await ensureCsrf(fetchImpl)
  const response = await apiFetch(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
    fetchImpl,
  )
  const payload = await response.json().catch(() => ({}))
  if (payload?.csrfToken) {
    setCsrfToken(payload.csrfToken)
  }
  return { ok: response.ok, status: response.status, ...payload }
}

export async function logout(fetchImpl = globalThis.fetch) {
  await ensureCsrf(fetchImpl)
  const response = await apiFetch(
    '/api/auth/logout',
    { method: 'POST', body: '{}' },
    fetchImpl,
  )
  setCsrfToken('')
  return { ok: response.ok }
}
