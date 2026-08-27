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
