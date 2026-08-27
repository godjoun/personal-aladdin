/**
 * kiwoomDividendSync.js — 키움 배당 지급내역 → dividendStorage + SQLite
 */

import {
  getDividendEvents,
  saveDividendEvents,
} from './dividendStorage.js'
import { persistDividendEvents } from './dividendPersistence.js'
import { apiFetch } from './apiClient.js'

/**
 * @param {{ fetchImpl?: typeof fetch, from?: string, to?: string }} [options]
 */
export async function fetchKiwoomDividendPayments(options = {}) {
  const fetchImpl = options.fetchImpl ?? apiFetch
  const params = new URLSearchParams()
  if (options.from) params.set('from', options.from)
  if (options.to) params.set('to', options.to)

  const query = params.toString()
  const url = query
    ? `/api/kiwoom/dividends?${query}`
    : '/api/kiwoom/dividends?from=2026-08-01'

  let response
  try {
    response = await fetchImpl(url)
  } catch {
    const error = new Error('Kiwoom dividends request failed')
    error.code = 'KIWOOM_DIVIDENDS_NETWORK'
    throw error
  }

  if (!response.ok) {
    const error = new Error('Kiwoom dividends inquiry failed')
    error.code = 'KIWOOM_DIVIDENDS_HTTP'
    error.status = response.status
    throw error
  }

  const payload = await response.json()
  return {
    ok: Boolean(payload?.ok),
    dividends: Array.isArray(payload?.dividends) ? payload.dividends : [],
    accounts: payload?.accounts ?? null,
  }
}

/**
 * 키움 배당 지급을 PAID 이벤트로 upsert
 *
 * @param {Array<object>} dividends
 */
export function upsertKiwoomDividendEvents(dividends) {
  const incoming = Array.isArray(dividends) ? dividends : []
  const existing = getDividendEvents()
  const existingKeys = new Set(
    existing
      .filter((event) => event?.source === 'KIWOOM' && event?.sourceKey)
      .map((event) => event.sourceKey),
  )

  for (const event of existing) {
    if (typeof event?.id === 'string' && event.id.startsWith('kiwoom:')) {
      existingKeys.add(event.id)
    }
  }

  const now = new Date().toISOString()
  const additions = []

  for (const payment of incoming) {
    const sourceKey =
      payment?.sourceKey ||
      (payment?.accountType && payment?.paymentDate
        ? `kiwoom:${payment.accountType}:${String(payment.paymentDate).replaceAll('-', '')}:${payment.tradeNo || ''}`
        : null)

    if (!sourceKey || existingKeys.has(sourceKey)) {
      continue
    }

    const amount = Number(payment.amount ?? payment.confirmedAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      continue
    }

    const paymentDate = String(payment.paymentDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      continue
    }

    additions.push({
      id: sourceKey,
      sourceKey,
      symbol: String(payment.symbol || '').trim(),
      fundName: String(payment.name || '').trim(),
      recordDate: null,
      exDate: null,
      paymentDate,
      distributionPerShare: 0,
      quantity: 0,
      expectedAmount: null,
      confirmedAmount: amount,
      taxAmount:
        payment.taxAmount == null || !Number.isFinite(Number(payment.taxAmount))
          ? null
          : Number(payment.taxAmount),
      status: 'PAID',
      source: 'KIWOOM',
      accountType: payment.accountType || null,
      createdAt: now,
      updatedAt: now,
    })

    existingKeys.add(sourceKey)
  }

  const next = [...existing, ...additions]
  if (additions.length > 0) {
    saveDividendEvents(next)
  }

  return {
    added: additions.length,
    skipped: incoming.length - additions.length,
    total: next.length,
    events: next,
    additions,
  }
}

/**
 * 키움 배당 조회 + local/서버 upsert
 */
export async function syncKiwoomDividends(options = {}) {
  const fetchImpl = options.fetchImpl ?? apiFetch
  const result = await fetchKiwoomDividendPayments({ ...options, fetchImpl })
  if (!result.ok) {
    return {
      ok: false,
      added: 0,
      skipped: 0,
      total: getDividendEvents().length,
      dividends: [],
      additions: [],
    }
  }

  const upsert = upsertKiwoomDividendEvents(result.dividends)

  if (upsert.additions.length > 0) {
    try {
      await persistDividendEvents(upsert.additions, fetchImpl)
    } catch (error) {
      console.warn('[kiwoomDividendSync] 서버 저장 실패:', error.message)
    }
  } else {
    try {
      const server = await (options.fetchImpl ?? apiFetch)('/api/dividends')
      if (server.ok) {
        const payload = await server.json()
        if (Array.isArray(payload.events)) {
          saveDividendEvents(payload.events)
        }
      }
    } catch {
      // local 유지
    }
  }

  return {
    ok: true,
    added: upsert.added,
    skipped: upsert.skipped,
    total: getDividendEvents().length,
    dividends: result.dividends,
    additions: upsert.additions,
  }
}
