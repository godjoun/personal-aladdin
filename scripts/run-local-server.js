/**
 * run-local-server.js — LaunchAgent / 로컬 백그라운드용 엔트리
 *
 * - NODE_ENV=production + ALADDIN_LOCAL=1
 * - credential 은 프로젝트 .env 만 사용 (이 파일/plist에 키 없음)
 * - 시작 시 일일 백업 시도 (실패해도 서버 기동)
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
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
const child = spawn(process.execPath, [serverEntry], {
  cwd: ROOT,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    ALADDIN_LOCAL: '1',
    ALADDIN_LISTEN_HOST: process.env.ALADDIN_LISTEN_HOST || '127.0.0.1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout?.on('data', (buf) => {
  const text = String(buf)
  // 절대 credential 패턴을 로그에 남기지 않도록 한 줄 요약만
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    if (/secret|password|token|api[_-]?key|crtfc/i.test(line)) continue
    appendLog(OUT_LOG, line.slice(0, 500))
  }
})

child.stderr?.on('data', (buf) => {
  const text = String(buf)
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    if (/secret|password|token|api[_-]?key|crtfc/i.test(line)) continue
    appendLog(ERR_LOG, line.slice(0, 500))
  }
})

child.on('exit', (code, signal) => {
  appendLog(
    OUT_LOG,
    `[${new Date().toISOString()}] server exited code=${code ?? ''} signal=${signal ?? ''}`,
  )
  process.exit(code || 0)
})

function forward(sig) {
  if (child.exitCode == null && !child.killed) {
    try {
      child.kill(sig)
    } catch {
      // ignore
    }
  }
}

process.on('SIGTERM', () => forward('SIGTERM'))
process.on('SIGINT', () => forward('SIGINT'))
