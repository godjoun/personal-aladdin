import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DAILY_BACKUP_KEEP_COUNT,
  formatBackupDate,
  listDailyBackupFiles,
  pruneDailyBackups,
  runDailyBackupIfNeeded,
} from './dailyBackup.js'

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-backup-'))

afterEach(() => {
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true })
  fs.mkdirSync(TEMP_ROOT, { recursive: true })
})

describe('dailyBackup helpers', () => {
  it('formatBackupDate 는 YYYY-MM-DD', () => {
    expect(formatBackupDate(new Date('2026-08-27T12:00:00'))).toBe('2026-08-27')
  })

  it('같은 날 백업이 있으면 skipped', async () => {
    const backupDir = path.join(TEMP_ROOT, 'backups')
    const dbPath = path.join(TEMP_ROOT, 'aladdin.sqlite')
    fs.mkdirSync(backupDir, { recursive: true })
    fs.writeFileSync(dbPath, 'sqlite-placeholder')
    const today = formatBackupDate(new Date('2026-08-27T10:00:00'))
    const existing = path.join(backupDir, `aladdin-${today}.sqlite`)
    fs.writeFileSync(existing, 'already')

    const result = await runDailyBackupIfNeeded({
      now: new Date('2026-08-27T18:00:00'),
      dbPath,
      backupDir,
      DatabaseImpl: class {
        constructor() {
          throw new Error('should not open db when skipped')
        }
      },
    })

    expect(result.status).toBe('skipped')
    expect(result.path).toBe(existing)
  })

  it('DB 없으면 missing_db (실행을 막지 않음)', async () => {
    const result = await runDailyBackupIfNeeded({
      dbPath: path.join(TEMP_ROOT, 'missing.sqlite'),
      backupDir: path.join(TEMP_ROOT, 'backups'),
    })
    expect(result.status).toBe('missing_db')
  })

  it('최근 KEEP_COUNT 개만 유지', () => {
    const backupDir = path.join(TEMP_ROOT, 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    for (let i = 1; i <= 16; i += 1) {
      const day = String(i).padStart(2, '0')
      fs.writeFileSync(
        path.join(backupDir, `aladdin-2026-08-${day}.sqlite`),
        'x',
      )
    }

    const removed = pruneDailyBackups(backupDir, DAILY_BACKUP_KEEP_COUNT)
    expect(removed).toHaveLength(2)
    const left = listDailyBackupFiles(backupDir)
    expect(left).toHaveLength(DAILY_BACKUP_KEEP_COUNT)
    expect(left[0]).toBe('aladdin-2026-08-03.sqlite')
    expect(left.at(-1)).toBe('aladdin-2026-08-16.sqlite')
  })

  it('better-sqlite3 backup 으로 일일 파일을 만든다', async () => {
    const Database = (await import('better-sqlite3')).default
    const dbPath = path.join(TEMP_ROOT, 'aladdin.sqlite')
    const backupDir = path.join(TEMP_ROOT, 'backups')
    const db = new Database(dbPath)
    db.exec('CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);')
    db.close()

    const result = await runDailyBackupIfNeeded({
      now: new Date('2026-08-27T10:00:00'),
      dbPath,
      backupDir,
    })

    expect(result.status).toBe('created')
    expect(result.path).toBe(path.join(backupDir, 'aladdin-2026-08-27.sqlite'))
    expect(fs.existsSync(result.path)).toBe(true)

    const again = await runDailyBackupIfNeeded({
      now: new Date('2026-08-27T22:00:00'),
      dbPath,
      backupDir,
    })
    expect(again.status).toBe('skipped')
  })
})
