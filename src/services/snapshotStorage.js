/**
 * snapshotStorage.js — 포트폴리오 스냅샷 (메모리 전용)
 */

import {
  FINANCE_LS_KEYS,
  getMemory,
  setMemory,
} from './memoryFinanceStore.js'

const MEMORY_KEY = FINANCE_LS_KEYS.snapshots

export function getPortfolioSnapshots() {
  const value = getMemory(MEMORY_KEY, [])
  const list = Array.isArray(value) ? value : []
  return [...list].sort((a, b) => b.date.localeCompare(a.date))
}

export function savePortfolioSnapshots(snapshots) {
  if (!Array.isArray(snapshots)) {
    throw new Error('[snapshotStorage] snapshots 는 배열이어야 합니다.')
  }
  setMemory(MEMORY_KEY, snapshots)
}

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
  setMemory(MEMORY_KEY, [])
}
