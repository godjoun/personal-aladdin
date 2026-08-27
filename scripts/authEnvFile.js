/**
 * authEnvFile.js — .env 의 ALADDIN auth 키만 안전하게 추가/갱신
 * (다른 키·주석·빈 줄은 보존)
 */

import { randomBytes } from 'crypto'

export const AUTH_ENV_KEYS = Object.freeze([
  'ALADDIN_ADMIN_USERNAME',
  'ALADDIN_ADMIN_PASSWORD_HASH',
  'ALADDIN_SESSION_SECRET',
])

export const MIN_PASSWORD_LENGTH = 8
export const SESSION_SECRET_BYTES = 32

/**
 * @param {number} [byteLength]
 * @returns {string} hex 인코딩 시크릿 (길이 = byteLength * 2)
 */
export function generateSessionSecret(byteLength = SESSION_SECRET_BYTES) {
  const n = Number(byteLength)
  if (!Number.isInteger(n) || n < SESSION_SECRET_BYTES) {
    throw new Error(`Session secret requires at least ${SESSION_SECRET_BYTES} bytes`)
  }
  return randomBytes(n).toString('hex')
}

/**
 * @param {string} password
 * @param {string} confirm
 * @param {number} [minLength]
 * @returns {{ ok: true } | { ok: false, code: 'mismatch' | 'too_short' }}
 */
export function validatePasswordPair(
  password,
  confirm,
  minLength = MIN_PASSWORD_LENGTH,
) {
  if (password !== confirm) {
    return { ok: false, code: 'mismatch' }
  }
  if (typeof password !== 'string' || password.length < minLength) {
    return { ok: false, code: 'too_short' }
  }
  return { ok: true }
}

/**
 * @param {unknown} input
 * @returns {string}
 */
export function sanitizeUsername(input) {
  const username = String(input ?? '').trim()
  if (!username) {
    throw new Error('아이디를 입력해주세요.')
  }
  if (username.includes('\r') || username.includes('\n') || username.includes('\u0000') || username.includes('=')) {
    throw new Error('아이디에 사용할 수 없는 문자가 있습니다.')
  }
  if (username.length > 64) {
    throw new Error('아이디는 64자 이하여야 합니다.')
  }
  return username
}

/**
 * .env 텍스트에서 지정 키만 갱신/추가. 그 외 내용은 그대로 둔다.
 *
 * @param {string} content
 * @param {Record<string, string>} updates
 * @returns {string}
 */
export function upsertEnvVars(content, updates) {
  const updateKeys = Object.keys(updates)
  if (updateKeys.length === 0) {
    return content ?? ''
  }

  for (const key of updateKeys) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid env key: ${key}`)
    }
    const value = updates[key]
    if (typeof value !== 'string') {
      throw new Error(`Env value for ${key} must be a string`)
    }
    if (value.includes('\r') || value.includes('\n') || value.includes('\u0000')) {
      throw new Error(`Env value for ${key} must be a single line`)
    }
  }

  const found = new Set()
  const raw = content ?? ''
  const lines = raw.length === 0 ? [] : raw.split(/\r?\n/)

  const mapped = lines.map((line) => {
    if (!line || line.trimStart().startsWith('#')) {
      return line
    }
    const eq = line.indexOf('=')
    if (eq <= 0) return line
    const key = line.slice(0, eq)
    if (!Object.prototype.hasOwnProperty.call(updates, key)) {
      return line
    }
    found.add(key)
    return `${key}=${updates[key]}`
  })

  const missing = updateKeys.filter((key) => !found.has(key))
  if (missing.length > 0) {
    if (mapped.length > 0 && mapped[mapped.length - 1] === '') {
      mapped.pop()
    }
    for (const key of missing) {
      mapped.push(`${key}=${updates[key]}`)
    }
  }

  let out = mapped.join('\n')
  if (out.length > 0 && !out.endsWith('\n')) {
    out += '\n'
  }
  return out
}

/**
 * auth 3키만 갱신한 새 .env 본문 생성
 *
 * @param {string} content
 * @param {{
 *   username: string,
 *   passwordHash: string,
 *   sessionSecret: string,
 * }} auth
 * @returns {string}
 */
export function applyAuthEnvVars(content, auth) {
  return upsertEnvVars(content, {
    ALADDIN_ADMIN_USERNAME: auth.username,
    ALADDIN_ADMIN_PASSWORD_HASH: auth.passwordHash,
    ALADDIN_SESSION_SECRET: auth.sessionSecret,
  })
}
