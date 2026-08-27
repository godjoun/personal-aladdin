/**
 * newsProvider.js — 뉴스 provider 공통 (sanitize / cache / classify)
 */

import { classifyAttentionText } from '../briefing/attentionKeywords.js'

const DEFAULT_CACHE_TTL_MS = 7 * 60 * 1000

/** @type {Map<string, { expiresAt: number, payload: unknown }>} */
const newsCache = new Map()

/**
 * HTML 태그·엔티티 최소 제거 (XSS 방지)
 * @param {unknown} input
 * @returns {string}
 */
export function stripHtml(input) {
  let text = String(input ?? '')
  text = text.replace(/<[^>]*>/g, ' ')
  text = text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * http(s) 링크만 허용
 * @param {unknown} link
 * @returns {string | null}
 */
export function sanitizeHttpUrl(link) {
  const raw = String(link ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * @param {object} item
 * @param {{ symbol?: string, stockName?: string }} meta
 */
export function normalizeNewsItem(item, meta = {}) {
  const title = stripHtml(item?.title)
  const description = stripHtml(item?.description)
  const link = sanitizeHttpUrl(item?.link || item?.originallink)
  const attention = classifyAttentionText(`${title} ${description}`)

  return {
    title: title || '(제목 없음)',
    description: description || '',
    publishedAt: item?.publishedAt || item?.pubDate || null,
    source: String(item?.source || 'news').slice(0, 64),
    link,
    symbol: meta.symbol || null,
    stockName: meta.stockName || null,
    attention: attention
      ? {
          level: attention.priority >= 85 ? '주의' : '확인 필요',
          categoryLabel: attention.categoryLabel,
          matched: attention.matched,
        }
      : null,
  }
}

/**
 * @param {string} key
 * @param {unknown} payload
 * @param {number} [ttlMs]
 */
export function setNewsCache(key, payload, ttlMs = DEFAULT_CACHE_TTL_MS) {
  newsCache.set(key, { expiresAt: Date.now() + ttlMs, payload })
}

/**
 * @param {string} key
 */
export function getNewsCache(key) {
  const hit = newsCache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    newsCache.delete(key)
    return null
  }
  return hit.payload
}

/** 테스트용 */
export function clearNewsCache() {
  newsCache.clear()
}

/**
 * @returns {{ configured: boolean, reason?: string }}
 */
export function getNaverNewsConfigStatus(env = process.env) {
  const id = env.NAVER_NEWS_CLIENT_ID?.trim()
  const secret = env.NAVER_NEWS_CLIENT_SECRET?.trim()
  if (!id || !secret) {
    return { configured: false, reason: 'not_configured' }
  }
  return { configured: true }
}
