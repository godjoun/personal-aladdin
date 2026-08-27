/**
 * formatters.js — 화면 공통 포맷
 */

export function formatCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  const num = Number(value)
  if (!Number.isFinite(num)) {
    return '—'
  }

  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(num)
}

/**
 * ka10001 mac / sale_amt / bus_pro / cup_nga 는 억원 단위 정수.
 * 일반 원화(formatCurrency)로 표시하지 않는다.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function formatEokWon(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  const formatted = new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(num)
  return `${formatted}억`
}

export function formatPercent(rate) {
  if (rate === null || rate === undefined) return '—'
  const sign = rate > 0 ? '+' : ''
  return `${sign}${rate.toFixed(2)}%`
}

export function formatProfitLoss(amount) {
  if (amount === null || amount === undefined) return '—'
  const sign = amount > 0 ? '+' : ''
  return `${sign}${formatCurrency(amount)}`
}

export function getPnlClass(value) {
  if (value === null || value === undefined || value === 0) return ''
  return value > 0 ? 'dashboard__cell--profit' : 'dashboard__cell--loss'
}
