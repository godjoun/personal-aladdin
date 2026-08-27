/**
 * kiwoomStockInfo.js — 국내주식 종목정보(ka10001) 조회 전용
 */

import {
  getKiwoomAccessToken,
  parseKiwoomNumber,
  toKiwoomNumericField,
  normalizeKiwoomSymbol,
} from './kiwoomClient.js'

const KIWOOM_STKINFO_URL = 'https://api.kiwoom.com/api/dostk/stkinfo'
const KIWOOM_STOCK_INFO_API_ID = 'ka10001'

/**
 * @param {unknown} raw
 */
function pickFirst(source, keys) {
  for (const key of keys) {
    if (source[key] != null && String(source[key]).trim() !== '') {
      return source[key]
    }
  }
  return null
}

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
function numOrNull(raw) {
  const field = toKiwoomNumericField(raw)
  return field.value
}

/**
 * ETF 추정 (이름·시장구분 기반, 확실할 때만)
 * @param {Record<string, unknown>} source
 * @param {string} name
 */
export function detectIsEtf(source, name) {
  const text = `${name} ${source.stk_kind ?? ''} ${source.marketName ?? ''} ${source.market_nm ?? ''}`
  if (/ETF|ETN|인버스|레버리지|상장지수/i.test(text)) return true
  if (/투자신탁/i.test(text)) return true
  // 국내 주요 ETF 브랜드 (이름만으로 구분)
  if (
    /\b(TIGER|KODEX|ACE|SOL|RISE|KOSEF|HANARO|TIMEFOLIO|ARIRANG|KBSTAR|PLUS)\b/i.test(
      text,
    )
  ) {
    return true
  }
  return false
}

/**
 * ka10001 응답 → 브리핑용 정규화 (없는 값은 null, 0 강제 없음)
 *
 * @param {unknown} payload
 */
export function normalizeKiwoomStockInfo(payload) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const code = normalizeKiwoomSymbol(pickFirst(source, ['stk_cd', 'code']))
  const name = String(pickFirst(source, ['stk_nm', 'name']) || '').trim()
  const isEtf = detectIsEtf(source, name)

  const currentPrice = numOrNull(
    pickFirst(source, ['cur_prc', 'close_pric', 'stck_prpr']),
  )
  const changeRate = numOrNull(pickFirst(source, ['flu_rt', 'prdy_ctrt', 'chg_rt']))

  // 단위 (ka10001 / OPT10001 계열):
  // - cur_prc, eps, bps, 고저가: 원
  // - mac(시가총액), sale_amt(매출액), bus_pro(영업이익), cup_nga(당기순이익): 억원
  //   (실응답 예: 삼성전자 mac≈4,078,631 → 약 408조; 성일하이텍 mac≈4,749 → 4,749억)
  const info = {
    symbol: code.value || null,
    name: name || null,
    isEtf,
    currentPrice,
    changeRate,
    marketCap: numOrNull(pickFirst(source, ['mac', 'mac_amt', 'hts_avls'])),
    yearHigh: numOrNull(
      pickFirst(source, ['year_high_pric', 'yr_hgpr', 'stck_dryy_hgpr']),
    ),
    yearLow: numOrNull(
      pickFirst(source, ['year_low_pric', 'yr_lwpr', 'stck_dryy_lwpr']),
    ),
    high250: numOrNull(
      pickFirst(source, ['high_250', 'd250_hgpr', 'w52_hgpr', 'high_52']),
    ),
    low250: numOrNull(
      pickFirst(source, ['low_250', 'd250_lwpr', 'w52_lwpr', 'low_52']),
    ),
    per: isEtf ? null : numOrNull(pickFirst(source, ['per', 'per_rt'])),
    pbr: isEtf ? null : numOrNull(pickFirst(source, ['pbr', 'pbr_rt'])),
    roe: isEtf ? null : numOrNull(pickFirst(source, ['roe', 'roe_rt'])),
    eps: isEtf ? null : numOrNull(pickFirst(source, ['eps'])),
    bps: isEtf ? null : numOrNull(pickFirst(source, ['bps'])),
    revenue: isEtf ? null : numOrNull(pickFirst(source, ['sale_amt', 'sales', 'revenue'])),
    operatingProfit: isEtf
      ? null
      : numOrNull(pickFirst(source, ['bus_pro', 'op_profit', 'operating_profit'])),
    netIncome: isEtf
      ? null
      : numOrNull(pickFirst(source, ['cup_nga', 'net_income', 'net_prft'])),
    foreignExhaustionRate: numOrNull(
      pickFirst(source, ['sojin_rt', 'frgn_exh_rt', 'foreign_exhaust_rate']),
    ),
    /** UI: marketCap/revenue/operatingProfit/netIncome → formatEokWon */
    financialScaleUnit: 'eok',
  }

  return info
}

function isKiwoomReturnSuccess(payload) {
  if (payload == null || typeof payload !== 'object') return false
  if (!('return_code' in payload)) return true
  const code = payload.return_code
  return code === 0 || code === '0'
}

/**
 * @param {string} symbol
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   accountType?: 'isa' | 'general',
 * }} [options]
 */
export async function getKiwoomStockInfo(symbol, options = {}) {
  const rawSymbol = String(symbol || '')
    .trim()
    .replace(/^A/i, '')
  if (!/^\d{6}$/.test(rawSymbol)) {
    return { ok: false, message: 'Invalid symbol', info: null }
  }

  const accountType = options.accountType || 'general'
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  let auth
  try {
    auth = await getKiwoomAccessToken(accountType, options)
  } catch {
    // ISA만 설정된 경우 대비
    try {
      auth = await getKiwoomAccessToken('isa', options)
    } catch {
      return { ok: false, message: 'Kiwoom authentication failed', info: null }
    }
  }

  let response
  try {
    response = await fetchImpl(KIWOOM_STKINFO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${auth.token}`,
        'api-id': KIWOOM_STOCK_INFO_API_ID,
        'cont-yn': 'N',
        'next-key': '',
      },
      body: JSON.stringify({ stk_cd: rawSymbol }),
    })
  } catch {
    return { ok: false, message: 'Kiwoom stock info request failed', info: null }
  }

  if (!response.ok) {
    return { ok: false, message: 'Kiwoom stock info inquiry failed', info: null }
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    return { ok: false, message: 'Kiwoom stock info inquiry failed', info: null }
  }

  if (!isKiwoomReturnSuccess(payload)) {
    return { ok: false, message: 'Kiwoom stock info inquiry failed', info: null }
  }

  const info = normalizeKiwoomStockInfo(payload)
  if (!info.symbol) info.symbol = rawSymbol

  return { ok: true, info }
}

export { parseKiwoomNumber }
