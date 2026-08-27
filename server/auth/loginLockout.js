/**
 * loginLockout.js — 계정 단위 로그인 잠금 (SQLite)
 *
 * - 연속 실패 5회 → 15분 잠금
 * - lockedUntil 경과 시 자동 해제
 * - 성공 시 실패 횟수 초기화
 * - 브라우저/localStorage 미사용
 */

import { getDb } from '../db.js'

export const ACCOUNT_LOCK_MAX_FAILURES = 5
export const ACCOUNT_LOCK_MS = 15 * 60 * 1000

export const LOGIN_FAIL_MESSAGE = '아이디 또는 비밀번호를 확인해주세요.'
export const LOGIN_LOCK_MESSAGE =
  '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'

/**
 * @param {string} username
 * @returns {string}
 */
function normalizeUsername(username) {
  return String(username ?? '').trim().slice(0, 64)
}

/**
 * @param {import('better-sqlite3').Database} [db]
 * @param {string} username
 * @returns {{ failedAttempts: number, lockedUntil: number | null }}
 */
export function getLoginLockoutState(username, db = getDb()) {
  const key = normalizeUsername(username)
  if (!key) {
    return { failedAttempts: 0, lockedUntil: null }
  }

  const row = db
    .prepare(
      `SELECT failed_attempts AS failedAttempts, locked_until AS lockedUntil
       FROM login_lockout WHERE username = ?`,
    )
    .get(key)

  if (!row) {
    return { failedAttempts: 0, lockedUntil: null }
  }

  return {
    failedAttempts: Number(row.failedAttempts) || 0,
    lockedUntil:
      row.lockedUntil == null || row.lockedUntil === ''
        ? null
        : Number(row.lockedUntil),
  }
}

/**
 * 잠금 여부. 만료된 잠금은 자동 해제한다.
 *
 * @param {string} username
 * @param {{ now?: number, db?: import('better-sqlite3').Database }} [options]
 * @returns {{ locked: boolean, failedAttempts: number, lockedUntil: number | null }}
 */
export function checkAccountLoginLock(username, options = {}) {
  const now = options.now ?? Date.now()
  const db = options.db ?? getDb()
  const key = normalizeUsername(username)
  const state = getLoginLockoutState(key, db)

  if (state.lockedUntil != null && state.lockedUntil > now) {
    return {
      locked: true,
      failedAttempts: state.failedAttempts,
      lockedUntil: state.lockedUntil,
    }
  }

  if (state.lockedUntil != null && state.lockedUntil <= now) {
    clearAccountLoginLockout(key, db)
    return { locked: false, failedAttempts: 0, lockedUntil: null }
  }

  return {
    locked: false,
    failedAttempts: state.failedAttempts,
    lockedUntil: null,
  }
}

/**
 * @param {string} username
 * @param {{ now?: number, db?: import('better-sqlite3').Database }} [options]
 * @returns {{ failedAttempts: number, lockedUntil: number | null, locked: boolean }}
 */
export function recordAccountLoginFailure(username, options = {}) {
  const now = options.now ?? Date.now()
  const db = options.db ?? getDb()
  const key = normalizeUsername(username)
  if (!key) {
    return { failedAttempts: 0, lockedUntil: null, locked: false }
  }

  const current = checkAccountLoginLock(key, { now, db })
  if (current.locked) {
    return {
      failedAttempts: current.failedAttempts,
      lockedUntil: current.lockedUntil,
      locked: true,
    }
  }

  const failedAttempts = current.failedAttempts + 1
  let lockedUntil = null
  if (failedAttempts >= ACCOUNT_LOCK_MAX_FAILURES) {
    lockedUntil = now + ACCOUNT_LOCK_MS
  }

  db.prepare(
    `INSERT INTO login_lockout (username, failed_attempts, locked_until)
     VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       failed_attempts = excluded.failed_attempts,
       locked_until = excluded.locked_until`,
  ).run(key, failedAttempts, lockedUntil)

  return {
    failedAttempts,
    lockedUntil,
    locked: lockedUntil != null && lockedUntil > now,
  }
}

/**
 * @param {string} username
 * @param {import('better-sqlite3').Database} [db]
 */
export function clearAccountLoginLockout(username, db = getDb()) {
  const key = normalizeUsername(username)
  if (!key) return
  db.prepare('DELETE FROM login_lockout WHERE username = ?').run(key)
}

/** 테스트용 */
export function resetAccountLoginLockouts(db = getDb()) {
  db.prepare('DELETE FROM login_lockout').run()
}
