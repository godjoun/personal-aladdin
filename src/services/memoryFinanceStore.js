/**
 * memoryFinanceStore.js — 금융 데이터는 브라우저 메모리만 사용
 * localStorage 에는 영구 저장하지 않습니다.
 */

/** @type {Map<string, unknown>} */
const memory = new Map()

export const FINANCE_LS_KEYS = {
  assets: 'aladdin_assets',
  trades: 'aladdin_trades',
  dividends: 'aladdin_dividend_events',
  marketPrices: 'aladdin_market_prices',
  snapshots: 'aladdin_portfolio_snapshots',
}

export const FINANCE_LS_KEY_LIST = Object.values(FINANCE_LS_KEYS)

/**
 * @param {string} key
 * @param {unknown} fallback
 */
export function getMemory(key, fallback) {
  if (!memory.has(key)) return fallback
  return memory.get(key)
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function setMemory(key, value) {
  memory.set(key, value)
}

/**
 * 로그아웃/401 시 금융 메모리 전부 제거
 */
export function clearFinanceMemory() {
  for (const key of Object.keys(FINANCE_LS_KEYS)) {
    memory.delete(FINANCE_LS_KEYS[key])
  }
  // also clear by logical names used as memory keys
  memory.clear()
}

/**
 * legacy localStorage 배열 peek (쓰기 없음)
 * @param {string} lsKey
 * @returns {Array<object> | null} null = key 없음/파싱 실패가 아닌 미존재와 구분: 없으면 []
 */
export function peekLegacyLocalArray(lsKey) {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(lsKey)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

/**
 * @param {string} lsKey
 * @returns {boolean}
 */
export function hasLegacyLocalKey(lsKey) {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(lsKey) !== null
  } catch {
    return false
  }
}

/**
 * migration 성공 후에만 호출
 * @param {string[]} keys
 */
export function removeLegacyLocalKeys(keys) {
  if (typeof localStorage === 'undefined') return
  for (const key of keys) {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
}

/**
 * 현재 금융 LS 키가 남아 있는지 (테스트/진단)
 */
export function listRemainingFinanceLocalKeys() {
  if (typeof localStorage === 'undefined') return []
  return FINANCE_LS_KEY_LIST.filter((key) => {
    try {
      return localStorage.getItem(key) !== null
    } catch {
      return false
    }
  })
}
