/**
 * snapshotAnalytics.js — 스냅샷 시계열 분석
 * 블랙록 ALADDIN 의 히스토리컬 리스크 분석 축소판
 */

/**
 * YYYYMMDD → YYYY-MM-DD
 */
export function formatSnapshotDate(dateKey) {
  if (!dateKey || dateKey.length !== 8) return dateKey
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`
}

/**
 * 날짜 오름차순 정렬
 */
function sortByDateAsc(snapshots) {
  return [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 최대 낙폭 (MDD) — 스냅샷 시계열 기준
 */
export function calculateMaxDrawdown(snapshots) {
  const sorted = sortByDateAsc(snapshots)

  if (sorted.length < 2) {
    return {
      mddPercent: 0,
      peakDate: sorted[0]?.date ?? null,
      troughDate: null,
    }
  }

  let peak = 0
  let peakDate = null
  let maxDrawdown = 0
  let troughDate = null

  for (const snapshot of sorted) {
    const value = snapshot.totalValuedAmount

    if (value > peak) {
      peak = value
      peakDate = snapshot.date
    }

    if (peak > 0) {
      const drawdown = ((value - peak) / peak) * 100

      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown
        troughDate = snapshot.date
      }
    }
  }

  return {
    mddPercent: maxDrawdown,
    peakDate,
    troughDate,
  }
}

/**
 * 각 스냅샷에 전일 대비 변화율(%) 추가
 */
export function enrichSnapshotsWithDailyChange(snapshots) {
  const sorted = sortByDateAsc(snapshots)

  return sorted
    .map((snapshot, index) => {
      const prev = index > 0 ? sorted[index - 1] : null
      let dailyChangePercent = null
      let dailyChangeAmount = null

      if (prev && prev.totalValuedAmount > 0) {
        dailyChangeAmount = snapshot.totalValuedAmount - prev.totalValuedAmount
        dailyChangePercent =
          (dailyChangeAmount / prev.totalValuedAmount) * 100
      }

      return {
        ...snapshot,
        dailyChangePercent,
        dailyChangeAmount,
      }
    })
    .reverse()
}
