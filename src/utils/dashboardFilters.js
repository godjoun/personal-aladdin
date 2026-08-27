/**
 * dashboardFilters.js — Dashboard 계좌/검색 필터
 */

/**
 * @param {Array<object>} rows
 * @param {'all'|'isa'|'general'} accountFilter
 */
export function filterHoldingsByAccount(rows, accountFilter) {
  const list = Array.isArray(rows) ? rows : []
  if (accountFilter === 'isa') {
    return list.filter((row) => row.accountType === 'isa')
  }
  if (accountFilter === 'general') {
    return list.filter((row) => row.accountType === 'general')
  }
  return list
}

/**
 * @param {Array<object>} events
 * @param {'all'|'isa'|'general'} accountFilter
 */
export function filterDividendsByAccount(events, accountFilter) {
  const list = Array.isArray(events) ? events : []
  if (accountFilter === 'all') return list
  return list.filter((event) => event?.accountType === accountFilter)
}

/**
 * @param {Array<object>} rows
 */
export function pickTopMoverByAbsProfitLoss(rows) {
  let best = null
  let bestAbs = -1
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.profitLoss == null || !Number.isFinite(Number(row.profitLoss))) {
      continue
    }
    const abs = Math.abs(Number(row.profitLoss))
    if (abs > bestAbs) {
      bestAbs = abs
      best = row
    }
  }
  return best
}

/**
 * KIWOOM 자동 수집 이벤트는 읽기 전용
 */
export function isKiwoomDividendEvent(event) {
  return event?.source === 'KIWOOM'
}

/**
 * 수동 이벤트만 수정/삭제 가능
 */
export function canEditDividendEvent(event) {
  return Boolean(event) && !isKiwoomDividendEvent(event)
}
