/**
 * kiwoomTransactions.js — 키움 위탁종합거래내역(kt00015) / 배당 추출
 * 조회 전용. 계좌번호·token·예수금잔고는 응답에 포함하지 않습니다.
 */

import {
  assertKiwoomAccountType,
  getKiwoomAccessToken,
  KIWOOM_ACCOUNT_TYPES,
  parseKiwoomNumber,
} from './kiwoomClient.js'

const KIWOOM_ACCOUNT_URL = 'https://api.kiwoom.com/api/dostk/acnt'
const KIWOOM_TRADE_API_ID = 'kt00015'
const TRADE_LIST_KEY = 'trst_ovrl_trde_prps_array'
const MAX_TRADE_PAGES = 50

/**
 * 실계좌 ISA 응답에서 확인된 배당/분배 적요명.
 * (수익분배금입금)
 */
export const KIWOOM_DIVIDEND_REMARK_MARKERS = Object.freeze([
  '수익분배금입금',
  '분배금입금',
  '배당금입금',
])

function readResponseHeader(headers, name) {
  if (!headers) return ''
  if (typeof headers.get === 'function') {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? ''
  }
  return headers[name] ?? headers[name.toLowerCase()] ?? ''
}

function isKiwoomReturnSuccess(payload) {
  if (payload == null || typeof payload !== 'object') return false
  if (!('return_code' in payload)) return true
  const code = payload.return_code
  return code === 0 || code === '0'
}

/**
 * YYYY-MM-DD | YYYYMMDD | Date → YYYYMMDD
 * @param {string | Date} value
 */
export function toKiwoomDateCompact(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}${m}${d}`
  }

  const raw = String(value ?? '').trim()
  if (/^\d{8}$/.test(raw)) return raw
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replaceAll('-', '')
  return ''
}

/**
 * YYYYMMDD → YYYY-MM-DD
 * @param {unknown} compact
 */
export function formatKiwoomPaymentDate(compact) {
  const raw = String(compact ?? '').trim()
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw)
  if (!match) return ''
  return `${match[1]}-${match[2]}-${match[3]}`
}

function todayKstCompact() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('-', '')
}

/**
 * 실제 키움 적요명 기반 배당/분배금 판별
 * @param {Record<string, unknown>} row
 */
export function isKiwoomDividendTransaction(row) {
  const remark = String(row?.rmrk_nm ?? row?.remarkName ?? '')
    .replace(/\s+/g, '')
    .trim()

  if (!remark) return false

  return KIWOOM_DIVIDEND_REMARK_MARKERS.some((marker) => remark.includes(marker))
}

/**
 * 매수/매도 등 일반 거래는 배당이 아님
 * @param {Record<string, unknown>} row
 */
export function isLikelyBuySellTransaction(row) {
  const kind = String(row?.trde_kind_nm ?? '').replace(/\s+/g, '')
  const remark = String(row?.rmrk_nm ?? '').replace(/\s+/g, '')
  return (
    kind.includes('매수') ||
    kind.includes('매도') ||
    remark.includes('매수') ||
    remark.includes('매도')
  )
}

/**
 * @param {Record<string, unknown>} row
 * @param {'isa' | 'general'} accountType
 */
export function normalizeKiwoomTransaction(row, accountType) {
  const source = row && typeof row === 'object' ? row : {}
  const symbol = String(source.stk_cd ?? '')
    .trim()
    .replace(/^A/i, '')

  return {
    accountType,
    tradeDate: String(source.trde_dt ?? '').trim(),
    tradeNo: String(source.trde_no ?? '').trim(),
    remarkName: String(source.rmrk_nm ?? '').trim(),
    tradeKindName: String(source.trde_kind_nm ?? '').trim(),
    symbol,
    name: String(source.stk_nm ?? '').trim(),
    settleAmount: parseKiwoomNumber(source.exct_amt),
    tradeAmount: parseKiwoomNumber(source.trde_amt),
    ioType: String(source.io_tp ?? '').trim(),
    ioTypeName: String(source.io_tp_nm ?? '').trim(),
    incomeResidentTax: parseKiwoomNumber(source.incm_resi_tax),
    processedAt: String(source.proc_tm ?? '').trim(),
  }
}

/**
 * 배당 지급 건으로 정규화 (계좌번호/예수금 미포함)
 * @param {Record<string, unknown>} row
 * @param {'isa' | 'general'} accountType
 */
export function toKiwoomDividendPayment(row, accountType) {
  const normalized = normalizeKiwoomTransaction(row, accountType)
  const amountRaw = normalized.settleAmount ?? normalized.tradeAmount
  const amount =
    amountRaw == null || !Number.isFinite(amountRaw) ? null : Math.abs(amountRaw)

  const taxRaw = normalized.incomeResidentTax
  const taxAmount =
    taxRaw == null || !Number.isFinite(taxRaw) ? null : Math.abs(taxRaw)

  const paymentDate = formatKiwoomPaymentDate(normalized.tradeDate)
  const sourceKey = `kiwoom:${accountType}:${normalized.tradeDate}:${normalized.tradeNo}`

  return {
    accountType,
    paymentDate,
    symbol: normalized.symbol,
    name: normalized.name,
    amount,
    confirmedAmount: amount,
    taxAmount,
    source: 'KIWOOM',
    sourceKey,
    remarkName: normalized.remarkName,
  }
}

/**
 * 단일 계좌 위탁종합거래내역(kt00015)
 *
 * @param {'isa' | 'general'} accountType
 * @param {{
 *   from?: string | Date,
 *   to?: string | Date,
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   now?: Date,
 *   maxPages?: number,
 * }} [options]
 */
export async function getKiwoomTransactions(accountType, options = {}) {
  assertKiwoomAccountType(accountType)

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const maxPages = options.maxPages ?? MAX_TRADE_PAGES
  const strtDt = toKiwoomDateCompact(options.from) || '20260801'
  const endDt = toKiwoomDateCompact(options.to) || todayKstCompact()

  let auth
  try {
    auth = await getKiwoomAccessToken(accountType, options)
  } catch (error) {
    return {
      ok: false,
      message:
        error?.code === 'KIWOOM_CONFIG'
          ? 'Kiwoom credentials are not configured'
          : 'Kiwoom authentication failed',
      transactions: [],
    }
  }

  const transactions = []
  let contYn = 'N'
  let nextKey = ''

  for (let page = 0; page < maxPages; page += 1) {
    let response
    try {
      response = await fetchImpl(KIWOOM_ACCOUNT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          authorization: `Bearer ${auth.token}`,
          'cont-yn': contYn,
          'next-key': nextKey,
          'api-id': KIWOOM_TRADE_API_ID,
        },
        body: JSON.stringify({
          strt_dt: strtDt,
          end_dt: endDt,
          tp: '0',
          stk_cd: '',
          crnc_cd: '',
          gds_tp: '0',
          frgn_stex_code: '',
          dmst_stex_tp: '%',
        }),
      })
    } catch {
      return {
        ok: false,
        message: 'Kiwoom transaction request failed',
        transactions: [],
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        message: 'Kiwoom transaction inquiry failed',
        transactions: [],
      }
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      return {
        ok: false,
        message: 'Kiwoom transaction inquiry failed',
        transactions: [],
      }
    }

    if (!isKiwoomReturnSuccess(payload)) {
      return {
        ok: false,
        message: 'Kiwoom transaction inquiry failed',
        transactions: [],
      }
    }

    const rows = Array.isArray(payload?.[TRADE_LIST_KEY])
      ? payload[TRADE_LIST_KEY]
      : []

    for (const row of rows) {
      transactions.push(normalizeKiwoomTransaction(row, accountType))
    }

    const responseContYn = String(
      readResponseHeader(response.headers, 'cont-yn'),
    ).trim()
    const responseNextKey = String(
      readResponseHeader(response.headers, 'next-key'),
    ).trim()

    if (responseContYn !== 'Y' || !responseNextKey) {
      return { ok: true, transactions }
    }

    contYn = 'Y'
    nextKey = responseNextKey
  }

  return {
    ok: false,
    message: 'Kiwoom transaction pagination limit exceeded',
    transactions: [],
  }
}

/**
 * 배당/분배금 지급내역만 추출 (ISA + 일반)
 *
 * @param {{
 *   from?: string | Date,
 *   to?: string | Date,
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   now?: Date,
 * }} [options]
 */
export async function getKiwoomDividendPayments(options = {}) {
  const results = await Promise.all(
    KIWOOM_ACCOUNT_TYPES.map(async (accountType) => {
      const result = await getKiwoomTransactions(accountType, options)
      if (!result.ok) {
        return { accountType, ok: false, dividends: [] }
      }

      const dividends = result.transactions
        .filter((row) =>
          isKiwoomDividendTransaction({
            rmrk_nm: row.remarkName,
            trde_kind_nm: row.tradeKindName,
          }),
        )
        .filter(
          (row) =>
            !isLikelyBuySellTransaction({
              rmrk_nm: row.remarkName,
              trde_kind_nm: row.tradeKindName,
            }),
        )
        .map((row) =>
          toKiwoomDividendPayment(
            {
              trde_dt: row.tradeDate,
              trde_no: row.tradeNo,
              rmrk_nm: row.remarkName,
              trde_kind_nm: row.tradeKindName,
              stk_cd: row.symbol,
              stk_nm: row.name,
              exct_amt: row.settleAmount,
              trde_amt: row.tradeAmount,
              io_tp: row.ioType,
              io_tp_nm: row.ioTypeName,
              incm_resi_tax: row.incomeResidentTax,
              proc_tm: row.processedAt,
            },
            accountType,
          ),
        )
        .filter((item) => item.amount != null && item.paymentDate)

      return { accountType, ok: true, dividends }
    }),
  )

  const dividends = results.flatMap((item) => item.dividends)
  const ok = results.some((item) => item.ok)

  return {
    ok,
    dividends: dividends.map(toPublicKiwoomDividend),
    accounts: Object.fromEntries(
      results.map((item) => [
        item.accountType,
        {
          ok: item.ok,
          count: item.dividends.length,
        },
      ]),
    ),
  }
}

/**
 * API 안전 응답용 (amount / taxAmount / source 만)
 * @param {ReturnType<typeof toKiwoomDividendPayment>} payment
 */
export function toPublicKiwoomDividend(payment) {
  return {
    accountType: payment.accountType,
    paymentDate: payment.paymentDate,
    symbol: payment.symbol,
    name: payment.name,
    amount: payment.amount,
    taxAmount: payment.taxAmount,
    source: payment.source,
    sourceKey: payment.sourceKey,
  }
}
