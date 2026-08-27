import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../db.js'
import {
  ACCOUNT_LOCK_MAX_FAILURES,
  ACCOUNT_LOCK_MS,
  checkAccountLoginLock,
  clearAccountLoginLockout,
  getLoginLockoutState,
  recordAccountLoginFailure,
  resetAccountLoginLockouts,
} from './loginLockout.js'

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-lock-'))
const DB_PATH = path.join(TEMP_DIR, 'lock.sqlite')

describe('account login lockout (SQLite)', () => {
  /** @type {import('better-sqlite3').Database} */
  let db

  beforeEach(() => {
    db = getDb({ dbPath: DB_PATH })
    resetAccountLoginLockouts(db)
  })

  afterEach(() => {
    try {
      db?.close()
    } catch {
      // ignore
    }
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(`${DB_PATH}${suffix}`)
      } catch {
        // ignore
      }
    }
  })

  it('1~4회 실패 → 잠기지 않음', () => {
    const t0 = 1_700_000_000_000
    for (let i = 1; i <= 4; i += 1) {
      const result = recordAccountLoginFailure('admin', { now: t0, db })
      expect(result.locked).toBe(false)
      expect(result.failedAttempts).toBe(i)
      expect(result.lockedUntil).toBeNull()
    }

    const state = checkAccountLoginLock('admin', { now: t0, db })
    expect(state.locked).toBe(false)
    expect(state.failedAttempts).toBe(4)
  })

  it('5회 실패 → 잠김', () => {
    const t0 = 1_700_000_000_000
    for (let i = 0; i < 4; i += 1) {
      recordAccountLoginFailure('admin', { now: t0, db })
    }
    const fifth = recordAccountLoginFailure('admin', { now: t0, db })
    expect(fifth.locked).toBe(true)
    expect(fifth.failedAttempts).toBe(ACCOUNT_LOCK_MAX_FAILURES)
    expect(fifth.lockedUntil).toBe(t0 + ACCOUNT_LOCK_MS)

    const state = getLoginLockoutState('admin', db)
    expect(state.failedAttempts).toBe(5)
    expect(state.lockedUntil).toBe(t0 + ACCOUNT_LOCK_MS)
  })

  it('잠금 중 로그인 차단', () => {
    const t0 = 1_700_000_000_000
    for (let i = 0; i < ACCOUNT_LOCK_MAX_FAILURES; i += 1) {
      recordAccountLoginFailure('admin', { now: t0, db })
    }

    const mid = checkAccountLoginLock('admin', {
      now: t0 + ACCOUNT_LOCK_MS - 1,
      db,
    })
    expect(mid.locked).toBe(true)
  })

  it('15분 경과 후 로그인 가능', () => {
    const t0 = 1_700_000_000_000
    for (let i = 0; i < ACCOUNT_LOCK_MAX_FAILURES; i += 1) {
      recordAccountLoginFailure('admin', { now: t0, db })
    }

    const after = checkAccountLoginLock('admin', {
      now: t0 + ACCOUNT_LOCK_MS,
      db,
    })
    expect(after.locked).toBe(false)
    expect(after.failedAttempts).toBe(0)
    expect(getLoginLockoutState('admin', db).failedAttempts).toBe(0)
  })

  it('성공 로그인 후 실패 횟수 초기화', () => {
    const t0 = 1_700_000_000_000
    recordAccountLoginFailure('admin', { now: t0, db })
    recordAccountLoginFailure('admin', { now: t0, db })
    expect(getLoginLockoutState('admin', db).failedAttempts).toBe(2)

    clearAccountLoginLockout('admin', db)
    expect(getLoginLockoutState('admin', db)).toEqual({
      failedAttempts: 0,
      lockedUntil: null,
    })
  })

  it('비밀번호/hash 를 상태에 저장하지 않는다', () => {
    recordAccountLoginFailure('admin', { now: Date.now(), db })
    const row = db.prepare('SELECT * FROM login_lockout WHERE username = ?').get('admin')
    const dumped = JSON.stringify(row)
    expect(dumped).not.toMatch(/password|scrypt|secret|hash/i)
    expect(row).toHaveProperty('failed_attempts')
    expect(row).toHaveProperty('locked_until')
  })
})
