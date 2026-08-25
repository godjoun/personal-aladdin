/**
 * DividendCalendar.jsx — 배당 달력 v1
 * ─────────────────────────────────────────────────────────
 * localStorage 배당 이벤트를 월 달력으로 표시합니다.
 * 외부 API / 입력 폼 / 알림 없음.
 */

import { useMemo, useState } from 'react'
import { getDividendEvents } from '../services/dividendStorage.js'
import {
  calculateMonthlyDividendSummary,
  calculateYearPaidDividend,
  getDividendEventAmount,
  getDividendStatusLabel,
  getNextDividendEvent,
  parseDividendPaymentDate,
} from '../utils/dividendCalculator.js'
import { formatCurrency } from '../utils/formatters.js'
import '../styles/WorkspacePages.css'
import '../styles/DividendCalendar.css'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function shiftMonth(year, month, delta) {
  const date = new Date(year, month - 1 + delta, 1)
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  }
}

/**
 * @param {number} year
 * @param {number} month 1–12
 */
function buildCalendarCells(year, month) {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  /** @type {Array<{ type: 'pad' | 'day', key: string, day?: number, dateKey?: string }>} */
  const cells = []

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ type: 'pad', key: `pad-start-${i}` })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      type: 'day',
      key: `day-${day}`,
      day,
      dateKey: toDateKey(year, month, day),
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ type: 'pad', key: `pad-end-${cells.length}` })
  }

  return cells
}

/**
 * paymentDate 가 표시 월에 속하는 이벤트만 dateKey 로 묶습니다.
 * 이전/다음 달 패딩 칸에는 배치하지 않습니다.
 *
 * @param {Array<Object>} events
 * @param {number} year
 * @param {number} month
 * @returns {Map<string, Object[]>}
 */
function groupEventsByPaymentDate(events, year, month) {
  /** @type {Map<string, Object[]>} */
  const map = new Map()

  for (const event of events) {
    const date = parseDividendPaymentDate(event?.paymentDate)
    if (!date) continue
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue

    const key = toDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
    const list = map.get(key) ?? []
    list.push(event)
    map.set(key, list)
  }

  return map
}

function DividendCalendar({ embedded = false }) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)

  // 입력 폼이 없는 v1 — 렌더 시 localStorage 를 직접 읽음
  const events = getDividendEvents()
  const cells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  )
  const eventsByDate = groupEventsByPaymentDate(events, viewYear, viewMonth)
  const isEmpty = events.length === 0

  const monthlySummary = embedded
    ? null
    : calculateMonthlyDividendSummary(events, viewYear, viewMonth)
  const yearPaid = embedded
    ? null
    : calculateYearPaidDividend(events, viewYear)
  const nextEvent = embedded ? null : getNextDividendEvent(events, new Date())

  function goPrevMonth() {
    const next = shiftMonth(viewYear, viewMonth, -1)
    setViewYear(next.year)
    setViewMonth(next.month)
  }

  function goNextMonth() {
    const next = shiftMonth(viewYear, viewMonth, 1)
    setViewYear(next.year)
    setViewMonth(next.month)
  }

  function goToday() {
    const today = new Date()
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth() + 1)
  }

  const todayKey = toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate())

  return (
    <div
      className={`dividend-calendar${embedded ? ' dividend-calendar--embedded' : ' workspace-page'}`}
    >
      {!embedded && (
        <>
          <header className="workspace-page__header">
            <h2 className="workspace-page__title">배당 달력</h2>
            <p className="workspace-page__desc">
              등록된 배당 일정을 paymentDate 기준으로 월별 확인합니다. (로컬 저장 · API 없음)
            </p>
          </header>

          <section
            className="workspace-page__summary workspace-page__summary--4 dividend-calendar__summary"
            aria-label="배당 요약"
          >
            <article className="workspace-page__summary-card">
              <p className="workspace-page__summary-label">이번 달 예상</p>
              <p className="workspace-page__summary-value">
                {formatCurrency(monthlySummary.estimated)}
              </p>
            </article>
            <article className="workspace-page__summary-card">
              <p className="workspace-page__summary-label">이번 달 확정</p>
              <p className="workspace-page__summary-value">
                {formatCurrency(monthlySummary.confirmed)}
              </p>
            </article>
            <article className="workspace-page__summary-card">
              <p className="workspace-page__summary-label">이번 달 지급완료</p>
              <p className="workspace-page__summary-value">
                {formatCurrency(monthlySummary.paid)}
              </p>
            </article>
            <article className="workspace-page__summary-card">
              <p className="workspace-page__summary-label">올해 누적 지급액</p>
              <p className="workspace-page__summary-value">{formatCurrency(yearPaid)}</p>
              <p className="workspace-page__summary-sub">{viewYear}년 · PAID만 합산</p>
            </article>
          </section>

          <section className="workspace-page__summary-card dividend-calendar__next">
            <p className="workspace-page__summary-label">다음 지급 예정</p>
            {nextEvent ? (
              <div className="dividend-calendar__next-body">
                <p className="workspace-page__summary-value">
                  {nextEvent.fundName || nextEvent.symbol || '—'}
                </p>
                <p className="workspace-page__summary-sub">
                  {nextEvent.paymentDate} · {formatCurrency(getDividendEventAmount(nextEvent))} ·{' '}
                  {getDividendStatusLabel(nextEvent.status)}
                </p>
              </div>
            ) : (
              <p className="workspace-page__summary-sub">예정된 지급이 없습니다.</p>
            )}
          </section>
        </>
      )}

      {embedded && (
        <header className="dividend-calendar__embedded-header">
          <h2 className="simple-dash__section-title">배당 달력</h2>
        </header>
      )}

      {isEmpty && (
        <p className="workspace-page__empty dividend-calendar__empty">
          등록된 배당 일정이 없습니다.
        </p>
      )}

      <section className="dividend-calendar__panel" aria-label="월별 배당 달력">
        <div className="dividend-calendar__toolbar">
          <button
            type="button"
            className="dividend-calendar__nav-btn"
            onClick={goPrevMonth}
            aria-label="이전 달"
          >
            ‹ 이전
          </button>
          <h3 className="dividend-calendar__month-label">
            {viewYear}년 {viewMonth}월
          </h3>
          <button
            type="button"
            className="dividend-calendar__nav-btn"
            onClick={goNextMonth}
            aria-label="다음 달"
          >
            다음 ›
          </button>
          <button
            type="button"
            className="dividend-calendar__today-btn"
            onClick={goToday}
          >
            오늘
          </button>
        </div>

        <div className="dividend-calendar__weekdays" role="row">
          {WEEKDAYS.map((label) => (
            <div key={label} className="dividend-calendar__weekday" role="columnheader">
              {label}
            </div>
          ))}
        </div>

        <div className="dividend-calendar__grid" role="grid">
          {cells.map((cell) => {
            if (cell.type === 'pad') {
              return (
                <div
                  key={cell.key}
                  className="dividend-calendar__cell dividend-calendar__cell--pad"
                  aria-hidden="true"
                />
              )
            }

            const dayEvents = eventsByDate.get(cell.dateKey) ?? []
            const isToday = cell.dateKey === todayKey

            return (
              <div
                key={cell.key}
                className={`dividend-calendar__cell${
                  isToday ? ' dividend-calendar__cell--today' : ''
                }${dayEvents.length > 0 ? ' dividend-calendar__cell--has-events' : ''}`}
                role="gridcell"
              >
                <span className="dividend-calendar__day-num">{cell.day}</span>
                <ul className="dividend-calendar__event-list">
                  {dayEvents.map((event) => (
                    <li
                      key={event.id}
                      className={`dividend-calendar__event dividend-calendar__event--${String(
                        event.status || 'unknown',
                      ).toLowerCase()}`}
                    >
                      <span className="dividend-calendar__event-name">
                        {event.fundName || event.symbol || '—'}
                      </span>
                      <span className="dividend-calendar__event-amount">
                        {formatCurrency(getDividendEventAmount(event))}
                      </span>
                      <span className="dividend-calendar__event-status">
                        {getDividendStatusLabel(event.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default DividendCalendar
