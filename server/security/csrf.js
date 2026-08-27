/**
 * csrf.js — Origin 검증 + double-submit CSRF 쿠키
 */

import { randomBytes, timingSafeEqual } from 'crypto'

export const CSRF_COOKIE = 'aladdin_csrf'
export const CSRF_HEADER = 'x-csrf-token'

/**
 * @returns {string[]}
 */
export function getAllowedOrigins() {
  const configured = process.env.ALADDIN_ALLOWED_ORIGIN?.trim()
  if (configured) {
    return configured.split(',').map((s) => s.trim()).filter(Boolean)
  }

  if (process.env.NODE_ENV === 'production') {
    return [] // same-origin only — Origin 없으면 통과, 있으면 거부(불일치 시)
  }

  return [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ]
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isOriginAllowed(req) {
  const origin = req.get('origin')
  const referer = req.get('referer')

  // same-origin 배포: Origin/Referer 없는 브라우저 요청 허용
  if (!origin && !referer) {
    return true
  }

  const allowed = getAllowedOrigins()

  if (origin) {
    if (allowed.length === 0) {
      // production same-origin: Origin이 있으면 Host와 일치해야 함
      const host = req.get('host')
      try {
        const originHost = new URL(origin).host
        return Boolean(host) && originHost === host
      } catch {
        return false
      }
    }
    return allowed.includes(origin)
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin
      if (allowed.length === 0) {
        const host = req.get('host')
        return new URL(referer).host === host
      }
      return allowed.includes(refOrigin)
    } catch {
      return false
    }
  }

  return false
}

export function createCsrfToken() {
  return randomBytes(32).toString('hex')
}

/**
 * @param {string | undefined} cookieToken
 * @param {string | undefined} headerToken
 */
export function verifyCsrfTokens(cookieToken, headerToken) {
  if (!cookieToken || !headerToken) return false
  if (cookieToken.length < 32 || headerToken.length < 32) return false
  if (cookieToken.length !== headerToken.length) return false
  try {
    return timingSafeEqual(
      Buffer.from(cookieToken, 'utf8'),
      Buffer.from(headerToken, 'utf8'),
    )
  } catch {
    return false
  }
}

/**
 * 상태 변경 메서드 CSRF 가드
 */
export function requireCsrf(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next()
    return
  }

  if (!isOriginAllowed(req)) {
    res.status(403).json({ ok: false, message: 'Forbidden' })
    return
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE]
  const headerToken = req.get(CSRF_HEADER)
  if (!verifyCsrfTokens(cookieToken, headerToken)) {
    res.status(403).json({ ok: false, message: 'Forbidden' })
    return
  }

  next()
}
