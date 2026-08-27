/**
 * password.js — scrypt 기반 비밀번호 해시 (추가 인증 dependency 없음)
 *
 * 저장 형식: scrypt$N$r$p$saltB64$hashB64
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const DEFAULT_N = 16384
const DEFAULT_R = 8
const DEFAULT_P = 1
const KEYLEN = 64
const SALT_LEN = 16

/**
 * @param {string} password
 * @returns {string} 저장용 해시 문자열
 */
export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 1) {
    throw new Error('Password is required')
  }
  if (password.length > 256) {
    throw new Error('Password too long')
  }

  const salt = randomBytes(SALT_LEN)
  const hash = scryptSync(password, salt, KEYLEN, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
  })

  return [
    'scrypt',
    String(DEFAULT_N),
    String(DEFAULT_R),
    String(DEFAULT_P),
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$')
}

/**
 * @param {string} password
 * @param {string} encoded
 * @returns {boolean}
 */
export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') {
    return false
  }

  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (![N, r, p].every((n) => Number.isFinite(n) && n > 0)) {
    return false
  }

  let salt
  let expected
  try {
    salt = Buffer.from(parts[4], 'base64')
    expected = Buffer.from(parts[5], 'base64')
  } catch {
    return false
  }

  if (salt.length < 8 || expected.length < 16) {
    return false
  }

  let actual
  try {
    actual = scryptSync(password, salt, expected.length, { N, r, p })
  } catch {
    return false
  }

  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}
