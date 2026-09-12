/**
 * localProcess.js — 로컬 3001 ALADDIN 서버 식별/교체
 *
 * 포트만 보고 무작정 kill 하지 않는다.
 * 이 프로젝트의 run-local-server / server/index.js 만 ALADDIN-owned 로 본다.
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { ROOT } from './localLaunchAgent.js'

export const LOCAL_LISTEN_PORT = 3001
export const LOCAL_BASE_URL = `http://127.0.0.1:${LOCAL_LISTEN_PORT}`
export const NON_ALADDIN_PORT_ERROR = `port ${LOCAL_LISTEN_PORT} is occupied by a non-ALADDIN process`

/**
 * @param {string} root
 */
export function resolveProjectRoot(root = ROOT) {
  try {
    return fs.realpathSync(root)
  } catch {
    return path.resolve(root)
  }
}

/**
 * @param {string} stdout
 * @returns {number[]}
 */
export function parseLsofPids(stdout) {
  const pids = new Set()
  for (const line of String(stdout || '').split(/\n/)) {
    const match = line.trim().match(/^p(\d+)$/)
    if (match) pids.add(Number(match[1]))
  }
  return [...pids]
}

/**
 * @param {string} line
 * @returns {{ pid: number, ppid: number, command: string } | null}
 */
export function parsePsLine(line) {
  const match = String(line || '')
    .trim()
    .match(/^(\d+)\s+(\d+)\s+(.*)$/)
  if (!match) return null
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    command: match[3],
  }
}

/**
 * @param {string} stdout
 */
export function parseLsofCwd(stdout) {
  for (const line of String(stdout || '').split(/\n/)) {
    if (line.startsWith('n')) return line.slice(1)
  }
  return null
}

/**
 * @param {{ command?: string | null, cwd?: string | null }} info
 * @param {string} [root]
 */
export function isAladdinOwnedProcess(info, root = ROOT) {
  const project = resolveProjectRoot(root)
  const command = String(info?.command || '')
  const cwd = info?.cwd
    ? resolveProjectRoot(String(info.cwd))
    : ''
  const runner = path.join(project, 'scripts', 'run-local-server.js')
  const entry = path.join(project, 'server', 'index.js')

  if (command.includes(runner) || command.includes(entry)) return true
  if (cwd === project) {
    if (
      command.includes('scripts/run-local-server.js') ||
      command.includes('server/index.js')
    ) {
      return true
    }
  }
  return false
}

function runCommand(file, args, execFile = execFileSync) {
  try {
    return execFile(file, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return ''
  }
}

/**
 * @param {number} pid
 * @param {{ execFile?: typeof execFileSync }} [options]
 */
export function inspectProcess(pid, options = {}) {
  const execFile = options.execFile || execFileSync
  const psOut = runCommand(
    'ps',
    ['-p', String(pid), '-ww', '-o', 'pid=,ppid=,command='],
    execFile,
  )
  const parsed = parsePsLine(psOut)
  const cwdOut = runCommand(
    'lsof',
    ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
    execFile,
  )
  return {
    pid,
    ppid: parsed?.ppid ?? null,
    command: parsed?.command || '',
    cwd: parseLsofCwd(cwdOut),
  }
}

/**
 * @param {number} port
 * @param {{ execFile?: typeof execFileSync }} [options]
 */
export function listListenPids(port = LOCAL_LISTEN_PORT, options = {}) {
  const execFile = options.execFile || execFileSync
  const out = runCommand(
    'lsof',
    ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'p'],
    execFile,
  )
  return parseLsofPids(out)
}

/**
 * @param {{ root?: string, execFile?: typeof execFileSync }} [options]
 */
export function listAladdinPids(options = {}) {
  const root = resolveProjectRoot(options.root || ROOT)
  const execFile = options.execFile || execFileSync
  const out = runCommand('ps', ['-ax', '-ww', '-o', 'pid=,ppid=,command='], execFile)
  const pids = new Set()
  for (const line of String(out).split(/\n/)) {
    const parsed = parsePsLine(line)
    if (!parsed) continue
    if (parsed.pid === process.pid || parsed.pid === process.ppid) continue
    if (isAladdinOwnedProcess(parsed, root)) pids.add(parsed.pid)
  }
  return [...pids]
}

/**
 * @param {{
 *   port?: number,
 *   root?: string,
 *   execFile?: typeof execFileSync,
 * }} [options]
 */
export function classifyPortOccupants(options = {}) {
  const port = options.port ?? LOCAL_LISTEN_PORT
  const root = options.root || ROOT
  const pids = listListenPids(port, options)
  const occupants = pids.map((pid) => {
    const info = inspectProcess(pid, options)
    return {
      ...info,
      aladdinOwned: isAladdinOwnedProcess(info, root),
    }
  })
  return {
    port,
    occupants,
    aladdin: occupants.filter((item) => item.aladdinOwned),
    foreign: occupants.filter((item) => !item.aladdinOwned),
  }
}

/**
 * @param {number[]} pids
 * @param {{
 *   kill?: (pid: number, signal: NodeJS.Signals) => void,
 *   isAlive?: (pid: number) => boolean,
 *   sleep?: (ms: number) => Promise<void>,
 *   waitMs?: number,
 *   now?: () => number,
 * }} [options]
 */
export async function stopProcesses(pids, options = {}) {
  const unique = [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 1))]
  const kill =
    options.kill ||
    ((pid, signal) => {
      try {
        process.kill(pid, signal)
      } catch {
        // already gone
      }
    })
  const isAlive =
    options.isAlive ||
    ((pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    })
  const sleep =
    options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const waitMs = options.waitMs ?? 4000

  for (const pid of unique) kill(pid, 'SIGTERM')

  const deadline = (options.now || Date.now)() + waitMs
  while ((options.now || Date.now)() < deadline) {
    if (unique.every((pid) => !isAlive(pid))) {
      return { stopped: unique, forced: [] }
    }
    await sleep(150)
  }

  const leftover = unique.filter((pid) => isAlive(pid))
  for (const pid of leftover) kill(pid, 'SIGKILL')
  await sleep(150)
  return { stopped: unique.filter((pid) => !isAlive(pid)), forced: leftover }
}

export function nonAladdinPortError(occupants, port = LOCAL_LISTEN_PORT) {
  const detail = occupants
    .map((item) => `pid=${item.pid} ${item.command || 'unknown'}`)
    .join('; ')
  const prefix =
    port === LOCAL_LISTEN_PORT
      ? NON_ALADDIN_PORT_ERROR
      : `port ${port} is occupied by a non-ALADDIN process`
  return `${prefix}${detail ? ` (${detail})` : ''}`
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number }} [options]
 */
export function httpGet(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 2000
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
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

export function isHealthOk(response) {
  if (!response || response.status !== 200) return false
  try {
    return JSON.parse(response.body || '{}').ok === true
  } catch {
    return false
  }
}

export function isStandaloneHtml(response) {
  if (!response || response.status !== 200) return false
  const body = String(response.body || '')
  return /<!doctype html|<html|ALADDIN/i.test(body)
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractDistAssetPaths(html) {
  const paths = new Set()
  const pattern = /\b(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g
  for (const match of String(html || '').matchAll(pattern)) {
    paths.add(match[1])
  }
  return [...paths].sort()
}

/**
 * @param {string} [root]
 */
export function readCurrentDistAssetPaths(root = ROOT) {
  const indexPath = path.join(root, 'dist', 'index.html')
  try {
    return extractDistAssetPaths(fs.readFileSync(indexPath, 'utf8'))
  } catch {
    return []
  }
}

/**
 * @param {{ status?: number, body?: string } | null | undefined} response
 * @param {string[]} expectedAssetPaths
 */
export function hasCurrentDistAssetRefs(response, expectedAssetPaths) {
  if (!isStandaloneHtml(response)) return false
  if (!Array.isArray(expectedAssetPaths) || expectedAssetPaths.length === 0) {
    return false
  }
  const actual = extractDistAssetPaths(response.body || '')
  return (
    actual.length === expectedAssetPaths.length &&
    expectedAssetPaths.every((item) => actual.includes(item))
  )
}

/**
 * @param {{
 *   baseUrl?: string,
 *   timeoutMs?: number,
 *   expectedAssetPaths?: string[] | null,
 *   sleep?: (ms: number) => Promise<void>,
 *   get?: typeof httpGet,
 * }} [options]
 */
export async function waitForLocalServer(options = {}) {
  const baseUrl = options.baseUrl || LOCAL_BASE_URL
  const timeoutMs = options.timeoutMs ?? 45_000
  const sleep =
    options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const get = options.get || httpGet
  const expectedAssetPaths = options.expectedAssetPaths || null
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const health = await get(`${baseUrl}/api/health`)
    const home = await get(`${baseUrl}/`)
    const currentHtml =
      expectedAssetPaths === null ||
      hasCurrentDistAssetRefs(home, expectedAssetPaths)
    if (isHealthOk(health) && isStandaloneHtml(home) && currentHtml) {
      return { ok: true, health, home }
    }
    await sleep(400)
  }
  return { ok: false, health: null, home: null }
}
