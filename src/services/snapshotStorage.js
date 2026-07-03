/**
 * snapshotStorage.js — 포트폴리오 일별 스냅샷 저장
 * ─────────────────────────────────────────────────────────
 * 블랙록 ALADDIN 의 Daily Marking(일별 평가 기록)에 해당합니다.
 *
 * 규칙:
 *   - 하루(date)에 1건 — 같은 날 다시 기록하면 덮어씀(최신 마킹 유지)
 *   - 스냅샷은 분석용 원장 — 함부로 삭제하지 않음 (clear 는 개발·초기화용)
 *
 * 저장 형식 (PortfolioSnapshot):
 *   {
 *     date: "20260703",
 *     recordedAt: "2026-07-03T...",
 *     totalInvested, totalValuedAmount, totalProfitLoss, totalReturnRate,
 *     assetCount, valuedCount,
 *     allocation: [{ assetClass, totalValue, weight }],
 *     positions: [{ assetId, symbol, name, ... markPrice, holdingValue, weight }],
 *     risk: { worstScenarioId, expectedLossRate, expectedLossAmount, maxWeightDeviation }
 *   }
 */

const STORAGE_KEY = 'aladdin_portfolio_snapshots'

export function getPortfolioSnapshots() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw === null) {
      return []
    }

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      console.warn('[snapshotStorage] 저장된 데이터가 배열이 아닙니다.')
      return []
    }

    return parsed.sort((a, b) => b.date.localeCompare(a.date))
  } catch (error) {
    console.error('[snapshotStorage] 읽기 실패:', error)
    return []
  }
}

export function savePortfolioSnapshots(snapshots) {
  if (!Array.isArray(snapshots)) {
    throw new Error('[snapshotStorage] snapshots 는 배열이어야 합니다.')
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots))
}

/**
 * date 기준 upsert — 블랙록 End-of-Day 마킹 갱신과 동일
 */
export function upsertPortfolioSnapshot(snapshot) {
  if (!snapshot?.date) {
    throw new Error('[snapshotStorage] snapshot.date 가 필요합니다.')
  }

  const existing = getPortfolioSnapshots()
  const index = existing.findIndex((item) => item.date === snapshot.date)
  let inserted = false
  let updated = false

  if (index >= 0) {
    existing[index] = snapshot
    updated = true
  } else {
    existing.push(snapshot)
    inserted = true
  }

  existing.sort((a, b) => b.date.localeCompare(a.date))
  savePortfolioSnapshots(existing)

  return {
    total: existing.length,
    inserted: inserted ? 1 : 0,
    updated: updated ? 1 : 0,
    snapshot,
  }
}

export function getSnapshotByDate(date) {
  return getPortfolioSnapshots().find((item) => item.date === date) ?? null
}

export function clearPortfolioSnapshots() {
  localStorage.removeItem(STORAGE_KEY)
}
