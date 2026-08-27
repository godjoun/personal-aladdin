/**
 * corpCodeMap.js — OpenDART corpCode.xml(zip) → stock_code 매핑 + 7일 캐시
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractXmlTextFromZip } from './zipXml.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CACHE_PATH = path.join(
  __dirname,
  '..',
  'data',
  'dart-corp-code-cache.json',
)
const MANUAL_FALLBACK_PATH = path.join(
  __dirname,
  '..',
  'data',
  'dart-corp-codes.json',
)
const CORP_CODE_URL = 'https://opendart.fss.or.kr/api/corpCode.xml'

export const DART_CORP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** @type {{ codes: Record<string, { corpCode: string, corpName: string }>, updatedAt: string } | null} */
let memoryMap = null

/**
 * CORPCODE.xml 텍스트 → stock_code 매핑
 *
 * @param {string} xml
 * @returns {Record<string, { corpCode: string, corpName: string }>}
 */
export function parseCorpCodeXml(xml) {
  const text = String(xml || '')
  /** @type {Record<string, { corpCode: string, corpName: string }>} */
  const codes = {}

  const blockRe =
    /<list>\s*<corp_code>\s*([^<]*?)\s*<\/corp_code>\s*<corp_name>\s*([^<]*?)\s*<\/corp_name>[\s\S]*?<stock_code>\s*([^<]*?)\s*<\/stock_code>/gi

  let match
  while ((match = blockRe.exec(text)) != null) {
    const corpCode = String(match[1] || '').trim()
    const corpName = String(match[2] || '').trim()
    const stockCode = String(match[3] || '').trim().replace(/^A/i, '')
    if (!corpCode || !/^\d{6}$/.test(stockCode)) continue
    codes[stockCode] = { corpCode, corpName }
  }

  return codes
}

/**
 * @param {unknown} raw
 * @returns {{ codes: Record<string, { corpCode: string, corpName: string }>, updatedAt: string } | null}
 */
export function normalizeCorpCodeCache(raw) {
  if (!raw || typeof raw !== 'object') return null
  const updatedAt = String(raw.updatedAt || '').trim()
  const source = raw.codes && typeof raw.codes === 'object' ? raw.codes : raw
  /** @type {Record<string, { corpCode: string, corpName: string }>} */
  const codes = {}

  for (const [key, value] of Object.entries(source)) {
    if (key === 'updatedAt' || key === 'codes') continue
    const stock = String(key).replace(/^A/i, '')
    if (!/^\d{6}$/.test(stock)) continue

    if (typeof value === 'string' && value.trim()) {
      codes[stock] = { corpCode: value.trim(), corpName: '' }
      continue
    }
    if (value && typeof value === 'object') {
      const corpCode = String(value.corpCode || value.corp_code || '').trim()
      const corpName = String(value.corpName || value.corp_name || '').trim()
      if (!corpCode) continue
      codes[stock] = { corpCode, corpName }
    }
  }

  if (Object.keys(codes).length === 0) return null
  return {
    codes,
    updatedAt: updatedAt || new Date(0).toISOString(),
  }
}

/**
 * @param {string} cachePath
 * @param {number} [now]
 * @param {number} [ttlMs]
 */
export function readCorpCodeCache(
  cachePath = DEFAULT_CACHE_PATH,
  now = Date.now(),
  ttlMs = DART_CORP_CACHE_TTL_MS,
) {
  try {
    if (!fs.existsSync(cachePath)) return { hit: false, fresh: false, data: null }
    const parsed = normalizeCorpCodeCache(
      JSON.parse(fs.readFileSync(cachePath, 'utf8')),
    )
    if (!parsed) return { hit: false, fresh: false, data: null }
    const updated = Date.parse(parsed.updatedAt)
    const fresh =
      Number.isFinite(updated) && now - updated >= 0 && now - updated <= ttlMs
    return { hit: true, fresh, data: parsed }
  } catch {
    return { hit: false, fresh: false, data: null }
  }
}

/**
 * @param {string} cachePath
 * @param {Record<string, { corpCode: string, corpName: string }>} codes
 * @param {Date} [now]
 */
export function writeCorpCodeCache(
  cachePath,
  codes,
  now = new Date(),
) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  const payload = {
    updatedAt: now.toISOString(),
    codes,
  }
  fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf8')
  return payload
}

/**
 * 수동 fallback 파일 (선택)
 * @param {string} [mapPath]
 */
export function readManualCorpCodeFallback(mapPath = MANUAL_FALLBACK_PATH) {
  try {
    if (!fs.existsSync(mapPath)) return null
    return normalizeCorpCodeCache(JSON.parse(fs.readFileSync(mapPath, 'utf8')))
  } catch {
    return null
  }
}

/**
 * @param {Buffer} zipBuffer
 */
export function buildCorpCodeMapFromZip(zipBuffer) {
  const xml = extractXmlTextFromZip(zipBuffer)
  return parseCorpCodeXml(xml)
}

/**
 * DART_API_KEY 있을 때만 네트워크 요청. 7일 캐시 우선.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   cachePath?: string,
 *   manualPath?: string,
 *   now?: number,
 *   forceRefresh?: boolean,
 * }} [options]
 */
export async function ensureDartCorpCodeMap(options = {}) {
  const env = options.env || process.env
  const apiKey = env.DART_API_KEY?.trim()
  const cachePath = options.cachePath || DEFAULT_CACHE_PATH
  const now = options.now ?? Date.now()

  if (!apiKey) {
    memoryMap = null
    return {
      configured: false,
      ready: false,
      source: 'none',
      codes: {},
      message: '공시 연동이 아직 설정되지 않았습니다.',
    }
  }

  if (memoryMap && !options.forceRefresh) {
    const updated = Date.parse(memoryMap.updatedAt)
    if (
      Number.isFinite(updated) &&
      now - updated >= 0 &&
      now - updated <= DART_CORP_CACHE_TTL_MS
    ) {
      return {
        configured: true,
        ready: true,
        source: 'memory',
        codes: memoryMap.codes,
        updatedAt: memoryMap.updatedAt,
      }
    }
  }

  const cached = readCorpCodeCache(cachePath, now)
  if (cached.fresh && cached.data && !options.forceRefresh) {
    memoryMap = cached.data
    return {
      configured: true,
      ready: true,
      source: 'cache',
      codes: cached.data.codes,
      updatedAt: cached.data.updatedAt,
    }
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const url = `${CORP_CODE_URL}?crtfc_key=${encodeURIComponent(apiKey)}`

  try {
    const response = await fetchImpl(url, { method: 'GET' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const zipBuffer = Buffer.from(arrayBuffer)
    const codes = buildCorpCodeMapFromZip(zipBuffer)
    if (Object.keys(codes).length === 0) {
      throw new Error('Empty corp code map')
    }
    const saved = writeCorpCodeCache(cachePath, codes, new Date(now))
    memoryMap = saved
    return {
      configured: true,
      ready: true,
      source: 'network',
      codes: saved.codes,
      updatedAt: saved.updatedAt,
    }
  } catch {
    // 네트워크 실패 시 stale cache → manual fallback
    if (cached.hit && cached.data) {
      memoryMap = cached.data
      return {
        configured: true,
        ready: true,
        source: 'stale_cache',
        codes: cached.data.codes,
        updatedAt: cached.data.updatedAt,
      }
    }

    const manual = readManualCorpCodeFallback(options.manualPath)
    if (manual) {
      memoryMap = manual
      return {
        configured: true,
        ready: true,
        source: 'manual_fallback',
        codes: manual.codes,
        updatedAt: manual.updatedAt,
      }
    }

    return {
      configured: true,
      ready: false,
      source: 'error',
      codes: {},
      message: 'DART 기업코드 목록을 가져오지 못했습니다.',
    }
  }
}

/**
 * @param {string} symbol
 * @param {Record<string, { corpCode: string, corpName: string }>} [codes]
 */
export function lookupCorpCodeFromMap(symbol, codes = memoryMap?.codes || {}) {
  const stock = String(symbol || '')
    .trim()
    .replace(/^A/i, '')
  if (!/^\d{6}$/.test(stock)) return null
  const hit = codes[stock]
  if (!hit?.corpCode) return null
  return hit
}

export function clearDartCorpCodeMemory() {
  memoryMap = null
}

export function getDartCorpCachePath() {
  return DEFAULT_CACHE_PATH
}

export function isDartCorpMapReady() {
  return Boolean(memoryMap && Object.keys(memoryMap.codes || {}).length > 0)
}
