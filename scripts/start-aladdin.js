#!/usr/bin/env node
/**
 * start-aladdin.js — 로컬 UI 오픈 (Vite 없이 127.0.0.1:3001)
 *
 * 1) health OK → 브라우저 오픈 후 종료
 * 2) LaunchAgent kickstart 시도
 * 3) 그래도 없으면 백그라운드 서버 기동 (detached)
 * 4) health 대기 후 브라우저 오픈
 */

import { spawn, execFile, execFileSync } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { runDailyBackupIfNeeded } from './dailyBackup.js'
import { LABEL, getGuiDomain, getPlistPath } from './localLaunchAgent.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const APP_URL = 'http://127.0.0.1:3001'
const HEALTH_URL = `${APP_URL}/api/health`

config({ path: path.join(ROOT, '.env') })

function log(message) {
  console.log(`[ALADDIN] ${message}`)
}

function warn(message) {
  console.warn(`[ALADDIN] ${message}`)
}

function httpGet(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        resolve({
          ok: res.statusCode != null && res.statusCode >= 200 && res.statusCode < 500,
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false })
    })
    req.on('error', () => resolve({ ok: false }))
  })
}

async function isApiHealthy() {
  const res = await httpGet(HEALTH_URL)
  if (!res.ok || res.status !== 200) return false
  try {
    return JSON.parse(res.body || '{}').ok === true
  } catch {
    return false
  }
}

async function waitForApi(timeoutMs = 45_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isApiHealthy()) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

function openBrowser(url) {
  log(`브라우저 열기: ${url}`)
  if (process.platform === 'darwin') {
    execFile('open', [url], () => {})
    return
  }
  if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url], () => {})
    return
  }
  execFile('xdg-open', [url], () => {})
}

function tryKickstartLaunchAgent() {
  if (process.platform !== 'darwin') return false
  const plistPath = getPlistPath()
  if (!fs.existsSync(plistPath)) return false

  const target = `${getGuiDomain()}/${LABEL}`
  try {
    execFileSync('launchctl', ['kickstart', '-k', target], { stdio: 'ignore' })
    log('LaunchAgent kickstart')
    return true
  } catch {
    try {
      execFileSync('launchctl', ['bootstrap', getGuiDomain(), plistPath], {
        stdio: 'ignore',
      })
      execFileSync('launchctl', ['kickstart', '-k', target], { stdio: 'ignore' })
      log('LaunchAgent bootstrap + kickstart')
      return true
    } catch {
      return false
    }
  }
}

function startDetachedServer() {
  const runner = path.join(ROOT, 'scripts', 'run-local-server.js')
  log('백그라운드 서버 기동')
  const child = spawn(process.execPath, [runner], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ALADDIN_LOCAL: '1',
      ALADDIN_LISTEN_HOST: '127.0.0.1',
    },
  })
  child.unref()
}

async function maybeDailyBackup() {
  const result = await runDailyBackupIfNeeded({ projectRoot: ROOT })
  if (result.status === 'created') log('일일 백업 완료')
  else if (result.status === 'failed') {
    warn(`백업 실패(실행은 계속): ${result.message || 'unknown'}`)
  }
}

async function main() {
  await maybeDailyBackup()

  if (await isApiHealthy()) {
    openBrowser(APP_URL)
    log('이미 실행 중 — 브라우저만 열었습니다.')
    process.exit(0)
  }

  const kicked = tryKickstartLaunchAgent()
  if (!kicked) {
    startDetachedServer()
  }

  const ready = await waitForApi()
  if (!ready) {
    warn('서버 health 대기 시간 초과')
    warn('npm run local:install 후 다시 시도하세요.')
    process.exit(1)
  }

  openBrowser(APP_URL)
  log(`준비됨: ${APP_URL}`)
  process.exit(0)
}

main().catch((error) => {
  warn(error?.message || 'ALADDIN start failed')
  process.exit(1)
})
