/**
 * rateLimit.js — 로그인 brute-force 방어 (메모리, IP 기준)
 */

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5
const BLOCK_MS = 15 * 60 * 1000

/** @type {Map<string, { failures: number, windowStart: number, blockedUntil: number }>} */
const buckets = new Map()

/**
 * @param {string} ip
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim().slice(0, 64)
  }
  return String(req.socket?.remoteAddress || 'unknown').slice(0, 64)
}

/**
 * @param {string} ip
 * @returns {{ allowed: boolean, retryAfterSec?: number }}
 */
export function checkLoginAllowed(ip) {
  const now = Date.now()
  const entry = buckets.get(ip)
  if (!entry) return { allowed: true }

  if (entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000),
    }
  }

  if (now - entry.windowStart > WINDOW_MS) {
    buckets.delete(ip)
    return { allowed: true }
  }

  return { allowed: true }
}

/**
 * @param {string} ip
 */
export function recordLoginFailure(ip) {
  const now = Date.now()
  let entry = buckets.get(ip)

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { failures: 0, windowStart: now, blockedUntil: 0 }
  }

  entry.failures += 1
  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_MS
  }
  buckets.set(ip, entry)
}

/**
 * @param {string} ip
 */
export function recordLoginSuccess(ip) {
  buckets.delete(ip)
}

/** 테스트용 */
export function resetLoginRateLimit() {
  buckets.clear()
}

export const LOGIN_RATE_LIMIT = { WINDOW_MS, MAX_FAILURES, BLOCK_MS }
