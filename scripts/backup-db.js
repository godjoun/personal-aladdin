#!/usr/bin/env node
/**
 * backup — SQLite 안전 백업 (better-sqlite3 backup API)
 *
 * 사용:
 *   npm run backup
 *
 * 기본 출력: <ALADDIN_DATA_DIR|server/data>/backups/aladdin-YYYYMMDD-HHMMSS.sqlite
 * public/dist 아래에는 저장하지 않습니다.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import Database from 'better-sqlite3'
import { resolveDbPath } from '../server/resolveDbPath.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env') })

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function main() {
  const isProd = process.env.NODE_ENV === 'production'
  let dbPath
  try {
    dbPath = resolveDbPath({ isProd: false }).dbPath
    if (isProd) {
      dbPath = resolveDbPath({ isProd: true }).dbPath
    }
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`)
    process.exit(1)
  }

  const backupRoot =
    process.env.ALADDIN_BACKUP_DIR?.trim() ||
    path.join(path.dirname(dbPath), 'backups')

  // public/dist 금지
  const normalized = path.resolve(backupRoot)
  if (
    normalized.includes(`${path.sep}dist${path.sep}`) ||
    normalized.endsWith(`${path.sep}dist`) ||
    normalized.includes(`${path.sep}public${path.sep}`)
  ) {
    console.error('Backup directory must not be under public/ or dist/')
    process.exit(1)
  }

  fs.mkdirSync(backupRoot, { recursive: true })
  const dest = path.join(backupRoot, `aladdin-${stamp()}.sqlite`)

  const source = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    await source.backup(dest)
  } finally {
    source.close()
  }

  console.log(`Backup written: ${dest}`)
}

main().catch((error) => {
  console.error(error.message || 'Backup failed')
  process.exit(1)
})
