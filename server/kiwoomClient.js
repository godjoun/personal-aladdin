/**
 * kiwoomClient.js — 키움 REST API OAuth (ISA / 일반 계좌)
 * ─────────────────────────────────────────────────────────
 * App Key / Secret / token 은 로그·응답에 출력하지 않습니다.
 * 계좌별 토큰은 서버 메모리에서 분리 캐시합니다.
 */

const KIWOOM_TOKEN_URL = 'https://api.kiwoom.com/oauth2/token'
const KIWOOM_ACCOUNT_URL = 'https://api.kiwoom.com/api/dostk/acnt'
const KIWOOM_BALANCE_API_ID = 'kt00018'

/** 만료 직전 재발급 여유 (ms) */
const EXPIRY_SKEW_MS = 60_000

/** 연속조회 안전 상한 */
const MAX_BALANCE_PAGES = 50

/** 계좌평가잔고내역요청(kt00018) 공식 필수 body */
const KT00018_BODY = Object.freeze({
  qry_tp: '1', // 1:합산, 2:개별
  dmst_stex_tp: 'KRX', // KRX:한국거래소, NXT:넥스트트레이드
})

export const KIWOOM_ACCOUNT_TYPES = ['isa', 'general']

const CREDENTIAL_ENV = {
  isa: {
    key: 'KIWOOM_ISA_APP_KEY',
    secret: 'KIWOOM_ISA_APP_SECRET',
  },
  general: {
    key: 'KIWOOM_GENERAL_APP_KEY',
    secret: 'KIWOOM_GENERAL_APP_SECRET',
  },
}

/**
 * @typedef {'isa' | 'general'} KiwoomAccountType
 * @typedef {{ token: string, tokenType: string, expiresAt: Date }} KiwoomTokenCache
 */

/** @type {Record<KiwoomAccountType, KiwoomTokenCache | null>} */
const tokenCaches = {
  isa: null,
  general: null,
}

/**
 * 테스트용 캐시 초기화
 * @param {KiwoomAccountType | 'all'} [accountType='all']
 */
export function clearKiwoomTokenCache(accountType = 'all') {
  if (accountType === 'all') {
    tokenCaches.isa = null
    tokenCaches.general = null
    return
  }

  if (accountType in tokenCaches) {
    tokenCaches[accountType] = null
  }
}

/**
 * @param {unknown} accountType
 * @returns {asserts accountType is KiwoomAccountType}
 */
export function assertKiwoomAccountType(accountType) {
  if (!KIWOOM_ACCOUNT_TYPES.includes(accountType)) {
    const error = new Error('Invalid Kiwoom account type')
    error.code = 'KIWOOM_ACCOUNT_TYPE'
    throw error
  }
}

/**
 * expires_dt 문자열을 Date 로 변환합니다.
 * 지원: ISO 문자열, YYYYMMDDHHmmss
 *
 * @param {unknown} expiresDt
 * @returns {Date | null}
 */
export function parseKiwoomExpiresAt(expiresDt) {
  if (expiresDt == null) return null

  if (expiresDt instanceof Date && !Number.isNaN(expiresDt.getTime())) {
    return expiresDt
  }

  const raw = String(expiresDt).trim()
  if (!raw) return null

  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw)
  if (compact) {
    const [, y, mo, d, h, mi, s] = compact
    const date = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
    )
    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function readCredentials(accountType, env) {
  assertKiwoomAccountType(accountType)
  const mapping = CREDENTIAL_ENV[accountType]
  const appkey = env[mapping.key]?.trim()
  const secretkey = env[mapping.secret]?.trim()

  if (!appkey || !secretkey) {
    const error = new Error('Kiwoom credentials are not configured')
    error.code = 'KIWOOM_CONFIG'
    throw error
  }

  return { appkey, secretkey }
}

function isCacheValid(cache, now = new Date()) {
  if (!cache?.token || !(cache.expiresAt instanceof Date)) {
    return false
  }

  return cache.expiresAt.getTime() - EXPIRY_SKEW_MS > now.getTime()
}

/**
 * 키움 OAuth 접근토큰을 반환합니다. (계좌별 메모리 캐시)
 *
 * @param {KiwoomAccountType} accountType
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   now?: Date,
 * }} [options]
 * @returns {Promise<KiwoomTokenCache>}
 */
export async function getKiwoomAccessToken(accountType, options = {}) {
  assertKiwoomAccountType(accountType)

  const env = options.env ?? process.env
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const now = options.now ?? new Date()

  const cached = tokenCaches[accountType]
  if (isCacheValid(cached, now)) {
    return cached
  }

  const { appkey, secretkey } = readCredentials(accountType, env)

  let response
  try {
    response = await fetchImpl(KIWOOM_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey,
        secretkey,
      }),
    })
  } catch {
    const error = new Error('Kiwoom authentication request failed')
    error.code = 'KIWOOM_NETWORK'
    throw error
  }

  if (!response.ok) {
    const error = new Error('Kiwoom authentication failed')
    error.code = 'KIWOOM_AUTH'
    error.status = response.status
    throw error
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    const error = new Error('Kiwoom authentication failed')
    error.code = 'KIWOOM_AUTH'
    throw error
  }

  const token = typeof payload?.token === 'string' ? payload.token.trim() : ''
  const tokenType =
    typeof payload?.token_type === 'string' && payload.token_type.trim()
      ? payload.token_type.trim()
      : 'Bearer'
  const expiresAt = parseKiwoomExpiresAt(payload?.expires_dt)

  if (!token || !expiresAt) {
    const error = new Error('Kiwoom authentication failed')
    error.code = 'KIWOOM_AUTH'
    throw error
  }

  const nextCache = {
    token,
    tokenType,
    expiresAt,
  }

  tokenCaches[accountType] = nextCache
  return nextCache
}

/**
 * 단일 계좌의 안전한 인증 상태
 *
 * @param {KiwoomAccountType} accountType
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   now?: Date,
 * }} [options]
 */
export async function getKiwoomAccountAuthStatus(accountType, options = {}) {
  try {
    const cached = await getKiwoomAccessToken(accountType, options)
    return {
      authenticated: true,
      expiresAt: cached.expiresAt.toISOString(),
    }
  } catch (error) {
    const message =
      error?.code === 'KIWOOM_CONFIG'
        ? 'Kiwoom credentials are not configured'
        : error?.code === 'KIWOOM_ACCOUNT_TYPE'
          ? 'Invalid Kiwoom account type'
          : 'Kiwoom authentication failed'

    return {
      authenticated: false,
      message,
    }
  }
}

/**
 * ISA / 일반 계좌 인증 상태 요약 (token / key 미포함)
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   now?: Date,
 * }} [options]
 */
export async function getKiwoomAuthStatus(options = {}) {
  const [isa, general] = await Promise.all([
    getKiwoomAccountAuthStatus('isa', options),
    getKiwoomAccountAuthStatus('general', options),
  ])

  return {
    ok: isa.authenticated || general.authenticated,
    accounts: {
      isa,
      general,
    },
  }
}

/**
 * 키움 숫자 문자열을 안전하게 파싱합니다.
 * 원본은 보존하고, 정규화 값은 number | null 입니다.
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseKiwoomNumber(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null
  }

  const cleaned = String(raw).trim().replace(/,/g, '')
  if (!cleaned || cleaned === '+' || cleaned === '-') return null

  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/**
 * @param {unknown} raw
 * @returns {{ raw: string, value: number | null }}
 */
export function toKiwoomNumericField(raw) {
  const rawText = raw == null ? '' : String(raw).trim()
  return {
    raw: rawText,
    value: parseKiwoomNumber(rawText),
  }
}

/**
 * 종목코드 정규화 (원본 유지, A 접두사 제거 value)
 *
 * @param {unknown} raw
 * @returns {{ raw: string, value: string }}
 */
export function normalizeKiwoomSymbol(raw) {
  const rawText = raw == null ? '' : String(raw).trim()
  return {
    raw: rawText,
    value: rawText.replace(/^A/i, ''),
  }
}

/**
 * kt00018 개별 잔고 행 → 안전한 holdings 항목
 *
 * @param {Record<string, unknown>} row
 */
export function normalizeKiwoomHolding(row) {
  const source = row && typeof row === 'object' ? row : {}

  return {
    code: normalizeKiwoomSymbol(source.stk_cd),
    name: source.stk_nm == null ? '' : String(source.stk_nm).trim(),
    quantity: toKiwoomNumericField(source.rmnd_qty),
    avgBuyPrice: toKiwoomNumericField(source.pur_pric),
    buyAmount: toKiwoomNumericField(source.pur_amt),
    currentPrice: toKiwoomNumericField(source.cur_prc),
    evalAmount: toKiwoomNumericField(source.evlt_amt),
    profitLoss: toKiwoomNumericField(source.evltv_prft),
    profitRate: toKiwoomNumericField(source.prft_rt),
  }
}

/**
 * kt00018 계좌 요약의 출금가능금액 (공식 필드, 임의 계산 없음)
 * 후보: paym_alowa / pymn_alow_amt
 *
 * @param {unknown} payload
 * @returns {{ raw: string, value: number | null } | null}
 */
export function extractKiwoomWithdrawableAmount(payload) {
  if (!payload || typeof payload !== 'object') return null

  const rawCandidates = [
    payload.paym_alowa,
    payload.pymn_alow_amt,
  ]

  for (const candidate of rawCandidates) {
    if (candidate == null || candidate === '') continue
    const field = toKiwoomNumericField(candidate)
    if (field.value == null && !String(field.raw).trim()) continue
    // 숫자 파싱 실패여도 raw가 있으면 필드 존재로 취급하되 value는 null
    return field
  }

  return null
}

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
 * 단일 계좌 평가잔고(kt00018) 조회 — 조회 전용
 *
 * @param {KiwoomAccountType} accountType
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   now?: Date,
 *   maxPages?: number,
 * }} [options]
 */
export async function getKiwoomBalance(accountType, options = {}) {
  assertKiwoomAccountType(accountType)

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const maxPages = options.maxPages ?? MAX_BALANCE_PAGES

  let auth
  try {
    auth = await getKiwoomAccessToken(accountType, options)
  } catch (error) {
    const message =
      error?.code === 'KIWOOM_CONFIG'
        ? 'Kiwoom credentials are not configured'
        : error?.code === 'KIWOOM_ACCOUNT_TYPE'
          ? 'Invalid Kiwoom account type'
          : 'Kiwoom authentication failed'

    return { ok: false, message, holdings: [], withdrawableAmount: null }
  }

  const holdings = []
  let contYn = 'N'
  let nextKey = ''
  /** @type {{ raw: string, value: number | null } | null} */
  let withdrawableAmount = null

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
          'api-id': KIWOOM_BALANCE_API_ID,
        },
        body: JSON.stringify(KT00018_BODY),
      })
    } catch {
      return {
        ok: false,
        message: 'Kiwoom balance request failed',
        holdings: [],
        withdrawableAmount: null,
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        message: 'Kiwoom balance inquiry failed',
        holdings: [],
        withdrawableAmount: null,
      }
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      return {
        ok: false,
        message: 'Kiwoom balance inquiry failed',
        holdings: [],
        withdrawableAmount: null,
      }
    }

    if (!isKiwoomReturnSuccess(payload)) {
      return {
        ok: false,
        message: 'Kiwoom balance inquiry failed',
        holdings: [],
        withdrawableAmount: null,
      }
    }

    if (withdrawableAmount == null) {
      withdrawableAmount = extractKiwoomWithdrawableAmount(payload)
    }

    const rows = Array.isArray(payload?.acnt_evlt_remn_indv_tot)
      ? payload.acnt_evlt_remn_indv_tot
      : []

    for (const row of rows) {
      holdings.push(normalizeKiwoomHolding(row))
    }

    const responseContYn = String(
      readResponseHeader(response.headers, 'cont-yn'),
    ).trim()
    const responseNextKey = String(
      readResponseHeader(response.headers, 'next-key'),
    ).trim()

    if (responseContYn !== 'Y' || !responseNextKey) {
      return { ok: true, holdings, withdrawableAmount }
    }

    contYn = 'Y'
    nextKey = responseNextKey
  }

  return {
    ok: false,
    message: 'Kiwoom balance inquiry pagination limit exceeded',
    holdings: [],
    withdrawableAmount: null,
  }
}

/**
 * ISA / 일반 계좌 잔고 요약 (token / key / 계좌번호 미포함)
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   now?: Date,
 *   maxPages?: number,
 * }} [options]
 */
export async function getKiwoomBalances(options = {}) {
  const [isa, general] = await Promise.all([
    getKiwoomBalance('isa', options),
    getKiwoomBalance('general', options),
  ])

  return {
    ok: isa.ok || general.ok,
    accounts: {
      isa,
      general,
    },
  }
}

const KIWOOM_STKINFO_URL = 'https://api.kiwoom.com/api/dostk/stkinfo'
const KIWOOM_STOCK_LIST_API_ID = 'ka10099'

/** 코스피 / 코스닥 / ETF */
const STOCK_LIST_MARKETS = Object.freeze(['0', '10', '8'])

const STOCK_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_STOCK_LIST_PAGES = 30
const DEFAULT_STOCK_SEARCH_LIMIT = 10

/** @type {{ items: Array<{ symbol: string, name: string }>, fetchedAt: number } | null} */
let stockListCache = null

/**
 * 테스트용 종목 리스트 캐시 초기화
 */
export function clearKiwoomStockListCache() {
  stockListCache = null
}

/**
 * ka10099 개별 종목 → { symbol, name }
 *
 * @param {Record<string, unknown>} row
 * @returns {{ symbol: string, name: string } | null}
 */
export function normalizeKiwoomStockItem(row) {
  const source = row && typeof row === 'object' ? row : {}
  const rawCode = String(source.code ?? source.stk_cd ?? '')
    .trim()
    .replace(/^A/i, '')
  const name = String(source.name ?? source.stk_nm ?? '').trim()

  if (!rawCode || !name) {
    return null
  }

  return {
    symbol: rawCode,
    name,
  }
}

/**
 * 캐시된 종목 목록에서 부분검색
 * 우선순위: 이름 완전일치 → 접두사 → 짧은 이름 → 코드 일치
 *
 * @param {Array<{ symbol: string, name: string }>} items
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Array<{ symbol: string, name: string }>}
 */
export function filterKiwoomStockList(items, query, limit = DEFAULT_STOCK_SEARCH_LIMIT) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q || !Array.isArray(items)) {
    return []
  }

  const max = Math.max(1, Math.min(Number(limit) || DEFAULT_STOCK_SEARCH_LIMIT, 50))
  const scored = []

  for (const item of items) {
    const name = String(item?.name ?? '')
    const symbol = String(item?.symbol ?? '')
    const nameLower = name.toLowerCase()
    const symbolLower = symbol.toLowerCase()

    if (!nameLower.includes(q) && !symbolLower.includes(q)) {
      continue
    }

    let score = 400
    if (nameLower === q || symbolLower === q) {
      score = 0
    } else if (nameLower.startsWith(q) || symbolLower.startsWith(q)) {
      score = 100
    } else if (nameLower.includes(q)) {
      score = 200
    } else {
      score = 300
    }

    // 짧은 종목명(파생/레버리지보다 본주)을 앞으로
    score += Math.min(name.length, 80)

    scored.push({
      score,
      symbol: item.symbol,
      name: item.name,
    })
  }

  scored.sort((a, b) => a.score - b.score || a.symbol.localeCompare(b.symbol))

  return scored.slice(0, max).map(({ symbol, name }) => ({ symbol, name }))
}

async function resolveTokenForStockList(options = {}) {
  try {
    return await getKiwoomAccessToken('general', options)
  } catch {
    return getKiwoomAccessToken('isa', options)
  }
}

/**
 * 단일 시장(mrkt_tp) 종목 리스트 조회 + 연속조회
 */
async function fetchStockListForMarket(mrktTp, auth, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const maxPages = options.maxPages ?? MAX_STOCK_LIST_PAGES
  const items = []
  let contYn = 'N'
  let nextKey = ''

  for (let page = 0; page < maxPages; page += 1) {
    let response
    try {
      response = await fetchImpl(KIWOOM_STKINFO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          authorization: `Bearer ${auth.token}`,
          'cont-yn': contYn,
          'next-key': nextKey,
          'api-id': KIWOOM_STOCK_LIST_API_ID,
        },
        body: JSON.stringify({ mrkt_tp: mrktTp }),
      })
    } catch {
      const error = new Error('Kiwoom stock list request failed')
      error.code = 'KIWOOM_NETWORK'
      throw error
    }

    if (!response.ok) {
      const error = new Error('Kiwoom stock list inquiry failed')
      error.code = 'KIWOOM_STOCK_LIST'
      error.status = response.status
      throw error
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      const error = new Error('Kiwoom stock list inquiry failed')
      error.code = 'KIWOOM_STOCK_LIST'
      throw error
    }

    if (!isKiwoomReturnSuccess(payload)) {
      const error = new Error('Kiwoom stock list inquiry failed')
      error.code = 'KIWOOM_STOCK_LIST'
      throw error
    }

    const rows = Array.isArray(payload?.list) ? payload.list : []
    for (const row of rows) {
      const normalized = normalizeKiwoomStockItem(row)
      if (normalized) {
        items.push(normalized)
      }
    }

    const responseContYn = String(
      readResponseHeader(response.headers, 'cont-yn'),
    ).trim()
    const responseNextKey = String(
      readResponseHeader(response.headers, 'next-key'),
    ).trim()

    if (responseContYn !== 'Y' || !responseNextKey) {
      return items
    }

    contYn = 'Y'
    nextKey = responseNextKey
  }

  const error = new Error('Kiwoom stock list pagination limit exceeded')
  error.code = 'KIWOOM_STOCK_LIST'
  throw error
}

/**
 * 종목 리스트를 서버 메모리에 캐시합니다.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   now?: Date,
 *   force?: boolean,
 * }} [options]
 * @returns {Promise<Array<{ symbol: string, name: string }>>}
 */
export async function ensureKiwoomStockList(options = {}) {
  const now = options.now ?? new Date()
  if (
    !options.force &&
    stockListCache?.items?.length &&
    now.getTime() - stockListCache.fetchedAt < STOCK_LIST_CACHE_TTL_MS
  ) {
    return stockListCache.items
  }

  const auth = await resolveTokenForStockList(options)
  const bySymbol = new Map()

  for (const mrktTp of STOCK_LIST_MARKETS) {
    const marketItems = await fetchStockListForMarket(mrktTp, auth, options)
    for (const item of marketItems) {
      if (!bySymbol.has(item.symbol)) {
        bySymbol.set(item.symbol, item)
      }
    }
  }

  const items = Array.from(bySymbol.values())
  stockListCache = {
    items,
    fetchedAt: now.getTime(),
  }

  return items
}

/**
 * 종목 검색 (서버 캐시 기반). credential 미포함.
 *
 * @param {string} query
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   now?: Date,
 *   limit?: number,
 *   force?: boolean,
 * }} [options]
 * @returns {Promise<Array<{ symbol: string, name: string }>>}
 */
export async function searchKiwoomStocks(query, options = {}) {
  const q = String(query ?? '').trim()
  if (q.length < 1) {
    return []
  }

  const items = await ensureKiwoomStockList(options)
  return filterKiwoomStockList(items, q, options.limit ?? DEFAULT_STOCK_SEARCH_LIMIT)
}
