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
export const ROOT = fs.realpathSync(path.join(__dirname, '..'))
export const RUNNER = path.join(ROOT, 'scripts', 'run-local-server.js')

/**
 * launchd WorkingDirectory.
 * 프로젝트 폴더가 iCloud Desktop(File Provider) 이면 chdir 이 EX_CONFIG(78) 로 실패한다.
 * 실제 앱 cwd 는 run-local-server.js 가 ROOT 로 다시 잡는다.
 */
export function resolveLaunchdWorkingDirectory(root = ROOT) {
  const home = os.homedir()
  let current = path.resolve(root)
  for (let i = 0; i < 8; i += 1) {
    try {
      if (!fs.existsSync(current)) {
        const parent = path.dirname(current)
        if (parent === current) break
        current = parent
        continue
      }
      const attrs = execFileSync('xattr', ['-l', current], {
        encoding: 'utf8',
      })
      if (
        /com\.apple\.file-provider-domain-id|fileprovider\.detached/i.test(
          attrs,
        )
      ) {
        return home
      }
    } catch {
      // xattr 실패는 해당 경로에 속성 없음으로 본다
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return root
}

export function getPlistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
}

export function getLaunchdLogPaths() {
  const dir = path.join(os.homedir(), 'Library', 'Logs', 'personal-aladdin')
  return {
    dir,
    outLog: path.join(dir, 'launchd.out.log'),
    errLog: path.join(dir, 'launchd.err.log'),
  }
}

export function getGuiDomain() {
  return `gui/${process.getuid()}`
}

function isRealNodeBinary(filePath) {
  try {
    const real = fs.realpathSync(filePath)
    // Homebrew Cellar node stub 은 수십 KB 이고, 실제 node 는 수십 MB 이다.
    // launchd 는 stub 경로에서 EX_CONFIG(78) 로 기동에 실패할 수 있다.
    return fs.statSync(real).size > 1_000_000
  } catch {
    return false
  }
}

export function resolveNodePath() {
  /** @type {string[]} */
  const candidates = []
  if (process.execPath) candidates.push(process.execPath)
  try {
    const which = execFileSync('which', ['node'], { encoding: 'utf8' }).trim()
    if (which) candidates.push(which)
  } catch {
    // ignore
  }
  const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node')
  if (fs.existsSync(nvmDir)) {
    const versions = fs
      .readdirSync(nvmDir)
      .filter((name) => /^v24\./.test(name))
      .sort()
      .reverse()
    for (const version of versions) {
      candidates.push(path.join(nvmDir, version, 'bin', 'node'))
    }
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && isRealNodeBinary(candidate)) {
      return fs.realpathSync(candidate)
    }
  }

  throw new Error('Node.js path not found')
}

/**
 * @param {{ nodePath: string, root: string, runner: string, label: string }} opts
 */
export function buildPlistXml(opts) {
  const { nodePath, root, runner, label } = opts
  const workingDirectory = resolveLaunchdWorkingDirectory(root)
  const { outLog, errLog } = getLaunchdLogPaths()

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
  <string>${esc(workingDirectory)}</string>
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
