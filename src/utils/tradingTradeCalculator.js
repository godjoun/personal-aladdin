/**
 * tradingTradeCalculator.js — TRADING 거래 손익·요약 계산
 */

/**
 * @param {{ entryPrice: unknown, exitPrice: unknown, investedAmount: unknown }} input
 * @returns {{ returnRate: number, profitLoss: number } | null}
 */
export function calculateTradeMetrics(input) {
  const entry = Number(input.entryPrice)
  const exit = Number(input.exitPrice)
  const invested = Number(input.investedAmount)

  if (!Number.isFinite(entry) || entry <= 0) return null
  if (!Number.isFinite(exit) || exit <= 0) return null
  if (!Number.isFinite(invested) || invested <= 0) return null

  const rate = ((exit - entry) / entry) * 100
  const profitLoss = invested * ((exit - entry) / entry)

  if (!Number.isFinite(rate) || !Number.isFinite(profitLoss)) {
    return null
  }

  return { returnRate: rate, profitLoss }
}

/**
 * @param {{ symbol?: string, entryPrice?: unknown, exitPrice?: unknown, investedAmount?: unknown }} input
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validateTradeInput(input) {
  /** @type {Record<string, string>} */
  const errors = {}

  const symbol = String(input.symbol ?? '').trim()
  if (!symbol) {
    errors.symbol = '코인을 입력해 주세요.'
  }

  const entry = Number(input.entryPrice)
  if (!Number.isFinite(entry) || entry <= 0) {
    errors.entryPrice = '진입 가격은 0보다 커야 합니다.'
  }

  const exit = Number(input.exitPrice)
  if (!Number.isFinite(exit) || exit <= 0) {
    errors.exitPrice = '청산 가격은 0보다 커야 합니다.'
  }

  const invested = Number(input.investedAmount)
  if (!Number.isFinite(invested) || invested <= 0) {
    errors.investedAmount = '투자 금액은 0보다 커야 합니다.'
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * @param {Date} date
 */
export function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * @param {string | Date} a
 * @param {string | Date} b
 */
export function isSameWeek(a, b) {
  const dateA = a instanceof Date ? a : new Date(a)
  const dateB = b instanceof Date ? b : new Date(b)
  if (Number.isNaN(dateA.getTime()) || Number.isNaN(dateB.getTime())) {
    return false
  }
  return startOfWeekMonday(dateA).getTime() === startOfWeekMonday(dateB).getTime()
}

/**
 * @param {string} iso
 */
export function formatTradeDateShort(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}.${day}`
}

/**
 * @param {string} iso
 */
export function formatTradeDateTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * @param {Array<{ profitLoss?: number, tradedAt?: string }>} trades
 */
export function calculateMaxLossStreak(trades) {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime(),
  )

  let max = 0
  let current = 0

  for (const trade of sorted) {
    const pnl = Number(trade.profitLoss)
    if (Number.isFinite(pnl) && pnl < 0) {
      current += 1
      max = Math.max(max, current)
    } else {
      current = 0
    }
  }

  return max
}

/**
 * @param {Array<{ returnRate?: number, profitLoss?: number, tradedAt?: string }>} trades
 * @param {Date} [now]
 */
export function buildTradingDeskSummary(trades, now = new Date()) {
  const list = Array.isArray(trades) ? trades : []
  if (list.length === 0) {
    return {
      totalTrades: 0,
      totalProfitLoss: 0,
      winRate: null,
      weekProfitLoss: 0,
    }
  }

  let wins = 0
  let weekProfitLoss = 0

  for (const trade of list) {
    const pnl = Number(trade.profitLoss)
    if (Number.isFinite(pnl) && pnl > 0) wins += 1
    if (Number.isFinite(pnl) && isSameWeek(trade.tradedAt, now)) {
      weekProfitLoss += pnl
    }
  }

  const totalProfitLoss = list.reduce((sum, trade) => {
    const pnl = Number(trade.profitLoss)
    return sum + (Number.isFinite(pnl) ? pnl : 0)
  }, 0)

  return {
    totalTrades: list.length,
    totalProfitLoss,
    winRate: (wins / list.length) * 100,
    weekProfitLoss,
  }
}

/**
 * @param {Array<{ returnRate?: number, profitLoss?: number }>} trades
 */
export function buildTradingPerformanceStats(trades) {
  const list = Array.isArray(trades) ? trades : []
  if (list.length === 0) {
    return {
      avgWinRate: null,
      avgLossRate: null,
      maxLossStreak: 0,
      winShare: null,
    }
  }

  const winRates = []
  const lossRates = []
  let wins = 0

  for (const trade of list) {
    const rate = Number(trade.returnRate)
    const pnl = Number(trade.profitLoss)
    if (!Number.isFinite(rate) || !Number.isFinite(pnl)) continue
    if (pnl > 0) {
      winRates.push(rate)
      wins += 1
    } else if (pnl < 0) {
      lossRates.push(rate)
    }
  }

  const avg = (values) =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length

  return {
    avgWinRate: avg(winRates),
    avgLossRate: avg(lossRates),
    maxLossStreak: calculateMaxLossStreak(list),
    winShare: list.length > 0 ? (wins / list.length) * 100 : null,
  }
}

/**
 * @param {Array<{ tradedAt?: string }>} trades
 * @param {number} [limit=5]
 */
export function getRecentTrades(trades, limit = 5) {
  const list = Array.isArray(trades) ? trades : []
  return [...list]
    .sort(
      (a, b) =>
        new Date(b.tradedAt).getTime() - new Date(a.tradedAt).getTime(),
    )
    .slice(0, limit)
}
