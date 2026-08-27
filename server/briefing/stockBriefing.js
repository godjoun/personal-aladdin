/**
 * stockBriefing.js — 종목 브리핑 조립 (부분 실패 허용)
 */

import { getKiwoomStockInfo } from '../kiwoomStockInfo.js'
import { fetchNaverNews } from '../news/naverNewsProvider.js'
import { fetchDartDisclosures } from '../dart/dartProvider.js'
import { buildBriefingRiskSignals } from '../../src/utils/briefingRiskSignals.js'
import { mapWithConcurrency } from '../utils/serverConcurrency.js'

/** 주의요약 종목별 동시 호출 상한 */
export const ATTENTION_CONCURRENCY = 3


/** 상단 주의 신호에 올릴 중요 공시 최대 건수 */
export const DISCLOSURE_SIGNAL_LIMIT = 3

/**
 * DART rcept_dt (YYYYMMDD) → YYYY-MM-DD
 * @param {unknown} raw
 */
export function formatDisclosureDate(raw) {
  const text = String(raw || '').trim()
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  }
  return text || null
}

/**
 * 중요 공시만 날짜 내림차순으로 1~limit건 → 주의 신호
 *
 * @param {Array<{ title?: string, submittedAt?: string | null, link?: string | null, important?: boolean }>} items
 * @param {{ limit?: number }} [options]
 */
export function buildImportantDisclosureSignals(items, options = {}) {
  const limit = Math.min(
    Math.max(Number(options.limit) || DISCLOSURE_SIGNAL_LIMIT, 1),
    5,
  )
  const important = (Array.isArray(items) ? items : [])
    .filter((item) => item?.important)
    .slice()
    .sort((a, b) => {
      const da = String(a.submittedAt || '')
      const db = String(b.submittedAt || '')
      return db.localeCompare(da)
    })
    .slice(0, limit)

  return important.map((item) => {
    const submittedAt = formatDisclosureDate(item.submittedAt)
    return {
      id: `disclosure:${item.title}:${item.submittedAt}`,
      level: '확인 필요',
      title: String(item.title || '').trim() || '(공시명 없음)',
      detail: null,
      evidence: submittedAt,
      priority: 95,
      source: 'disclosure',
      link: item.link || null,
      submittedAt,
    }
  })
}

/**
 * @param {string} symbol
 * @param {{
 *   stockName?: string,
 *   holdings?: Array<{
 *     accountType?: string | null,
 *     quantity?: number | null,
 *     averageBuyPrice?: number | null,
 *     latestPrice?: number | null,
 *     holdingValue?: number | null,
 *     profitLoss?: number | null,
 *     profitRate?: number | null,
 *   }>,
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export async function getStockBriefing(symbol, options = {}) {
  const code = String(symbol || '')
    .trim()
    .replace(/^A/i, '')
  const stockName = String(options.stockName || '').trim()

  const [infoResult, newsResult, disclosureResult] = await Promise.all([
    getKiwoomStockInfo(code, {
      env: options.env,
      fetchImpl: options.fetchImpl,
    }).catch(() => ({
      ok: false,
      message: 'Kiwoom stock info failed',
      info: null,
    })),
    fetchNaverNews(stockName || code, {
      env: options.env,
      fetchImpl: options.fetchImpl,
      symbol: code,
      stockName,
      display: 10,
    }).catch(() => ({
      ok: false,
      configured: false,
      items: [],
      message: 'News failed',
    })),
    fetchDartDisclosures(code, {
      env: options.env,
      fetchImpl: options.fetchImpl,
      stockName,
      pageCount: 10,
    }).catch(() => ({
      ok: false,
      configured: false,
      items: [],
      message: 'Disclosures failed',
    })),
  ])

  const info = infoResult.ok ? infoResult.info : null
  const numericSignals = buildBriefingRiskSignals({
    info,
    holdings: options.holdings || [],
  })

  /** @type {Array<{ id: string, level: string, title: string, detail: string | null, evidence: string | null, priority: number, source: string }>} */
  const attentionSignals = [
    ...buildImportantDisclosureSignals(disclosureResult.items || []),
  ]

  for (const item of newsResult.items || []) {
    if (!item.attention) continue
    attentionSignals.push({
      id: `news:${item.title}:${item.publishedAt}`,
      level: item.attention.level,
      title: `${item.attention.matched} 관련 기사`,
      detail: '뉴스 제목/요약에 해당 단어가 포함되어 있습니다. 단정하지 마세요.',
      evidence: `뉴스 · ${item.attention.matched}`,
      priority: item.attention.level === '주의' ? 55 : 40,
      source: 'news',
      link: item.link,
      publishedAt: item.publishedAt,
    })
  }

  const signals = [...attentionSignals, ...numericSignals].sort(
    (a, b) => b.priority - a.priority,
  )

  return {
    ok: true,
    symbol: code,
    stockName: stockName || info?.name || null,
    holdings: options.holdings || [],
    info: {
      ok: Boolean(infoResult.ok),
      message: infoResult.ok ? null : infoResult.message || '종목정보 조회 실패',
      data: info,
    },
    news: {
      configured: Boolean(newsResult.configured),
      ok: Boolean(newsResult.ok),
      message: newsResult.message || null,
      items: newsResult.items || [],
    },
    disclosures: {
      configured: Boolean(disclosureResult.configured),
      ok: Boolean(disclosureResult.ok),
      message: disclosureResult.message || null,
      items: disclosureResult.items || [],
    },
    signals,
  }
}

/**
 * 뉴스·공시만으로 주의 요약 (종목정보 API 호출 없음 — 동기화 부담 감소)
 *
 * @param {string} symbol
 * @param {{ stockName?: string, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} [options]
 */
export async function getStockAttentionLite(symbol, options = {}) {
  const code = String(symbol || '')
    .trim()
    .replace(/^A/i, '')
  const stockName = String(options.stockName || '').trim()

  const [newsResult, disclosureResult] = await Promise.all([
    fetchNaverNews(stockName || code, {
      env: options.env,
      fetchImpl: options.fetchImpl,
      symbol: code,
      stockName,
      display: 5,
    }).catch(() => ({
      ok: false,
      configured: false,
      items: [],
    })),
    fetchDartDisclosures(code, {
      env: options.env,
      fetchImpl: options.fetchImpl,
      stockName,
      pageCount: 10,
    }).catch(() => ({
      ok: false,
      configured: false,
      items: [],
    })),
  ])

  /** @type {Array<{ symbol: string, name: string, level: string, title: string, evidence: string | null, source: string }>} */
  const signals = []

  for (const item of buildImportantDisclosureSignals(disclosureResult.items || [])) {
    signals.push({
      symbol: code,
      name: stockName || code,
      level: item.level,
      title: item.title,
      evidence: item.evidence,
      source: 'disclosure',
    })
  }
  for (const item of newsResult.items || []) {
    if (!item.attention) continue
    signals.push({
      symbol: code,
      name: stockName || code,
      level: item.attention.level,
      title: `${item.attention.matched} 관련 기사`,
      evidence: `뉴스 · ${item.attention.matched}`,
      source: 'news',
    })
  }

  return signals
}

/**
 * 보유 종목 요약 주의사항 (최대 limit건)
 *
 * @param {Array<{ symbol: string, name?: string }>} holdings
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, limit?: number }} [options]
 */
export async function getHoldingsAttentionSummary(holdings, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 10)
  const list = Array.isArray(holdings) ? holdings.slice(0, 20) : []
  const concurrency = options.concurrency ?? ATTENTION_CONCURRENCY

  const settled = await mapWithConcurrency(list, concurrency, async (row) => {
    const symbol = String(row.symbol || '')
      .trim()
      .replace(/^A/i, '')
    const name = String(row.name || '').trim()
    if (!symbol && !name) return []
    try {
      return await getStockAttentionLite(symbol || name, {
        stockName: name,
        env: options.env,
        fetchImpl: options.fetchImpl,
      })
    } catch {
      return []
    }
  })

  const flat = settled.flatMap((result) =>
    result.status === 'fulfilled' && Array.isArray(result.value)
      ? result.value
      : [],
  )
  flat.sort((a, b) => {
    const ap = a.source === 'disclosure' ? 2 : 1
    const bp = b.source === 'disclosure' ? 2 : 1
    return bp - ap
  })

  const seen = new Set()
  const items = []
  for (const item of flat) {
    const key = `${item.symbol}:${item.title}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
    if (items.length >= limit) break
  }

  return { ok: true, items }
}
