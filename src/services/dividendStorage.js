/**
 * dividendStorage.js — 배당 이벤트 (메모리 전용, SQLite가 SoT)
 */

import {
  FINANCE_LS_KEYS,
  getMemory,
  setMemory,
} from './memoryFinanceStore.js'

const MEMORY_KEY = FINANCE_LS_KEYS.dividends
const VALID_STATUSES = new Set(['ESTIMATED', 'CONFIRMED', 'PAID'])

function assertNonNegativeNumber(value, fieldName) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error(`[dividendStorage] ${fieldName} 는 0 이상의 숫자여야 합니다.`)
  }
}

function assertValidStatus(status) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(
      '[dividendStorage] status 는 ESTIMATED, CONFIRMED, PAID 중 하나여야 합니다.',
    )
  }
}

export function getDividendEvents() {
  const value = getMemory(MEMORY_KEY, [])
  return Array.isArray(value) ? value : []
}

export function saveDividendEvents(events) {
  if (!Array.isArray(events)) {
    throw new Error('[dividendStorage] saveDividendEvents: events 는 배열이어야 합니다.')
  }
  setMemory(MEMORY_KEY, events)
}

export function calculateDividendAmount(quantity, distributionPerShare) {
  assertNonNegativeNumber(quantity, 'quantity')
  assertNonNegativeNumber(distributionPerShare, 'distributionPerShare')
  return quantity * distributionPerShare
}

export function addDividendEvent(event) {
  assertNonNegativeNumber(event.quantity, 'quantity')
  assertNonNegativeNumber(event.distributionPerShare, 'distributionPerShare')
  assertValidStatus(event.status)

  const now = new Date().toISOString()
  const existing = getDividendEvents()
  const newEvent = {
    ...event,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  saveDividendEvents([...existing, newEvent])
  return newEvent
}

export function updateDividendEvent(id, patch) {
  const existing = getDividendEvents()
  const index = existing.findIndex((item) => item.id === id)
  if (index < 0) {
    throw new Error(`[dividendStorage] id 를 찾을 수 없습니다: ${id}`)
  }

  const current = existing[index]
  const next = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
  }

  if ('quantity' in next) {
    assertNonNegativeNumber(next.quantity, 'quantity')
  }
  if ('distributionPerShare' in next) {
    assertNonNegativeNumber(next.distributionPerShare, 'distributionPerShare')
  }
  if ('status' in next) {
    assertValidStatus(next.status)
  }

  next.updatedAt = new Date().toISOString()
  existing[index] = next
  saveDividendEvents(existing)
  return next
}

export function deleteDividendEvent(id) {
  const updated = getDividendEvents().filter((item) => item.id !== id)
  saveDividendEvents(updated)
  return updated
}

function parsePaymentDate(paymentDate) {
  if (!paymentDate || typeof paymentDate !== 'string') return null
  const date = new Date(paymentDate)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function getDividendEventsByYear(year) {
  return getDividendEvents().filter((event) => {
    const date = parsePaymentDate(event.paymentDate)
    if (!date) return false
    return date.getFullYear() === year
  })
}

export function getDividendEventsByMonth(year, month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('[dividendStorage] month 는 1 이상 12 이하의 정수여야 합니다.')
  }
  return getDividendEvents().filter((event) => {
    const date = parsePaymentDate(event.paymentDate)
    if (!date) return false
    return date.getFullYear() === year && date.getMonth() + 1 === month
  })
}
