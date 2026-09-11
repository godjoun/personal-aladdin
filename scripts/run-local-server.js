/**
 * run-local-server.js — LaunchAgent / 로컬 백그라운드용 엔트리
 *
 * - NODE_ENV=production + ALADDIN_LOCAL=1
 * - credential 은 프로젝트 .env 만 사용 (이 파일/plist에 키 없음)
 * - 시작 시 일일 백업 시도 (실패해도 서버 기동)
 * - server/index.js 를 같은 프로세스에서 기동한다.
 *   자식 프로세스를 따로 두면 LaunchAgent bootout 시 3001 listener 가 남을 수 있다.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { config } from 'dotenv'
import { runDailyBackupIfNeeded } from './dailyBackup.js'
import { ensureParentDir, rotateLogFileIfNeeded } from './rotateLogFile.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const LOG_DIR = path.join(ROOT, 'logs')
const OUT_LOG = path.join(LOG_DIR, 'aladdin-server.out.log')
const ERR_LOG = path.join(LOG_DIR, 'aladdin-server.err.log')

config({ path: path.join(ROOT, '.env') })

process.env.NODE_ENV = 'production'
process.env.ALADDIN_LOCAL = '1'
if (!process.env.ALADDIN_LISTEN_HOST) {
  process.env.ALADDIN_LISTEN_HOST = '127.0.0.1'
}

ensureParentDir(OUT_LOG)
ensureParentDir(ERR_LOG)
rotateLogFileIfNeeded(OUT_LOG)
rotateLogFileIfNeeded(ERR_LOG)

function appendLog(filePath, line) {
  try {
    rotateLogFileIfNeeded(filePath)
    fs.appendFileSync(filePath, `${line}\n`, 'utf8')
  } catch {
    // ignore
  }
}

appendLog(
  OUT_LOG,
  `[${new Date().toISOString()}] aladdin local server starting (no secrets logged)`,
)

try {
  const backup = await runDailyBackupIfNeeded({ projectRoot: ROOT })
  appendLog(OUT_LOG, `[${new Date().toISOString()}] backup status=${backup.status}`)
} catch {
  appendLog(OUT_LOG, `[${new Date().toISOString()}] backup skipped`)
}

const serverEntry = path.join(ROOT, 'server', 'index.js')
process.argv[1] = serverEntry
await import(pathToFileURL(serverEntry).href)
