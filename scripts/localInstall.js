#!/usr/bin/env node
/**
 * local:install — build + 구버전 ALADDIN 서버 교체 + LaunchAgent 설치
 */

import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  LABEL,
  ROOT,
  RUNNER,
  assertPlistHasNoSecrets,
  buildPlistXml,
  getGuiDomain,
  getLaunchdLogPaths,
  getPlistPath,
  resolveNodePath,
} from './localLaunchAgent.js'
import { ensureParentDir, rotateLogFileIfNeeded } from './rotateLogFile.js'
import {
  LOCAL_BASE_URL,
  LOCAL_LISTEN_PORT,
  classifyPortOccupants,
  inspectProcess,
  isAladdinOwnedProcess,
  listAladdinPids,
  listListenPids,
  nonAladdinPortError,
  readCurrentDistAssetPaths,
  stopProcesses,
  waitForLocalServer,
} from './localProcess.js'

function log(msg) {
  console.log(`[local:install] ${msg}`)
}

function fail(msg) {
  console.error(`[local:install] ${msg}`)
  process.exit(1)
}

function bootoutAgent() {
  const domain = getGuiDomain()
  const target = `${domain}/${LABEL}`
  const plistPath = getPlistPath()
  try {
    execFileSync('launchctl', ['bootout', target], { stdio: 'ignore' })
    log(`bootout ${target}`)
  } catch {
    try {
      if (fs.existsSync(plistPath)) {
        execFileSync('launchctl', ['unload', '-w', plistPath], { stdio: 'ignore' })
        log('unload 완료')
      }
    } catch {
      log('실행 중 LaunchAgent 없음')
    }
  }
}

async function replaceStaleAladdinServer() {
  const classified = classifyPortOccupants({
    port: LOCAL_LISTEN_PORT,
    root: ROOT,
  })
  if (classified.foreign.length > 0) {
    fail(nonAladdinPortError(classified.foreign, LOCAL_LISTEN_PORT))
  }

  const pids = new Set([
    ...classified.aladdin.map((item) => item.pid),
    ...listAladdinPids({ root: ROOT }),
  ])
  pids.delete(process.pid)
  if (process.ppid) pids.delete(process.ppid)

  if (pids.size === 0) {
    log('남아 있는 ALADDIN 서버 없음')
    return
  }

  log(`구버전 ALADDIN 종료: pid ${[...pids].join(', ')}`)
  await stopProcesses([...pids], { waitMs: 5000 })

  const leftover = classifyPortOccupants({
    port: LOCAL_LISTEN_PORT,
    root: ROOT,
  })
  if (leftover.foreign.length > 0) {
    fail(nonAladdinPortError(leftover.foreign, LOCAL_LISTEN_PORT))
  }
  if (leftover.aladdin.length > 0) {
    fail(
      `port ${LOCAL_LISTEN_PORT} 의 ALADDIN 프로세스를 종료하지 못했습니다: ` +
        leftover.aladdin.map((item) => item.pid).join(', '),
    )
  }
}

function verifyLatestListener() {
  const pids = listListenPids(LOCAL_LISTEN_PORT)
  if (pids.length !== 1) {
    fail(
      `http://127.0.0.1:${LOCAL_LISTEN_PORT} listener 가 1개여야 합니다 (현재 ${pids.length}개)`,
    )
  }
  const info = inspectProcess(pids[0])
  if (!isAladdinOwnedProcess(info, ROOT)) {
    fail(nonAladdinPortError([info], LOCAL_LISTEN_PORT))
  }
  log(`최신 서버 pid=${info.pid}`)
  if (info.command) log(`command: ${info.command}`)
}

if (process.platform !== 'darwin') {
  fail('macOS 에서만 지원합니다.')
}

if (!fs.existsSync(path.join(ROOT, '.env'))) {
  fail('.env 가 없습니다. .env.example 복사 후 auth:setup 을 먼저 하세요.')
}

const nodePath = resolveNodePath()
log(`Node: ${nodePath}`)
log(`Project: ${ROOT}`)

log('npm run build …')
const build = spawnSync('npm', ['run', 'build'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (build.status !== 0) {
  fail('build 실패')
}

const distIndex = path.join(ROOT, 'dist', 'index.html')
if (!fs.existsSync(distIndex)) {
  fail('dist/index.html 이 없습니다.')
}
const expectedAssetPaths = readCurrentDistAssetPaths(ROOT)
if (expectedAssetPaths.length === 0) {
  fail('dist/index.html 에 asset 참조가 없습니다.')
}

log('기존 LaunchAgent bootout …')
bootoutAgent()

log('구버전 ALADDIN 서버 확인 …')
await replaceStaleAladdinServer()

const plistPath = getPlistPath()
fs.mkdirSync(path.dirname(plistPath), { recursive: true })

const { outLog, errLog } = getLaunchdLogPaths()
ensureParentDir(outLog)
ensureParentDir(errLog)
rotateLogFileIfNeeded(outLog)
rotateLogFileIfNeeded(errLog)

const xml = buildPlistXml({
  nodePath,
  root: ROOT,
  runner: RUNNER,
  label: LABEL,
})
assertPlistHasNoSecrets(xml)
fs.writeFileSync(plistPath, xml, 'utf8')
log(`plist 작성: ${plistPath}`)

const domain = getGuiDomain()
const target = `${domain}/${LABEL}`

try {
  execFileSync('launchctl', ['bootstrap', domain, plistPath], {
    stdio: 'inherit',
  })
} catch {
  try {
    execFileSync('launchctl', ['load', '-w', plistPath], { stdio: 'inherit' })
  } catch (error) {
    fail(`LaunchAgent 로드 실패: ${error.message}`)
  }
}

try {
  execFileSync('launchctl', ['enable', target], { stdio: 'ignore' })
} catch {
  // optional
}

try {
  execFileSync('launchctl', ['kickstart', '-k', target], { stdio: 'ignore' })
} catch {
  // KeepAlive/RunAtLoad 가 기동할 수 있음
}

log('health check …')
const ready = await waitForLocalServer({
  timeoutMs: 45_000,
  expectedAssetPaths,
})
if (!ready.ok) {
  fail(
    `서버가 최신 dist 를 서빙하지 않습니다. ${LOCAL_BASE_URL}/api/health 와 ${LOCAL_BASE_URL}/ 를 확인하세요.`,
  )
}

verifyLatestListener()

log('설치 완료')
log(`주소: ${LOCAL_BASE_URL}`)
log('상태 확인: npm run local:status')
log('제거: npm run local:uninstall')
