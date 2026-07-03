/**
 * hostAnalytics.js — 호스트 전용 집계·벤치마크
 * 업로드된 스테이션 데이터만 사용 (2층 인사이트)
 */

function getLatestSnapshot(payload) {
  const snapshots = payload?.snapshots

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return null
  }

  return [...snapshots].sort((a, b) => b.date.localeCompare(a.date))[0]
}

/**
 * @param {Array<Object>} stations - storage 에서 읽은 스테이션 전체
 */
export function buildHostReport(stations) {
  const synced = stations.filter((station) => station.latestPayload && station.lastSyncAt)

  const stationSummaries = synced.map((station) => {
    const snapshot = getLatestSnapshot(station.latestPayload)

    return {
      stationId: station.id,
      name: station.name,
      totalValuedAmount: snapshot?.totalValuedAmount ?? 0,
      allocation: snapshot?.allocation ?? [],
      totalReturnRate: snapshot?.totalReturnRate ?? null,
      lastSyncAt: station.lastSyncAt,
      reconciliationStatus: station.reconciliation?.status ?? null,
      consentAt: station.latestPayload?.consent?.agreedAt ?? null,
    }
  })

  const activeStations = stationSummaries.filter((s) => s.totalValuedAmount > 0)
  const totalNetworkAum = activeStations.reduce(
    (sum, station) => sum + station.totalValuedAmount,
    0,
  )

  const classMap = new Map()

  for (const station of activeStations) {
    for (const group of station.allocation) {
      const existing = classMap.get(group.assetClass) || {
        totalValue: 0,
        contributingStations: 0,
      }

      existing.totalValue += group.totalValue
      existing.contributingStations += 1
      classMap.set(group.assetClass, existing)
    }
  }

  const networkAllocation = Array.from(classMap.entries())
    .map(([assetClass, data]) => ({
      assetClass,
      totalValue: data.totalValue,
      weight: totalNetworkAum > 0 ? (data.totalValue / totalNetworkAum) * 100 : 0,
      contributingStations: data.contributingStations,
    }))
    .sort((a, b) => b.weight - a.weight)

  const equityWeights = activeStations.map((station) => {
    const equity = station.allocation.find((group) => group.assetClass === '주식')
    return equity?.weight ?? 0
  })

  const avgEquityWeight =
    equityWeights.length > 0
      ? equityWeights.reduce((sum, weight) => sum + weight, 0) / equityWeights.length
      : 0

  return {
    generatedAt: new Date().toISOString(),
    stationCount: stations.length,
    syncedStationCount: synced.length,
    activeStationCount: activeStations.length,
    totalNetworkAum,
    networkAllocation,
    benchmarks: {
      avgEquityWeight,
      avgValuedAmount:
        activeStations.length > 0 ? totalNetworkAum / activeStations.length : 0,
    },
    stations: stationSummaries
      .map((station) => ({
        name: station.name,
        totalValuedAmount: station.totalValuedAmount,
        equityWeight:
          station.allocation.find((group) => group.assetClass === '주식')?.weight ?? 0,
        dominantClass: station.allocation[0]?.assetClass ?? '—',
        totalReturnRate: station.totalReturnRate,
        reconciliationStatus: station.reconciliationStatus,
        lastSyncAt: station.lastSyncAt,
        consentAt: station.consentAt,
      }))
      .sort((a, b) => b.totalValuedAmount - a.totalValuedAmount),
    reconciliationSummary: {
      ok: synced.filter((s) => s.reconciliation?.status === 'ok').length,
      reviewNeeded: synced.filter((s) => s.reconciliation?.status === 'review_needed')
        .length,
      noData: synced.filter((s) => !s.reconciliation?.status).length,
    },
  }
}
