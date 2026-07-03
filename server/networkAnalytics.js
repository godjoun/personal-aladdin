/**
 * networkAnalytics.js — 네트워크 집계 시계열 (Phase 2)
 * 업로드된 스테이션 스냅샷을 날짜별로 합산합니다.
 */

function sortByDateAsc(items) {
  return [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

function dateKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export function subtractDaysFromDateKey(dateKey, days) {
  const y = Number(String(dateKey).slice(0, 4))
  const m = Number(String(dateKey).slice(4, 6)) - 1
  const d = Number(String(dateKey).slice(6, 8))
  const date = new Date(y, m, d)
  date.setDate(date.getDate() - days)
  return dateKeyFromDate(date)
}

function getSyncedStations(stations) {
  return stations.filter(
    (station) =>
      station.latestPayload &&
      station.lastSyncAt &&
      station.latestPayload.consent?.hostMonitoring,
  )
}

function getSnapshotByDate(payload, dateKey) {
  const snapshots = payload?.snapshots
  if (!Array.isArray(snapshots)) return null
  return snapshots.find((snapshot) => snapshot.date === dateKey) ?? null
}

function aggregateNetworkForDate(stations, dateKey) {
  const classMap = new Map()
  let totalNetworkAum = 0
  let activeStationCount = 0

  for (const station of stations) {
    const snapshot = getSnapshotByDate(station.latestPayload, dateKey)
    const valued = snapshot?.totalValuedAmount ?? 0

    if (!snapshot || valued <= 0) {
      continue
    }

    activeStationCount += 1
    totalNetworkAum += valued

    for (const group of snapshot.allocation ?? []) {
      const existing = classMap.get(group.assetClass) || { totalValue: 0 }
      existing.totalValue += group.totalValue ?? 0
      classMap.set(group.assetClass, existing)
    }
  }

  if (activeStationCount === 0 || totalNetworkAum <= 0) {
    return null
  }

  const networkAllocation = Array.from(classMap.entries())
    .map(([assetClass, data]) => ({
      assetClass,
      totalValue: data.totalValue,
      weight: (data.totalValue / totalNetworkAum) * 100,
      contributingStations: activeStationCount,
    }))
    .sort((a, b) => b.weight - a.weight)

  const equity = networkAllocation.find((row) => row.assetClass === '주식')

  return {
    date: dateKey,
    activeStationCount,
    totalNetworkAum,
    networkAllocation,
    avgEquityWeight: equity?.weight ?? 0,
  }
}

function collectDatesInWindow(stations, days) {
  const dateSet = new Set()

  for (const station of stations) {
    for (const snapshot of station.latestPayload?.snapshots ?? []) {
      if (snapshot?.date) {
        dateSet.add(snapshot.date)
      }
    }
  }

  const sorted = [...dateSet].sort((a, b) => a.localeCompare(b))

  if (sorted.length === 0 || days <= 0) {
    return sorted
  }

  const lastDate = sorted[sorted.length - 1]
  const cutoff = subtractDaysFromDateKey(lastDate, days)
  return sorted.filter((date) => date >= cutoff)
}

/**
 * 날짜별 네트워크 집계 시계열
 */
export function buildNetworkTimeSeries(stations, days = 30) {
  const synced = getSyncedStations(stations)
  const dates = collectDatesInWindow(synced, days)
  const points = []

  for (const date of dates) {
    const mark = aggregateNetworkForDate(synced, date)
    if (mark) {
      points.push(mark)
    }
  }

  return {
    windowDays: days,
    pointCount: points.length,
    points,
  }
}

/**
 * N일 평균 네트워크 비중
 */
export function calculateAverageNetworkAllocation(stations, days = 30) {
  const { points } = buildNetworkTimeSeries(stations, days)

  if (points.length === 0) {
    return null
  }

  const classTotals = new Map()
  let totalAumSum = 0

  for (const point of points) {
    totalAumSum += point.totalNetworkAum

    for (const group of point.networkAllocation) {
      const existing = classTotals.get(group.assetClass) || {
        weightSum: 0,
        count: 0,
      }
      existing.weightSum += group.weight
      existing.count += 1
      classTotals.set(group.assetClass, existing)
    }
  }

  const networkAllocation = Array.from(classTotals.entries())
    .map(([assetClass, data]) => ({
      assetClass,
      weight: data.count > 0 ? data.weightSum / data.count : 0,
      totalValue: null,
      contributingStations: points[points.length - 1]?.activeStationCount ?? 0,
    }))
    .sort((a, b) => b.weight - a.weight)

  return {
    windowDays: days,
    sampleDays: points.length,
    periodLabel:
      points.length > 0
        ? `${points[0].date} ~ ${points[points.length - 1].date}`
        : null,
    avgNetworkAum: totalAumSum / points.length,
    networkAllocation,
  }
}

/**
 * 차트용 자산군 비중 시계열
 */
export function buildNetworkAllocationTimeSeries(points) {
  const assetClasses = new Set()

  for (const point of points) {
    for (const group of point.networkAllocation ?? []) {
      assetClasses.add(group.assetClass)
    }
  }

  const classes = [...assetClasses]
  const dates = points.map((point) => point.date)
  const series = classes.map((assetClass) => ({
    assetClass,
    weights: points.map((point) => {
      const group = point.networkAllocation?.find((row) => row.assetClass === assetClass)
      return group?.weight ?? 0
    }),
  }))

  return { dates, series, snapshotCount: points.length }
}

/**
 * @param {'latest' | 'average'} targetMode
 */
export function resolveNetworkAllocation(stations, { targetMode = 'latest', windowDays = 30 } = {}) {
  const report = buildNetworkTimeSeries(stations, windowDays)
  const latestPoint = report.points[report.points.length - 1] ?? null

  if (targetMode === 'average') {
    const average = calculateAverageNetworkAllocation(stations, windowDays)

    if (average?.networkAllocation?.length) {
      return {
        targetMode: 'average',
        windowDays,
        sampleDays: average.sampleDays,
        periodLabel: average.periodLabel,
        networkAllocation: average.networkAllocation,
        totalNetworkAum: latestPoint?.totalNetworkAum ?? 0,
        activeStationCount: latestPoint?.activeStationCount ?? 0,
      }
    }
  }

  return {
    targetMode: 'latest',
    windowDays,
    sampleDays: latestPoint ? 1 : 0,
    periodLabel: latestPoint?.date ?? null,
    networkAllocation: latestPoint?.networkAllocation ?? [],
    totalNetworkAum: latestPoint?.totalNetworkAum ?? 0,
    activeStationCount: latestPoint?.activeStationCount ?? 0,
  }
}

export function buildNetworkIntelligence(stations, days = 30) {
  const synced = getSyncedStations(stations)
  const timeSeries = buildNetworkTimeSeries(stations, days)
  const allocationSeries = buildNetworkAllocationTimeSeries(timeSeries.points)
  const average = calculateAverageNetworkAllocation(stations, days)
  const latest = timeSeries.points[timeSeries.points.length - 1] ?? null

  return {
    windowDays: days,
    syncedStationCount: synced.length,
    pointCount: timeSeries.pointCount,
    periodLabel:
      timeSeries.points.length > 0
        ? `${timeSeries.points[0].date} ~ ${timeSeries.points[timeSeries.points.length - 1].date}`
        : null,
    latest,
    average,
    timeSeries: timeSeries.points,
    allocationSeries,
    aumSeries: timeSeries.points.map((point) => ({
      date: point.date,
      totalNetworkAum: point.totalNetworkAum,
      activeStationCount: point.activeStationCount,
    })),
  }
}
