#!/usr/bin/env node
/**
 * local:uninstall — LaunchAgent 제거 (서버 중지)
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import { LABEL, getGuiDomain, getPlistPath } from './localLaunchAgent.js'

function log(msg) {
  console.log(`[local:uninstall] ${msg}`)
}

if (process.platform !== 'darwin') {
  console.error('[local:uninstall] macOS 에서만 지원합니다.')
  process.exit(1)
}

const plistPath = getPlistPath()
const domain = getGuiDomain()
const target = `${domain}/${LABEL}`

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
    log('실행 중 agent 없음 (또는 이미 제거됨)')
  }
}

if (fs.existsSync(plistPath)) {
  fs.unlinkSync(plistPath)
  log(`삭제: ${plistPath}`)
} else {
  log('plist 없음')
}

log('완료 — http://127.0.0.1:3001 은 더 이상 자동 기동되지 않습니다.')
