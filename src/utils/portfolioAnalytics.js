/**
 * portfolioAnalytics.js — 스냅샷 기반 포트폴리오 분석 (Phase 1)
 * 블랙록 ALADDIN 스타일 히스토리컬 분석 축소판
 */

const TRADING_DAYS_PER_YEAR = 252
const DEFAULT_RISK_FREE_RATE = 3.5

function sortByDateAsc(snapshots) {
  return [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
}

function dateKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * @param {string} dateKey - YYYYMMDD
 * @param {number} days
 */
export function subtractDaysFromDateKey(dateKey, days) {
  const y = Number(dateKey.slice(0, 4))
  const m = Number(dateKey.slice(4, 6)) - 1
  const d = Number(dateKey.slice(6, 8))
  const date = new Date(y, m, d)
  date.setDate(date.getDate() - days)
  return dateKeyFromDate(date)
}

/**
 * 최근 N일 스냅샷 (날짜 기준)
 *
 * @param {Array<Object>} snapshots
 * @param {number} [days=30]
 */
export function getSnapshotsInWindow(snapshots, days = 30) {
  const sorted = sortByDateAsc(snapshots)

  if (sorted.length === 0) {
    return []
  }

  if (days <= 0) {
    return sorted
  }

  const lastDate = sorted[sorted.length - 1].date
  const cutoff = subtractDaysFromDateKey(lastDate, days)
  return sorted.filter((snapshot) => snapshot.date >= cutoff)
}

/**
 * 자산군 비중 시계열 (리포트 차트용)
 *
 * @returns {{ dates: string[], series: Array<{ assetClass: string, weights: number[] }>, snapshotCount: number }}
 */
export function buildAllocationTimeSeries(snapshots, days = 30) {
  const window = getSnapshotsInWindow(snapshots, days)
  const assetClasses = new Set()

  for (const snapshot of window) {
    for (const group of snapshot.allocation ?? []) {
      assetClasses.add(group.assetClass)
    }
  }

  const classes = [...assetClasses]
  const dates = window.map((snapshot) => snapshot.date)
  const series = classes.map((assetClass) => ({
    assetClass,
    weights: window.map((snapshot) => {
      const group = snapshot.allocation?.find((item) => item.assetClass === assetClass)
      return group?.weight ?? 0
    }),
  }))

  return {
    dates,
    series,
    snapshotCount: window.length,
  }
}

/**
 * 일별 수익률 배열
 */
export function calculateDailyReturns(snapshots) {
  const sorted = sortByDateAsc(snapshots)
  const returns = []

  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1].totalValuedAmount
    const curr = sorted[index].totalValuedAmount

    if (prev > 0) {
      returns.push({
        date: sorted[index].date,
        dailyReturn: (curr - prev) / prev,
      })
    }
  }

  return returns
}

/**
 * 롤링 변동성 (연율화 %)
 */
export function calculateRollingVolatility(snapshots, windowDays = 30) {
  const window = getSnapshotsInWindow(snapshots, windowDays)
  const returns = calculateDailyReturns(window)

  if (returns.length < 2) {
    return null
  }

  const values = returns.map((item) => item.dailyReturn)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  const dailyVol = Math.sqrt(variance)

  return {
    dailyVolPercent: dailyVol * 100,
    annualizedVolPercent: dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100,
    sampleDays: values.length,
  }
}

/**
 * 샤프 비율 (단순 연율화)
 */
export function calculateSharpeRatio(
  snapshots,
  windowDays = 30,
  annualRiskFreeRate = DEFAULT_RISK_FREE_RATE,
) {
  const window = getSnapshotsInWindow(snapshots, windowDays)

  if (window.length < 3) {
    return null
  }

  const first = window[0].totalValuedAmount
  const last = window[window.length - 1].totalValuedAmount

  if (first <= 0) {
    return null
  }

  const periodReturn = (last - first) / first
  const tradingDays = window.length - 1
  const annualizedReturnPercent = periodReturn * (TRADING_DAYS_PER_YEAR / tradingDays) * 100
  const vol = calculateRollingVolatility(snapshots, windowDays)

  if (!vol || vol.annualizedVolPercent === 0) {
    return null
  }

  return {
    sharpeRatio:
      (annualizedReturnPercent - annualRiskFreeRate) / vol.annualizedVolPercent,
    annualizedReturnPercent,
    annualizedVolPercent: vol.annualizedVolPercent,
    riskFreeRate: annualRiskFreeRate,
    windowDays,
  }
}

/**
 * 현재 보유 종목 평가손익 기여도
 */
export function calculateProfitContributions(assetRows) {
  const valuedRows = assetRows.filter(
    (row) => row.hasPrice && row.profitLoss !== null && row.holdingValue !== null,
  )

  const totalProfit = valuedRows.reduce((sum, row) => sum + row.profitLoss, 0)
  const totalValue = valuedRows.reduce((sum, row) => sum + row.holdingValue, 0)

  return valuedRows
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      assetType: row.assetType,
      profitLoss: row.profitLoss,
      holdingValue: row.holdingValue,
      profitRate: row.profitRate,
      portfolioWeight: totalValue > 0 ? (row.holdingValue / totalValue) * 100 : 0,
      contributionPercent:
        totalProfit !== 0 ? (row.profitLoss / totalProfit) * 100 : 0,
    }))
    .sort((a, b) => Math.abs(b.profitLoss) - Math.abs(a.profitLoss))
}

/**
 * 스냅샷 기간 내 평가액 변화 기여 (종목별)
 */
export function calculatePeriodValueContributions(snapshots, days = 30) {
  const window = getSnapshotsInWindow(snapshots, days)

  if (window.length < 2) {
    return { items: [], totalChange: 0, periodLabel: null }
  }

  const first = window[0]
  const last = window[window.length - 1]
  const firstMap = new Map(
    (first.positions ?? []).map((position) => [position.symbol, position]),
  )

  const items = []
  const seen = new Set()

  for (const position of last.positions ?? []) {
    seen.add(position.symbol)
    const prev = firstMap.get(position.symbol)
    const prevValue = prev?.holdingValue ?? 0
    const valueChange = position.holdingValue - prevValue

    items.push({
      symbol: position.symbol,
      name: position.name,
      assetType: position.assetType,
      valueChange,
      startValue: prevValue,
      endValue: position.holdingValue,
      isNew: !prev,
    })
  }

  for (const [symbol, position] of firstMap) {
    if (seen.has(symbol)) continue
    items.push({
      symbol,
      name: position.name,
      assetType: position.assetType,
      valueChange: -position.holdingValue,
      startValue: position.holdingValue,
      endValue: 0,
      isNew: false,
      exited: true,
    })
  }

  const totalChange = last.totalValuedAmount - first.totalValuedAmount
  const sorted = items
    .map((item) => ({
      ...item,
      contributionPercent:
        totalChange !== 0 ? (item.valueChange / totalChange) * 100 : 0,
    }))
    .sort((a, b) => Math.abs(b.valueChange) - Math.abs(a.valueChange))

  return {
    items: sorted,
    totalChange,
    periodLabel: `${first.date} ~ ${last.date}`,
  }
}
