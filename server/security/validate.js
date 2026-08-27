/**
 * validate.js — API 입력 서버 재검증
 */

const MAX_STR = 200
const MAX_MEMO = 500
const MAX_ID = 80
const MAX_ARRAY = 500

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SYMBOL_RE = /^[A-Za-z0-9.]{1,20}$/
const ACCOUNT_TYPES = new Set(['isa', 'general'])
const DIVIDEND_STATUSES = new Set(['ESTIMATED', 'CONFIRMED', 'PAID'])

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string | null}
 */
export function asTrimmedString(value, max = MAX_STR) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asId(value) {
  const s = asTrimmedString(value, MAX_ID)
  if (!s) return null
  if (!/^[A-Za-z0-9:_.-]+$/.test(s)) return null
  return s
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asDate(value) {
  const s = asTrimmedString(value, 10)
  if (!s || !DATE_RE.test(s)) return null
  const d = new Date(`${s}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return s
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asSymbol(value) {
  const s = asTrimmedString(value, 20)
  if (!s || !SYMBOL_RE.test(s)) return null
  return s
}

/**
 * @param {unknown} value
 * @returns {'isa' | 'general' | null}
 */
export function asAccountType(value) {
  const s = asTrimmedString(value, 16)
  if (!s || !ACCOUNT_TYPES.has(s)) return null
  return /** @type {'isa' | 'general'} */ (s)
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function asNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 1e15) return null
  return n
}

/**
 * @param {unknown} value
 * @param {number} [maxLen]
 */
export function asSearchQuery(value, maxLen = 40) {
  const s = asTrimmedString(value, maxLen)
  if (!s) return null
  // URL/제어문자 차단
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i)
    if (code < 32 || s[i] === '<' || s[i] === '>' || s[i] === '`') {
      return null
    }
  }
  return s
}

/**
 * @param {object} raw
 * @returns {object | null}
 */
export function sanitizeDividendEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const id = raw.id != null ? asId(raw.id) : null
  const sourceKey = raw.sourceKey != null ? asId(raw.sourceKey) : null
  const status = asTrimmedString(raw.status, 16)
  if (!status || !DIVIDEND_STATUSES.has(status)) return null

  const paymentDate = raw.paymentDate != null ? asDate(raw.paymentDate) : null
  if (raw.paymentDate && !paymentDate) return null

  return {
    id: id || sourceKey || undefined,
    sourceKey: sourceKey || undefined,
    accountType: raw.accountType != null ? asAccountType(raw.accountType) : null,
    symbol: raw.symbol != null ? asSymbol(String(raw.symbol).replace(/^A/i, '')) || '' : '',
    fundName: asTrimmedString(raw.fundName, MAX_STR) || '',
    paymentDate,
    recordDate: raw.recordDate != null ? asDate(raw.recordDate) : null,
    exDate: raw.exDate != null ? asDate(raw.exDate) : null,
    distributionPerShare: asNonNegativeNumber(raw.distributionPerShare),
    quantity: asNonNegativeNumber(raw.quantity),
    expectedAmount: asNonNegativeNumber(raw.expectedAmount),
    confirmedAmount: asNonNegativeNumber(raw.confirmedAmount),
    taxAmount: asNonNegativeNumber(raw.taxAmount),
    status,
    source: asTrimmedString(raw.source, 32) || null,
    createdAt: asTrimmedString(raw.createdAt, 40) || undefined,
  }
}

/**
 * @param {unknown} list
 * @returns {object[] | null}
 */
export function sanitizeDividendEvents(list) {
  if (!Array.isArray(list) || list.length > MAX_ARRAY) return null
  const out = []
  for (const item of list) {
    const clean = sanitizeDividendEvent(item)
    if (!clean) return null
    out.push(clean)
  }
  return out
}

/**
 * @param {object} raw
 */
export function sanitizeManualAsset(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = asId(raw.id)
  if (!id) return null
  return {
    id,
    name: asTrimmedString(raw.name, MAX_STR) || '',
    symbol: raw.symbol != null ? asSymbol(String(raw.symbol)) || '' : '',
    assetType: asTrimmedString(raw.assetType, 40) || '',
    quantity: asNonNegativeNumber(raw.quantity),
    averageBuyPrice: asNonNegativeNumber(raw.averageBuyPrice),
    memo: asTrimmedString(raw.memo, MAX_MEMO) || '',
    createdAt: asTrimmedString(raw.createdAt, 40) || undefined,
  }
}

/**
 * @param {unknown} list
 */
export function sanitizeManualAssets(list) {
  if (!Array.isArray(list) || list.length > MAX_ARRAY) return null
  const out = []
  for (const item of list) {
    const clean = sanitizeManualAsset(item)
    if (!clean) return null
    out.push(clean)
  }
  return out
}

/**
 * @param {object} raw
 */
export function sanitizeManualTrade(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = asId(raw.id)
  if (!id) return null
  const side = asTrimmedString(raw.side || raw.type, 8)
  return {
    id,
    assetId: raw.assetId != null ? asId(raw.assetId) : null,
    type: side,
    side,
    quantity: asNonNegativeNumber(raw.quantity),
    price: asNonNegativeNumber(raw.price),
    tradedAt: asTrimmedString(raw.tradedAt, 40) || undefined,
    memo: asTrimmedString(raw.memo, MAX_MEMO) || '',
    createdAt: asTrimmedString(raw.createdAt, 40) || undefined,
  }
}

/**
 * @param {unknown} list
 */
export function sanitizeManualTrades(list) {
  if (!Array.isArray(list) || list.length > MAX_ARRAY) return null
  const out = []
  for (const item of list) {
    const clean = sanitizeManualTrade(item)
    if (!clean) return null
    out.push(clean)
  }
  return out
}

/** public-data 허용 쿼리 키 */
export const PUBLIC_DATA_ALLOWED_KEYS = new Set([
  'numOfRows',
  'pageNo',
  'basDt',
  'itmsNm',
  'likeItmsNm',
  'isinCd',
  'srtnCd',
  'beginBasDt',
  'endBasDt',
])
