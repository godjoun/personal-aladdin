#!/usr/bin/env node
/**
 * local:status — LaunchAgent / health 상태
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import http from 'http'
import { LABEL, ROOT, getGuiDomain, getPlistPath } from './localLaunchAgent.js'

const HEALTH_URL = 'http://127.0.0.1:3001/api/health'

function httpGet(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.on('error', () => resolve(null))
  })
}

const plistPath = getPlistPath()
const domain = getGuiDomain()
const target = `${domain}/${LABEL}`

console.log(`[local:status] label: ${LABEL}`)
console.log(`[local:status] project: ${ROOT}`)
console.log(
  `[local:status] plist: ${fs.existsSync(plistPath) ? plistPath : '(없음)'}`,
)

let launchd = 'unknown'
try {
  const out = execFileSync('launchctl', ['print', target], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  launchd = 'loaded'
  const state = out.match(/state\s*=\s*(\w+)/)
  if (state) launchd = `loaded (${state[1]})`
} catch {
  launchd = fs.existsSync(plistPath) ? 'plist만 존재 (미로드?)' : 'not installed'
}
console.log(`[local:status] launchd: ${launchd}`)

const health = await httpGet(HEALTH_URL)
if (health?.status === 200) {
  try {
    const json = JSON.parse(health.body)
    console.log(
      `[local:status] health: ok=${json.ok === true} → http://127.0.0.1:3001`,
    )
  } catch {
    console.log('[local:status] health: HTTP 200 (parse fail)')
  }
} else {
  console.log('[local:status] health: down')
}

process.exit(0)
