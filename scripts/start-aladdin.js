#!/usr/bin/env node
/**
 * start-aladdin.js — 로컬 개인용 ALADDIN 통합 실행
 *
 * - Express API (:3001) + Vite frontend
 * - health 준비 후 기본 브라우저 오픈
 * - 이미 API가 살아 있으면 중복 기동하지 않고 화면만 오픈
 * - Ctrl+C 시 child process 정리
 * - 하루 1회 SQLite 백업 (실패해도 기동 계속)
 */

import { spawn, execFile } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { runDailyBackupIfNeeded } from './dailyBackup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const API_PORT = Number(process.env.CENTRAL_PORT) || 3001
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`
const HEALTH_URL = `${API_ORIGIN}/api/health`
const RUNTIME_PATH = path.join(ROOT, 'server', 'data', 'aladdin-runtime.json')
const VITE_PROBE_PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180]

config({ path: path.join(ROOT, '.env') })

/** @type {import('child_process').ChildProcess[]} */
const children = []
let shuttingDown = false
let browserOpened = false

function log(message) {
  console.log(`[ALADDIN] ${message}`)
}

function warn(message) {
  console.warn(`[ALADDIN] ${message}`)
}

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<{ ok: boolean, status?: number, body?: string }>}
 */
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

async function waitForApi(timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isApiHealthy()) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

function writeRuntime(frontendUrl) {
  try {
    fs.mkdirSync(path.dirname(RUNTIME_PATH), { recursive: true })
    fs.writeFileSync(
      RUNTIME_PATH,
      JSON.stringify(
        {
          frontendUrl,
          apiPort: API_PORT,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )
  } catch {
    // non-fatal
  }
}

function readRuntimeUrl() {
  try {
    const raw = fs.readFileSync(RUNTIME_PATH, 'utf8')
    const data = JSON.parse(raw)
    if (typeof data?.frontendUrl === 'string' && data.frontendUrl.startsWith('http')) {
      return data.frontendUrl
    }
  } catch {
    // ignore
  }
  return null
}

async function probeFrontendUrl() {
  const saved = readRuntimeUrl()
  if (saved) {
    const res = await httpGet(saved)
    if (res.ok) return saved
  }

  for (const port of VITE_PROBE_PORTS) {
    const url = `http://127.0.0.1:${port}/`
    const res = await httpGet(url)
    if (!res.ok) continue
    const body = res.body || ''
    if (
      body.includes('vite') ||
      body.includes('/@vite/client') ||
      body.includes('id="root"') ||
      body.includes("id='root'")
    ) {
      return `http://localhost:${port}/`
    }
  }
  return null
}

function openBrowser(url) {
  if (browserOpened) return
  browserOpened = true
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

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ pipeVite?: boolean }} [opts]
 */
function spawnChild(command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      CENTRAL_PORT: String(API_PORT),
    },
    stdio: opts.pipeVite ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32',
  })
  children.push(child)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    if (signal) {
      warn(`자식 프로세스 종료 signal=${signal}`)
    } else if (code && code !== 0) {
      warn(`자식 프로세스 종료 code=${code}`)
    }
  })
  return child
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  log('종료 중…')

  for (const child of children) {
    if (!child.killed && child.exitCode == null) {
      try {
        child.kill('SIGTERM')
      } catch {
        // ignore
      }
    }
  }

  const forceTimer = setTimeout(() => {
    for (const child of children) {
      if (!child.killed && child.exitCode == null) {
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
      }
    }
    process.exit(code)
  }, 4000)

  const check = setInterval(() => {
    if (children.every((c) => c.exitCode != null || c.killed)) {
      clearInterval(check)
      clearTimeout(forceTimer)
      process.exit(code)
    }
  }, 100)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

function extractViteLocalUrl(chunk) {
  const text = String(chunk)
  const match =
    text.match(/Local:\s+(https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?)/i) ||
    text.match(/(https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/)/)
  return match ? match[1].replace(/\/?$/, '/') : null
}

async function maybeDailyBackup() {
  const result = await runDailyBackupIfNeeded({ projectRoot: ROOT })
  if (result.status === 'created') {
    log(`일일 백업 완료`)
  } else if (result.status === 'skipped') {
    log('오늘 백업 이미 있음 — 건너뜀')
  } else if (result.status === 'missing_db') {
    log('DB 파일 없음 — 백업 건너뜀 (첫 실행이면 정상)')
  } else if (result.status === 'failed') {
    warn(`백업 실패(실행은 계속): ${result.message || 'unknown'}`)
  }
}

async function openExistingSession() {
  const frontend = await probeFrontendUrl()
  if (frontend) {
    openBrowser(frontend)
    log('이미 실행 중입니다. 브라우저만 열었습니다.')
    return true
  }

  warn(
    'API(:3001)는 응답하지만 frontend를 찾지 못했습니다. 기존 터미널에서 Ctrl+C 후 다시 실행하세요.',
  )
  return false
}

async function main() {
  await maybeDailyBackup()

  if (await isApiHealthy()) {
    await openExistingSession()
    // 중복 기동 방지 — 이 프로세스는 서버를 붙잡지 않고 종료
    process.exit(0)
  }

  log(`API 서버 시작 (port ${API_PORT})`)
  spawnChild(process.execPath, [path.join(ROOT, 'server', 'index.js')])

  const apiReady = await waitForApi()
  if (!apiReady) {
    warn('API health 대기 시간 초과')
    shutdown(1)
    return
  }
  log('API 준비됨')

  log('frontend(Vite) 시작')
  const viteBin = path.join(
    ROOT,
    'node_modules',
    'vite',
    'bin',
    'vite.js',
  )
  const viteArgs = fs.existsSync(viteBin)
    ? [viteBin]
    : [path.join(ROOT, 'node_modules', 'vite', 'dist', 'node', 'cli.js')]

  const vite = spawnChild(process.execPath, viteArgs, { pipeVite: true })

  vite.stdout?.on('data', (buf) => {
    process.stdout.write(buf)
    const url = extractViteLocalUrl(buf)
    if (url && !browserOpened) {
      writeRuntime(url)
      openBrowser(url)
    }
  })
  vite.stderr?.on('data', (buf) => {
    process.stderr.write(buf)
    const url = extractViteLocalUrl(buf)
    if (url && !browserOpened) {
      writeRuntime(url)
      openBrowser(url)
    }
  })

  vite.on('exit', (code) => {
    if (!shuttingDown) {
      warn('Vite가 종료되어 ALADDIN을 닫습니다.')
      shutdown(code || 0)
    }
  })
}

main().catch((error) => {
  warn(error?.message || 'ALADDIN start failed')
  shutdown(1)
})
