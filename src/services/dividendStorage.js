/**
 * dividendStorage.js — 배당 이벤트 localStorage 저장 계층
 * ─────────────────────────────────────────────────────────
 * 배당 달력 UI / 외부 API 와 분리된 순수 저장 계층입니다.
 *
 * 저장 형식 (DividendEvent):
 *   {
 *     id, symbol, fundName,
 *     recordDate, exDate, paymentDate,
 *     distributionPerShare, quantity,
 *     expectedAmount, confirmedAmount,
 *     status: 'ESTIMATED' | 'CONFIRMED' | 'PAID',
 *     source, createdAt, updatedAt
 *   }
 */

const STORAGE_KEY = 'aladdin_dividend_events'
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

/**
 * localStorage 에서 배당 이벤트 목록을 읽어 옵니다.
 *
 * @returns {Array<Object>} 이벤트 배열. 없거나 오류면 []
 */
export function getDividendEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw === null) {
      return []
    }

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      console.warn('[dividendStorage] 저장된 데이터가 배열이 아닙니다.')
      return []
    }

    return parsed
  } catch (error) {
    console.error('[dividendStorage] localStorage 읽기 실패:', error)
    return []
  }
}

/**
 * 배당 이벤트 목록 전체를 localStorage 에 덮어씁니다.
 *
 * @param {Array<Object>} events - 저장할 이벤트 배열
 */
export function saveDividendEvents(events) {
  if (!Array.isArray(events)) {
    throw new Error('[dividendStorage] saveDividendEvents: events 는 배열이어야 합니다.')
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
}

/**
 * 예상/확정 배당 금액을 계산합니다.
 *
 * @param {number} quantity - 보유 수량 (0 이상)
 * @param {number} distributionPerShare - 주당 분배금 (0 이상)
 * @returns {number} quantity * distributionPerShare
 */
export function calculateDividendAmount(quantity, distributionPerShare) {
  assertNonNegativeNumber(quantity, 'quantity')
  assertNonNegativeNumber(distributionPerShare, 'distributionPerShare')
  return quantity * distributionPerShare
}

/**
 * 새 배당 이벤트 1건을 목록 끝에 추가합니다.
 *
 * @param {Object} event - id, createdAt, updatedAt 을 제외한 이벤트 정보
 * @returns {Object} 저장된 이벤트 (id, createdAt, updatedAt 포함)
 */
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

/**
 * id 로 배당 이벤트 1건을 부분 수정합니다.
 * createdAt 은 유지하고 updatedAt 만 갱신합니다.
 *
 * @param {string} id - 수정할 이벤트의 id
 * @param {Object} patch - 덮어쓸 필드
 * @returns {Object} 수정된 이벤트
 */
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

/**
 * id 로 배당 이벤트 1건을 삭제합니다.
 *
 * @param {string} id - 삭제할 이벤트의 id
 * @returns {Array<Object>} 삭제 후 남은 이벤트 배열
 */
export function deleteDividendEvent(id) {
  const updated = getDividendEvents().filter((item) => item.id !== id)
  saveDividendEvents(updated)
  return updated
}

/**
 * paymentDate 를 안전하게 Date 로 변환합니다.
 * 없거나 파싱 불가하면 null 을 반환합니다.
 *
 * @param {unknown} paymentDate
 * @returns {Date | null}
 */
function parsePaymentDate(paymentDate) {
  if (!paymentDate || typeof paymentDate !== 'string') {
    return null
  }

  const date = new Date(paymentDate)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

/**
 * paymentDate 기준 연도로 배당 이벤트를 필터합니다.
 * 잘못된 날짜는 건너뛰고, 전체 조회는 중단하지 않습니다.
 *
 * @param {number} year - 연도 (예: 2026)
 * @returns {Array<Object>}
 */
export function getDividendEventsByYear(year) {
  return getDividendEvents().filter((event) => {
    const date = parsePaymentDate(event.paymentDate)
    if (!date) return false
    return date.getFullYear() === year
  })
}

/**
 * paymentDate 기준 연·월로 배당 이벤트를 필터합니다.
 *
 * @param {number} year - 연도 (예: 2026)
 * @param {number} month - 월 (1–12)
 * @returns {Array<Object>}
 */
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
