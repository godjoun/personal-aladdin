/**
 * naverNewsProvider.js — NAVER API HUB 뉴스 검색 (서버 전용)
 *
 * Base: https://naverapihub.apigw.ntruss.com
 * GET  /search/v1/news
 * Auth: X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
 * (env 이름은 호환용: NAVER_NEWS_CLIENT_ID / NAVER_NEWS_CLIENT_SECRET
 *  → NCP NAVER API HUB에서 발급한 Client ID / Secret)
 */

import {
  getNaverNewsConfigStatus,
  getNewsCache,
  normalizeNewsItem,
  setNewsCache,
} from './newsProvider.js'
import { fetchWithTimeout } from '../utils/fetchTimeout.js'

export const NAVER_API_HUB_HOST = 'naverapihub.apigw.ntruss.com'
export const NAVER_NEWS_PATH = '/search/v1/news'
export const NAVER_NEWS_URL = `https://${NAVER_API_HUB_HOST}${NAVER_NEWS_PATH}`

/**
 * 고정 upstream만 허용 (SSRF 방지)
 * @param {string} raw
 */
export function assertNaverApiHubUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid news upstream URL')
  }
  if (url.protocol !== 'https:') {
    throw new Error('News upstream must use HTTPS')
  }
  if (url.hostname !== NAVER_API_HUB_HOST) {
    throw new Error('News upstream host is not allowed')
  }
  if (url.pathname !== NAVER_NEWS_PATH) {
    throw new Error('News upstream path is not allowed')
  }
  return url
}

/**
 * @param {string} query
 * @param {number} display
 */
export function buildNaverNewsSearchUrl(query, display = 10) {
  const url = assertNaverApiHubUrl(NAVER_NEWS_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', String(display))
  url.searchParams.set('start', '1')
  url.searchParams.set('sort', 'date')
  url.searchParams.set('format', 'json')
  return url
}

/**
 * @param {string} query
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   display?: number,
 *   symbol?: string,
 *   stockName?: string,
 * }} [options]
 */
export async function fetchNaverNews(query, options = {}) {
  const env = options.env || process.env
  const config = getNaverNewsConfigStatus(env)
  if (!config.configured) {
    return {
      ok: true,
      configured: false,
      items: [],
      message: '뉴스 연동이 아직 설정되지 않았습니다.',
    }
  }

  const q = String(query || '').trim().slice(0, 100)
  if (!q) {
    return { ok: false, configured: true, items: [], message: 'Empty query' }
  }

  const display = Math.min(Math.max(Number(options.display) || 10, 1), 20)
  const cacheKey = `naver:${q}:${display}`
  const cached = getNewsCache(cacheKey)
  if (cached) {
    return { ...cached, cached: true }
  }

  let url
  try {
    url = buildNaverNewsSearchUrl(q, display)
  } catch {
    return {
      ok: false,
      configured: true,
      items: [],
      message: 'News request failed',
    }
  }

  const clientId = env.NAVER_NEWS_CLIENT_ID.trim()
  const clientSecret = env.NAVER_NEWS_CLIENT_SECRET.trim()
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  let response
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      url.toString(),
      {
        method: 'GET',
        headers: {
          'X-NCP-APIGW-API-KEY-ID': clientId,
          'X-NCP-APIGW-API-KEY': clientSecret,
        },
      },
      { timeoutMs: options.timeoutMs ?? 12_000 },
    )
  } catch {
    if (cached) return { ...cached, cached: true, stale: true }
    return {
      ok: false,
      configured: true,
      items: [],
      message: 'News request failed',
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      items: [],
      message: 'News inquiry failed',
    }
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    return {
      ok: false,
      configured: true,
      items: [],
      message: 'News inquiry failed',
    }
  }

  const rawItems = Array.isArray(payload?.items) ? payload.items : []
  const items = rawItems.map((item) =>
    normalizeNewsItem(
      {
        title: item.title,
        description: item.description,
        link: item.link,
        originallink: item.originallink,
        pubDate: item.pubDate,
        source: 'naver',
      },
      { symbol: options.symbol, stockName: options.stockName },
    ),
  )

  const result = {
    ok: true,
    configured: true,
    items,
    message: null,
  }
  setNewsCache(cacheKey, result)
  return result
}
