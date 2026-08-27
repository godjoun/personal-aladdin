/**
 * cookies.js — Cookie 파싱/설정 (추가 dependency 없음)
 */

/**
 * @param {string | undefined} header
 * @returns {Record<string, string>}
 */
export function parseCookieHeader(header) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!header || typeof header !== 'string') return out

  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key || key.length > 64) continue
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

/**
 * @param {import('express').Response} res
 * @param {string} name
 * @param {string} value
 * @param {{
 *   httpOnly?: boolean,
 *   secure?: boolean,
 *   sameSite?: 'Strict' | 'Lax' | 'None',
 *   path?: string,
 *   maxAgeMs?: number,
 *   expires?: Date,
 * }} options
 */
export function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${options.path || '/'}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  parts.push(`SameSite=${options.sameSite || 'Strict'}`)
  if (options.maxAgeMs != null) {
    parts.push(`Max-Age=${Math.floor(options.maxAgeMs / 1000)}`)
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }
  res.append('Set-Cookie', parts.join('; '))
}

/**
 * @param {import('express').Response} res
 * @param {string} name
 * @param {{ secure?: boolean }} [options]
 */
export function clearCookie(res, name, options = {}) {
  setCookie(res, name, '', {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'Strict',
    path: '/',
    maxAgeMs: 0,
    expires: new Date(0),
  })
}
