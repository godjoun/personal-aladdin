/**
 * dividendCalculator.js — 배당 달력 화면용 금액·요약 계산
 * ─────────────────────────────────────────────────────────
 * UI 에 금액 규칙을 흩어놓지 않고 이 모듈에서만 계산합니다.
 * 외부 API / 실데이터 하드코딩 없음.
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * paymentDate 를 로컬 날짜(시분초 0)로 안전하게 파싱합니다.
 * 잘못된 값이면 null.
 *
 * @param {unknown} paymentDate
 * @returns {Date | null}
 */
export function parseDividendPaymentDate(paymentDate) {
  if (!paymentDate || typeof paymentDate !== 'string') {
    return null
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(paymentDate.trim())
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(year, month - 1, day)

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null
    }

    return date
  }

  const parsed = new Date(paymentDate)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

/**
 * @param {Date} date
 * @returns {Date}
 */
function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * quantity × distributionPerShare. 계산 불가 시 0.
 *
 * @param {Object} event
 * @returns {number}
 */
function getFallbackAmount(event) {
  if (!event) return 0

  const quantity = event.quantity
  const distributionPerShare = event.distributionPerShare

  if (!isValidNumber(quantity) || !isValidNumber(distributionPerShare)) {
    return 0
  }

  return quantity * distributionPerShare
}

/**
 * 이벤트 1건의 표시/합산 금액을 반환합니다.
 *
 * 규칙:
 * - PAID / CONFIRMED: confirmedAmount 우선, 없으면 quantity × distributionPerShare
 * - ESTIMATED: expectedAmount 우선, 없으면 quantity × distributionPerShare
 * - 그 외 / 계산 불가: 0
 *
 * @param {Object | null | undefined} event
 * @returns {number}
 */
export function getDividendEventAmount(event) {
  if (!event || typeof event !== 'object') {
    return 0
  }

  const fallback = getFallbackAmount(event)
  const status = event.status

  if (status === 'PAID' || status === 'CONFIRMED') {
    if (isValidNumber(event.confirmedAmount)) {
      return event.confirmedAmount
    }
    return fallback
  }

  if (status === 'ESTIMATED') {
    if (isValidNumber(event.expectedAmount)) {
      return event.expectedAmount
    }
    return fallback
  }

  return 0
}

/**
 * @param {Object} event
 * @param {number} year
 * @param {number} month 1–12
 * @returns {boolean}
 */
function isEventInMonth(event, year, month) {
  const date = parseDividendPaymentDate(event?.paymentDate)
  if (!date) return false
  return date.getFullYear() === year && date.getMonth() + 1 === month
}

/**
 * @param {Object} event
 * @param {number} year
 * @returns {boolean}
 */
function isEventInYear(event, year) {
  const date = parseDividendPaymentDate(event?.paymentDate)
  if (!date) return false
  return date.getFullYear() === year
}

/**
 * 해당 연·월 이벤트를 상태별로 합산합니다.
 * 같은 이벤트를 여러 상태에 중복 합산하지 않습니다.
 *
 * @param {Array<Object>} events
 * @param {number} year
 * @param {number} month 1–12
 * @returns {{ estimated: number, confirmed: number, paid: number }}
 */
export function calculateMonthlyDividendSummary(events, year, month) {
  const summary = {
    estimated: 0,
    confirmed: 0,
    paid: 0,
  }

  if (!Array.isArray(events)) {
    return summary
  }

  for (const event of events) {
    try {
      if (!isEventInMonth(event, year, month)) {
        continue
      }

      const amount = getDividendEventAmount(event)

      if (event.status === 'ESTIMATED') {
        summary.estimated += amount
      } else if (event.status === 'CONFIRMED') {
        summary.confirmed += amount
      } else if (event.status === 'PAID') {
        summary.paid += amount
      }
    } catch {
      // 잘못된 이벤트는 건너뛰고 전체 계산은 계속
    }
  }

  return summary
}

/**
 * 해당 연도 PAID 이벤트만 합산합니다.
 *
 * @param {Array<Object>} events
 * @param {number} year
 * @returns {number}
 */
export function calculateYearPaidDividend(events, year) {
  if (!Array.isArray(events)) {
    return 0
  }

  let total = 0

  for (const event of events) {
    try {
      if (event?.status !== 'PAID') {
        continue
      }
      if (!isEventInYear(event, year)) {
        continue
      }
      total += getDividendEventAmount(event)
    } catch {
      // skip bad event
    }
  }

  return total
}

/**
 * 오늘(포함) 이후 paymentDate 중 가장 가까운 미지급 이벤트.
 * PAID 는 제외합니다. 잘못된 날짜는 건너뜁니다.
 *
 * @param {Array<Object>} events
 * @param {Date} [today]
 * @returns {Object | null}
 */
export function getNextDividendEvent(events, today = new Date()) {
  if (!Array.isArray(events)) {
    return null
  }

  const todayStart = startOfLocalDay(today)
  /** @type {{ event: Object, date: Date }[]} */
  const candidates = []

  for (const event of events) {
    try {
      // 미래 일정만: ESTIMATED / CONFIRMED (PAID·기타 제외)
      if (
        !event ||
        (event.status !== 'ESTIMATED' && event.status !== 'CONFIRMED')
      ) {
        continue
      }

      const date = parseDividendPaymentDate(event.paymentDate)
      if (!date) {
        continue
      }

      if (date.getTime() < todayStart.getTime()) {
        continue
      }

      candidates.push({ event, date })
    } catch {
      // skip bad event
    }
  }

  if (candidates.length === 0) {
    return null
  }

  candidates.sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime()
    if (byDate !== 0) return byDate

    const nameA = a.event.fundName ?? ''
    const nameB = b.event.fundName ?? ''
    return String(nameA).localeCompare(String(nameB), 'ko')
  })

  return candidates[0].event
}

/**
 * 상태 코드 → 한글 라벨
 *
 * @param {string} status
 * @returns {string}
 */
export function getDividendStatusLabel(status) {
  if (status === 'ESTIMATED') return '예정'
  if (status === 'CONFIRMED') return '확정'
  if (status === 'PAID') return '지급완료'
  return status ?? '—'
}

/**
 * 최근 12개월(이번 달 포함) 월별 PAID 합계
 *
 * @param {Array<Object>} events
 * @param {Date} [today]
 * @returns {Array<{ year: number, month: number, label: string, total: number }>}
 */
export function calculateLast12MonthsDividendBars(events, today = new Date()) {
  const bars = []
  const base = startOfLocalDay(today)

  for (let offset = 11; offset >= 0; offset -= 1) {
    const cursor = new Date(base.getFullYear(), base.getMonth() - offset, 1)
    const year = cursor.getFullYear()
    const month = cursor.getMonth() + 1
    const summary = calculateMonthlyDividendSummary(events, year, month)
    bars.push({
      year,
      month,
      label: `${month}월`,
      total: summary.paid,
    })
  }

  return bars
}

/**
 * 최근 PAID 지급 목록 (최신순)
 *
 * @param {Array<Object>} events
 * @param {number} [limit=5]
 */
export function getRecentPaidDividends(events, limit = 5) {
  if (!Array.isArray(events)) return []

  return events
    .filter((event) => event?.status === 'PAID')
    .map((event) => {
      const date = parseDividendPaymentDate(event.paymentDate)
      return { event, date, amount: getDividendEventAmount(event) }
    })
    .filter((item) => item.date)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, Math.max(1, limit))
    .map((item) => item.event)
}
