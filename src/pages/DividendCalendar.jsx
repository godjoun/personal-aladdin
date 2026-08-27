/**
 * DividendCalendar.jsx — 배당 달력 (가독성 개선)
 */

import { useMemo, useState } from 'react'
import {
  calculateMonthlyDividendSummary,
  getDividendEventAmount,
  getDividendStatusLabel,
  parseDividendPaymentDate,
} from '../utils/dividendCalculator.js'
import { formatCurrency } from '../utils/formatters.js'
import '../styles/DividendCalendar.css'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MAX_VISIBLE_EVENTS = 3

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

function buildCalendarCells(year, month) {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
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

function groupEventsByPaymentDate(events, year, month) {
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

function shortFundName(name) {
  const text = String(name || '').trim()
  if (text.length <= 16) return text || '—'
  return `${text.slice(0, 15)}…`
}

function DividendCalendar({
  events: eventsProp,
  onEventClick,
  onDayClick,
  viewYear: viewYearProp,
  viewMonth: viewMonthProp,
  onViewChange,
}) {
  const now = new Date()
  const [innerYear, setInnerYear] = useState(now.getFullYear())
  const [innerMonth, setInnerMonth] = useState(now.getMonth() + 1)

  const viewYear = viewYearProp ?? innerYear
  const viewMonth = viewMonthProp ?? innerMonth

  function setView(year, month) {
    if (onViewChange) {
      onViewChange({ year, month })
      return
    }
    setInnerYear(year)
    setInnerMonth(month)
  }

  const events = Array.isArray(eventsProp) ? eventsProp : []
  const cells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  )
  const eventsByDate = groupEventsByPaymentDate(events, viewYear, viewMonth)
  const monthPaid = calculateMonthlyDividendSummary(events, viewYear, viewMonth).paid

  function goPrevMonth() {
    const next = shiftMonth(viewYear, viewMonth, -1)
    setView(next.year, next.month)
  }

  function goNextMonth() {
    const next = shiftMonth(viewYear, viewMonth, 1)
    setView(next.year, next.month)
  }

  const todayKey = toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate())

  return (
    <div className="dividend-calendar dividend-calendar--embedded">
      <section className="dividend-calendar__panel" aria-label="월별 배당 달력">
        <div className="dividend-calendar__toolbar">
          <div className="dividend-calendar__nav">
            <button
              type="button"
              className="dividend-calendar__nav-btn"
              onClick={goPrevMonth}
              aria-label="이전 달"
            >
              &lt;
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
              &gt;
            </button>
          </div>
          <p className="dividend-calendar__month-total">
            이번 달 총 배당 <strong>{formatCurrency(monthPaid)}</strong>
          </p>
        </div>

        <ul className="dividend-calendar__legend" aria-label="상태 범례">
          <li>
            <span className="dividend-calendar__legend-dot dividend-calendar__legend-dot--paid" />
            지급완료
          </li>
          <li>
            <span className="dividend-calendar__legend-dot dividend-calendar__legend-dot--confirmed" />
            확정
          </li>
          <li>
            <span className="dividend-calendar__legend-dot dividend-calendar__legend-dot--estimated" />
            예정
          </li>
        </ul>

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
            const visible = dayEvents.slice(0, MAX_VISIBLE_EVENTS)
            const overflow = dayEvents.length - visible.length

            return (
              <button
                key={cell.key}
                type="button"
                className={`dividend-calendar__cell dividend-calendar__cell--interactive${
                  isToday ? ' dividend-calendar__cell--today' : ''
                }${dayEvents.length > 0 ? ' dividend-calendar__cell--has-events' : ''}`}
                onClick={() => onDayClick?.(cell.dateKey, dayEvents)}
              >
                <span className="dividend-calendar__day-num">{cell.day}</span>
                <ul className="dividend-calendar__event-list">
                  {visible.map((event) => {
                    const statusClass = String(event.status || 'unknown').toLowerCase()
                    return (
                      <li key={event.id}>
                        <span
                          className={`dividend-calendar__event dividend-calendar__event--${statusClass}`}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            onEventClick?.(event)
                          }}
                          onKeyDown={(keyEvent) => {
                            if (keyEvent.key === 'Enter') {
                              keyEvent.stopPropagation()
                              onEventClick?.(event)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <span className="dividend-calendar__event-name">
                            {shortFundName(event.fundName || event.symbol)}
                          </span>
                          <span className="dividend-calendar__event-amount">
                            {formatCurrency(getDividendEventAmount(event))}
                          </span>
                          <span className="dividend-calendar__event-badge">
                            {getDividendStatusLabel(event.status)}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                  {overflow > 0 && (
                    <li className="dividend-calendar__overflow">+{overflow}건</li>
                  )}
                </ul>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default DividendCalendar
