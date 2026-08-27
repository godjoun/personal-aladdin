/**
 * dailyBackup.js — 하루 1회 SQLite 백업 (better-sqlite3 backup API)
 *
 * - 파일명: aladdin-YYYY-MM-DD.sqlite
 * - 기본 경로: <project>/backups/
 * - 최근 KEEP_COUNT 개만 유지
 * - 실패해도 throw 하지 않고 결과만 반환 (기동을 막지 않음)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import { resolveDbPath } from '../server/resolveDbPath.js'

export const DAILY_BACKUP_KEEP_COUNT = 14
export const DAILY_BACKUP_PREFIX = 'aladdin-'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')

/**
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD
 */
export function formatBackupDate(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {string} backupDir
 * @returns {string[]} basename 목록 (이름 오름차순)
 */
export function listDailyBackupFiles(backupDir) {
  if (!fs.existsSync(backupDir)) return []
  return fs
    .readdirSync(backupDir)
    .filter((name) => /^aladdin-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))
    .sort()
}

/**
 * 오래된 일일 백업 삭제. 최신 keepCount 개만 남김.
 *
 * @param {string} backupDir
 * @param {number} [keepCount]
 * @returns {string[]} 삭제된 파일 basename
 */
export function pruneDailyBackups(backupDir, keepCount = DAILY_BACKUP_KEEP_COUNT) {
  const files = listDailyBackupFiles(backupDir)
  if (files.length <= keepCount) return []

  const remove = files.slice(0, files.length - keepCount)
  for (const name of remove) {
    try {
      fs.unlinkSync(path.join(backupDir, name))
    } catch {
      // ignore single file delete failure
    }
  }
  return remove
}

/**
 * @param {{
 *   now?: Date,
 *   projectRoot?: string,
 *   dbPath?: string,
 *   backupDir?: string,
 *   keepCount?: number,
 *   DatabaseImpl?: typeof Database,
 * }} [options]
 * @returns {Promise<{
 *   status: 'created' | 'skipped' | 'missing_db' | 'failed',
 *   path?: string,
 *   message?: string,
 * }>}
 */
export async function runDailyBackupIfNeeded(options = {}) {
  const now = options.now ?? new Date()
  const projectRoot = options.projectRoot ?? PROJECT_ROOT
  const keepCount = options.keepCount ?? DAILY_BACKUP_KEEP_COUNT
  const DatabaseImpl = options.DatabaseImpl ?? Database

  let dbPath = options.dbPath
  if (!dbPath) {
    try {
      dbPath = resolveDbPath({
        isProd: process.env.NODE_ENV === 'production',
        env: process.env,
      }).dbPath
    } catch (error) {
      return {
        status: 'failed',
        message: error?.message || 'DB path unresolved',
      }
    }
  }

  const backupDir =
    options.backupDir ||
    process.env.ALADDIN_BACKUP_DIR?.trim() ||
    path.join(projectRoot, 'backups')

  const normalized = path.resolve(backupDir)
  if (
    normalized.includes(`${path.sep}dist${path.sep}`) ||
    normalized.endsWith(`${path.sep}dist`) ||
    normalized.includes(`${path.sep}public${path.sep}`)
  ) {
    return {
      status: 'failed',
      message: 'Backup directory must not be under public/ or dist/',
    }
  }

  if (!fs.existsSync(dbPath)) {
    return {
      status: 'missing_db',
      message: 'Database file not found yet — skip daily backup',
    }
  }

  const dateKey = formatBackupDate(now)
  const dest = path.join(backupDir, `${DAILY_BACKUP_PREFIX}${dateKey}.sqlite`)

  if (fs.existsSync(dest)) {
    pruneDailyBackups(backupDir, keepCount)
    return { status: 'skipped', path: dest }
  }

  try {
    fs.mkdirSync(backupDir, { recursive: true })
    const source = new DatabaseImpl(dbPath, {
      readonly: true,
      fileMustExist: true,
    })
    try {
      await source.backup(dest)
    } finally {
      source.close()
    }
    pruneDailyBackups(backupDir, keepCount)
    return { status: 'created', path: dest }
  } catch (error) {
    return {
      status: 'failed',
      message: error?.message || 'Daily backup failed',
    }
  }
}
