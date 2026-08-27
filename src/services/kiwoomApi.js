/**
 * kiwoomApi.js — 키움 잔고 조회 (클라이언트)
 * ─────────────────────────────────────────────────────────
 * GET /api/kiwoom/balances 만 호출합니다.
 * App Key / Secret / token / 계좌번호는 응답에 포함되지 않습니다.
 * localStorage 에 저장하지 않습니다.
 */

import { apiFetch } from './apiClient.js'

const ACCOUNT_TYPES = ['isa', 'general']

/**
 * @param {unknown} field
 * @returns {number | null}
 */
export function readKiwoomNumericValue(field) {
  if (field == null) return null

  if (typeof field === 'object' && 'value' in field) {
    const value = field.value
    if (value == null || value === '') return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  if (field === '') return null
  const num = Number(field)
  return Number.isFinite(num) ? num : null
}

/**
 * 금액/단가 — 부호가 붙은 시세 문자열은 절댓값 사용
 * (값이 없으면 null, 0 으로 강제하지 않음)
 *
 * @param {unknown} field
 * @returns {number | null}
 */
export function readKiwoomMoneyValue(field) {
  const value = readKiwoomNumericValue(field)
  if (value == null) return null
  const abs = Math.abs(value)
  return Number.isFinite(abs) ? abs : null
}

/**
 * API 응답 → 계좌 태그가 붙은 holdings
 *
 * @param {unknown} payload
 * @returns {Array<{
 *   accountType: 'isa' | 'general',
 *   symbol: string,
 *   name: string,
 *   quantity: number | null,
 *   averageBuyPrice: number | null,
 *   currentPrice: number | null,
 *   evaluationAmount: number | null,
 *   profitLoss: number | null,
 *   returnRate: number | null,
 *   buyAmount: number | null,
 * }>}
 */
export function flattenKiwoomBalanceHoldings(payload) {
  const holdings = []

  for (const accountType of ACCOUNT_TYPES) {
    const account = payload?.accounts?.[accountType]
    if (!account?.ok || !Array.isArray(account.holdings)) {
      continue
    }

    for (const row of account.holdings) {
      const symbol = String(row?.code?.value || row?.code?.raw || row?.symbol || '')
        .trim()
        .replace(/^A/i, '')
      const name = String(row?.name || '').trim()

      if (!symbol && !name) {
        continue
      }

      holdings.push({
        accountType,
        symbol,
        name,
        quantity: readKiwoomNumericValue(row.quantity),
        averageBuyPrice: readKiwoomMoneyValue(row.avgBuyPrice ?? row.averageBuyPrice),
        currentPrice: readKiwoomMoneyValue(row.currentPrice),
        evaluationAmount: readKiwoomMoneyValue(row.evalAmount ?? row.evaluationAmount),
        profitLoss: readKiwoomNumericValue(row.profitLoss),
        returnRate: readKiwoomNumericValue(row.returnRate ?? row.profitRate),
        buyAmount: readKiwoomMoneyValue(row.buyAmount),
      })
    }
  }

  return holdings
}

/**
 * API 응답 → 계좌별 출금가능금액 (공식 값, null이면 미제공)
 *
 * @param {unknown} payload
 * @returns {Array<{ accountType: 'isa' | 'general', withdrawableAmount: number | null }>}
 */
export function extractKiwoomWithdrawableByAccount(payload) {
  /** @type {Array<{ accountType: 'isa' | 'general', withdrawableAmount: number | null }>} */
  const list = []

  for (const accountType of ACCOUNT_TYPES) {
    const account = payload?.accounts?.[accountType]
    if (!account || account.ok !== true) {
      list.push({ accountType, withdrawableAmount: null })
      continue
    }

    const field = account.withdrawableAmount
    const amount = readKiwoomNumericValue(field)
    list.push({
      accountType,
      withdrawableAmount: amount,
    })
  }

  return list
}

/**
 * 키움 잔고 조회 (조회 전용, 저장 없음)
 */
export async function fetchKiwoomBalances(options = {}) {
  const fetchImpl = options.fetchImpl ?? apiFetch
  let response

  try {
    response = await fetchImpl('/api/kiwoom/balances')
  } catch {
    const error = new Error('Kiwoom balances request failed')
    error.code = 'KIWOOM_BALANCES_NETWORK'
    throw error
  }

  if (!response.ok) {
    const error = new Error('Kiwoom balances inquiry failed')
    error.code = 'KIWOOM_BALANCES_HTTP'
    error.status = response.status
    throw error
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    const error = new Error('Kiwoom balances inquiry failed')
    error.code = 'KIWOOM_BALANCES_PARSE'
    throw error
  }

  const holdings = flattenKiwoomBalanceHoldings(payload)
  const withdrawableByAccount = extractKiwoomWithdrawableByAccount(payload)
  const accountOk =
    Boolean(payload?.accounts?.isa?.ok) || Boolean(payload?.accounts?.general?.ok)

  return {
    ok: Boolean(payload?.ok) || accountOk,
    holdings,
    withdrawableByAccount,
    accounts: payload?.accounts ?? null,
  }
}
