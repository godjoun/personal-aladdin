/**
 * db.js — ALADDIN SQLite (조회·기록용, credential 미저장)
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolveDbPath } from './resolveDbPath.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('better-sqlite3').Database | null} */
let dbInstance = null
/** @type {string | null} */
let resolvedPath = null

/**
 * @param {{ dbPath?: string, isProd?: boolean }} [options]
 */
export function getDb(options = {}) {
  if (dbInstance && !options.dbPath) {
    return dbInstance
  }

  let dbPath = options.dbPath
  if (!dbPath) {
    const resolved = resolveDbPath({
      isProd: options.isProd ?? process.env.NODE_ENV === 'production',
      defaultPath: path.join(__dirname, 'data', 'aladdin.sqlite'),
    })
    dbPath = resolved.dbPath
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[DB] Using SQLite path source=${resolved.source}`)
    }
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)

  if (!options.dbPath) {
    dbInstance = db
    resolvedPath = dbPath
  }

  return db
}

export function getResolvedDbPath() {
  return resolvedPath
}

/**
 * 테스트용 연결 해제
 */
export function closeDb() {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
    resolvedPath = null
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dividend_events (
      id TEXT PRIMARY KEY,
      sourceKey TEXT UNIQUE,
      accountType TEXT,
      symbol TEXT,
      fundName TEXT,
      paymentDate TEXT,
      recordDate TEXT,
      exDate TEXT,
      distributionPerShare REAL,
      quantity REAL,
      expectedAmount REAL,
      confirmedAmount REAL,
      taxAmount REAL,
      status TEXT NOT NULL,
      source TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dividend_payment_date
      ON dividend_events(paymentDate);

    CREATE TABLE IF NOT EXISTS manual_assets (
      id TEXT PRIMARY KEY,
      name TEXT,
      symbol TEXT,
      assetType TEXT,
      quantity REAL,
      averageBuyPrice REAL,
      memo TEXT,
      payloadJson TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS manual_trades (
      id TEXT PRIMARY KEY,
      assetId TEXT,
      type TEXT,
      quantity REAL,
      price REAL,
      tradedAt TEXT,
      payloadJson TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS login_lockout (
      username TEXT PRIMARY KEY,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER
    );
  `)
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} key
 */
export function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
  return row?.value ?? null
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} key
 * @param {string} value
 */
export function setMeta(db, key, value) {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}
