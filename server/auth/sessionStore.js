/**
 * sessionStore.js — 서버 세션 (세션 ID 원문 미저장, HMAC hash만 저장)
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { getDb } from '../db.js'

const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12h
const COOKIE_NAME = 'aladdin_sid'

/**
 * @returns {string}
 */
export function getSessionCookieName() {
  return COOKIE_NAME
}

function requireSessionSecret() {
  const secret = process.env.ALADDIN_SESSION_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('ALADDIN_SESSION_SECRET must be set (min 32 chars)')
  }
  return secret
}

/**
 * @param {string} sessionId
 * @returns {string}
 */
export function hashSessionId(sessionId) {
  const secret = requireSessionSecret()
  return createHmac('sha256', secret).update(sessionId).digest('hex')
}

/**
 * @param {import('better-sqlite3').Database} [db]
 */
export function ensureSessionTable(db = getDb()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `)
}

/**
 * 만료 세션 정리
 * @param {import('better-sqlite3').Database} [db]
 */
export function purgeExpiredSessions(db = getDb()) {
  ensureSessionTable(db)
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString())
}

/**
 * @param {string} username
 * @param {import('better-sqlite3').Database} [db]
 * @returns {{ sessionId: string, expiresAt: Date }}
 */
export function createSession(username, db = getDb()) {
  ensureSessionTable(db)
  purgeExpiredSessions(db)

  const sessionId = randomBytes(32).toString('hex')
  const idHash = hashSessionId(sessionId)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  db.prepare(
    `INSERT INTO sessions (id_hash, username, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(idHash, username, expiresAt.toISOString(), now.toISOString())

  return { sessionId, expiresAt }
}

/**
 * @param {string | undefined} sessionId
 * @param {import('better-sqlite3').Database} [db]
 * @returns {{ username: string, expiresAt: string } | null}
 */
export function getSession(sessionId, db = getDb()) {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 32) {
    return null
  }

  ensureSessionTable(db)
  const idHash = hashSessionId(sessionId)
  const row = db
    .prepare('SELECT username, expires_at FROM sessions WHERE id_hash = ?')
    .get(idHash)

  if (!row) return null

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash)
    return null
  }

  return { username: row.username, expiresAt: row.expires_at }
}

/**
 * @param {string | undefined} sessionId
 * @param {import('better-sqlite3').Database} [db]
 */
export function destroySession(sessionId, db = getDb()) {
  if (!sessionId) return
  ensureSessionTable(db)
  try {
    const idHash = hashSessionId(sessionId)
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash)
  } catch {
    // secret 미설정 등 — 무시
  }
}

/**
 * 상수시간 비교용 헬퍼
 * @param {string} a
 * @param {string} b
 */
export function safeEqualString(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export { SESSION_TTL_MS }
