/**
 * dartProvider.js — OpenDART 공시 (서버 전용, 미설정 시 graceful)
 */

import {
  classifyAttentionText,
  isImportantDisclosureTitle,
} from '../briefing/attentionKeywords.js'
import { sanitizeHttpUrl } from '../news/newsProvider.js'
import {
  ensureDartCorpCodeMap,
  lookupCorpCodeFromMap,
} from './corpCodeMap.js'
import { fetchWithTimeout } from '../utils/fetchTimeout.js'

const DART_LIST_URL = 'https://opendart.fss.or.kr/api/list.json'
/** 공시 list cache — 전체 동기화마다 재호출 방지 */
export const DART_CACHE_TTL_MS = 20 * 60 * 1000
const CACHE_TTL_MS = DART_CACHE_TTL_MS
/** 최근 동기화가 있으면 증분 조회 일수 */
export const DART_INCREMENTAL_LOOKBACK_DAYS = 14
const PROVIDER_TIMEOUT_MS = 15_000

/** 브리핑 기본 공시 조회 기간 */
export const DART_LOOKBACK_DAYS = 90

const MSG_NOT_CONFIGURED = '공시 연동이 아직 설정되지 않았습니다.'
const MSG_MAPPING = '기업 공시 매핑을 확인할 수 없습니다.'
const MSG_FETCH_FAILED = '공시를 불러오지 못했습니다.'
const MSG_EMPTY = '최근 90일 내 공시가 없습니다.'

/** @type {Map<string, { expiresAt: number, payload: unknown }>} */
const disclosureCache = new Map()

/** @type {Map<string, number>} corpCode → last successful sync ms */
const lastSyncAtByCorp = new Map()

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getDartConfigStatus(env = process.env) {
  const key = env.DART_API_KEY?.trim()
  if (!key) return { configured: false, reason: 'not_configured' }
  return { configured: true }
}

/**
 * 동기 lookup (이미 ensureDartCorpCodeMap 로드된 경우)
 * 테스트/수동 fallback용 path 인자 유지
 *
 * @param {string} symbol
 * @param {string} [_ignoredPath]
 * @param {Record<string, { corpCode: string, corpName: string }>} [codes]
 */
export function lookupDartCorpCode(symbol, _ignoredPath, codes) {
  const hit = lookupCorpCodeFromMap(symbol, codes)
  return hit?.corpCode || null
}

/**
 * @param {Date} end
 * @param {number} lookbackDays
 */
export function buildDartDateRange(end = new Date(), lookbackDays = DART_LOOKBACK_DAYS) {
  const days = Math.max(1, Number(lookbackDays) || DART_LOOKBACK_DAYS)
  const begin = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const fmt = (d) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return { bgnDe: fmt(begin), endDe: fmt(end), lookbackDays: days }
}

/**
 * @param {unknown} row
 */
export function normalizeDartDisclosure(row) {
  const title = String(row?.report_nm || row?.title || '').trim()
  const attention = classifyAttentionText(title)
  const rceptNo = String(row?.rcept_no || '').trim()
  const link = rceptNo
    ? sanitizeHttpUrl(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`)
    : null

  return {
    title: title || '(공시명 없음)',
    submittedAt: String(row?.rcept_dt || row?.submittedAt || '').trim() || null,
    corpName: String(row?.corp_name || row?.corpName || '').trim() || null,
    link,
    important: isImportantDisclosureTitle(title),
    attention: attention
      ? {
          level: '주의',
          categoryLabel: attention.categoryLabel,
          matched: attention.matched,
        }
      : null,
  }
}

/**
 * @param {string} symbol
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   stockName?: string,
 *   pageCount?: number,
 *   lookbackDays?: number,
 *   cachePath?: string,
 *   manualPath?: string,
 *   now?: number,
 * }} [options]
 */
export async function fetchDartDisclosures(symbol, options = {}) {
  const env = options.env || process.env
  const config = getDartConfigStatus(env)
  if (!config.configured) {
    return {
      ok: true,
      configured: false,
      items: [],
      message: MSG_NOT_CONFIGURED,
      reason: 'not_configured',
    }
  }

  const mapResult = await ensureDartCorpCodeMap({
    env,
    fetchImpl: options.fetchImpl,
    cachePath: options.cachePath,
    manualPath: options.manualPath,
    now: options.now,
  })

  if (!mapResult.ready) {
    return {
      ok: false,
      configured: true,
      items: [],
      message: MSG_MAPPING,
      reason: 'mapping_unavailable',
    }
  }

  const corp = lookupCorpCodeFromMap(symbol, mapResult.codes)
  if (!corp?.corpCode) {
    return {
      ok: true,
      configured: true,
      items: [],
      message: MSG_MAPPING,
      reason: 'unmapped',
      unmapped: true,
    }
  }

  const pageCount = Math.min(Math.max(Number(options.pageCount) || 10, 1), 30)
  const hadPrior = lastSyncAtByCorp.has(corp.corpCode)
  const lookbackDays = Math.max(
    1,
    Number(options.lookbackDays) ||
      (hadPrior ? DART_INCREMENTAL_LOOKBACK_DAYS : DART_LOOKBACK_DAYS),
  )
  const cacheKey = `dart:${corp.corpCode}:${pageCount}`
  const cached = disclosureCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() && !options.forceRefresh) {
    return { ...cached.payload, cached: true }
  }

  // stale cache 유지용 (timeout/실패 시)
  const stale = cached?.payload || null

  const { bgnDe, endDe } = buildDartDateRange(new Date(), lookbackDays)

  const url = new URL(DART_LIST_URL)
  url.searchParams.set('crtfc_key', env.DART_API_KEY.trim())
  url.searchParams.set('corp_code', corp.corpCode)
  url.searchParams.set('bgn_de', bgnDe)
  url.searchParams.set('end_de', endDe)
  url.searchParams.set('page_count', String(pageCount))

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  let response
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      url.toString(),
      { method: 'GET' },
      { timeoutMs: options.timeoutMs ?? PROVIDER_TIMEOUT_MS },
    )
  } catch {
    if (stale) return { ...stale, cached: true, stale: true }
    return {
      ok: false,
      configured: true,
      items: [],
      message: MSG_FETCH_FAILED,
      reason: 'request_failed',
      corpName: corp.corpName || null,
    }
  }

  if (!response.ok) {
    if (stale) return { ...stale, cached: true, stale: true }
    return {
      ok: false,
      configured: true,
      items: [],
      message: MSG_FETCH_FAILED,
      reason: 'http_error',
      corpName: corp.corpName || null,
    }
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    if (stale) return { ...stale, cached: true, stale: true }
    return {
      ok: false,
      configured: true,
      items: [],
      message: MSG_FETCH_FAILED,
      reason: 'invalid_json',
      corpName: corp.corpName || null,
    }
  }

  const status = String(payload?.status || '')
  // 000: 정상, 013: 조회 결과 없음
  if (status && status !== '000' && status !== '013') {
    if (stale) return { ...stale, cached: true, stale: true }
    return {
      ok: false,
      configured: true,
      items: [],
      message: MSG_FETCH_FAILED,
      reason: 'api_error',
      corpName: corp.corpName || null,
    }
  }

  const rows = Array.isArray(payload?.list) ? payload.list : []
  let items = rows.map((row) => normalizeDartDisclosure(row))

  // 증분 조회 시 stale 항목과 merge (제목+제출일 기준)
  if (lookbackDays < DART_LOOKBACK_DAYS && stale?.items?.length) {
    const seen = new Set(items.map((i) => `${i.title}|${i.submittedAt}`))
    for (const prev of stale.items) {
      const key = `${prev.title}|${prev.submittedAt}`
      if (!seen.has(key)) {
        items.push(prev)
        seen.add(key)
      }
    }
    items.sort((a, b) =>
      String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')),
    )
  }

  const result = {
    ok: true,
    configured: true,
    items,
    message: items.length === 0 ? MSG_EMPTY : null,
    reason: items.length === 0 ? 'empty' : 'ok',
    corpName: corp.corpName || null,
    corpCode: corp.corpCode,
    lookbackDays,
    bgnDe,
    endDe,
  }
  disclosureCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload: result,
  })
  lastSyncAtByCorp.set(corp.corpCode, Date.now())
  return result
}

export function clearDartCache() {
  disclosureCache.clear()
  lastSyncAtByCorp.clear()
}
