/**
 * localLaunchAgent.js — macOS LaunchAgent 공통 상수/헬퍼
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const LABEL = 'com.personal-aladdin.server'
export const ROOT = path.join(__dirname, '..')
export const RUNNER = path.join(ROOT, 'scripts', 'run-local-server.js')

export function getPlistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
}

export function getGuiDomain() {
  return `gui/${process.getuid()}`
}

export function resolveNodePath() {
  if (process.execPath && fs.existsSync(process.execPath)) {
    return process.execPath
  }
  try {
    return execFileSync('which', ['node'], { encoding: 'utf8' }).trim()
  } catch {
    throw new Error('Node.js path not found')
  }
}

/**
 * @param {{ nodePath: string, root: string, runner: string, label: string }} opts
 */
export function buildPlistXml(opts) {
  const { nodePath, root, runner, label } = opts
  const outLog = path.join(root, 'logs', 'launchd.out.log')
  const errLog = path.join(root, 'logs', 'launchd.err.log')

  const esc = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  // EnvironmentVariables: NODE_ENV / ALADDIN_LOCAL 만 — credential 금지
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${esc(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(nodePath)}</string>
    <string>${esc(runner)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${esc(root)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>ALADDIN_LOCAL</key>
    <string>1</string>
    <key>ALADDIN_LISTEN_HOST</key>
    <string>127.0.0.1</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${esc(outLog)}</string>
  <key>StandardErrorPath</key>
  <string>${esc(errLog)}</string>
</dict>
</plist>
`
}

/**
 * plist 에 시크릿 키가 없는지 검사
 * @param {string} xml
 */
export function assertPlistHasNoSecrets(xml) {
  const banned =
    /DART_API_KEY|NAVER_NEWS_CLIENT|KIWOOM_.*SECRET|KIWOOM_.*KEY|ALADDIN_ADMIN_PASSWORD|ALADDIN_SESSION_SECRET|API_KEY=/i
  if (banned.test(xml)) {
    throw new Error('Refusing to write secrets into LaunchAgent plist')
  }
}
