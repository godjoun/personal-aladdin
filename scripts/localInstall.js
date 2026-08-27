#!/usr/bin/env node
/**
 * local:install — build + macOS LaunchAgent 설치 (로그인 시 자동 기동)
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
  getPlistPath,
  resolveNodePath,
} from './localLaunchAgent.js'
import { ensureParentDir, rotateLogFileIfNeeded } from './rotateLogFile.js'

function log(msg) {
  console.log(`[local:install] ${msg}`)
}

function fail(msg) {
  console.error(`[local:install] ${msg}`)
  process.exit(1)
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

const plistPath = getPlistPath()
fs.mkdirSync(path.dirname(plistPath), { recursive: true })

const outLog = path.join(ROOT, 'logs', 'launchd.out.log')
const errLog = path.join(ROOT, 'logs', 'launchd.err.log')
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
  execFileSync('launchctl', ['bootout', target], { stdio: 'ignore' })
} catch {
  // not loaded
}

try {
  execFileSync('launchctl', ['bootstrap', domain, plistPath], {
    stdio: 'inherit',
  })
} catch {
  // macOS 구버전 fallback
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

log('설치 완료')
log('주소: http://127.0.0.1:3001')
log('상태 확인: npm run local:status')
log('제거: npm run local:uninstall')
