/**
 * marketSchedule.js — KRX 정규장 시세 갱신 스케줄 (KST)
 *
 * 하루 2회: 장 시작 09:05, 장 마감 15:35
 * 주말(토·일)에는 갱신하지 않습니다.
 */

/** @typedef {'open' | 'close'} MarketSlotId */

export const MARKET_SLOTS = {
  open: { id: 'open', hour: 9, minute: 5, label: '장 시작' },
  close: { id: 'close', hour: 15, minute: 35, label: '장 마감' },
}

/**
 * UTC Date → KST 기준 Date (getHours 등 로컬 메서드가 KST 시각을 반환)
 *
 * @param {Date} [date]
 * @returns {Date}
 */
export function toKST(date = new Date()) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000
  return new Date(utcMs + 9 * 3_600_000)
}

/**
 * @param {Date} kstDate — toKST() 결과
 * @returns {string} YYYY-MM-DD
 */
export function getKSTDateKey(kstDate) {
  const y = kstDate.getFullYear()
  const m = String(kstDate.getMonth() + 1).padStart(2, '0')
  const d = String(kstDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {Date} kstDate
 * @returns {boolean}
 */
export function isTradingDay(kstDate) {
  const day = kstDate.getDay()
  return day >= 1 && day <= 5
}

/**
 * @param {Date} kstDate
 * @returns {number} 0:00부터 경과 분
 */
export function getMinutesOfDay(kstDate) {
  return kstDate.getHours() * 60 + kstDate.getMinutes()
}

/**
 * @param {{ hour: number, minute: number }} slot
 * @returns {number}
 */
export function slotMinutes(slot) {
  return slot.hour * 60 + slot.minute
}

/**
 * @param {string} dateKey — YYYY-MM-DD (KST)
 * @param {number} hour
 * @param {number} minute
 * @returns {Date}
 */
export function createKSTDateTime(dateKey, hour, minute) {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return new Date(`${dateKey}T${hh}:${mm}:00+09:00`)
}

/**
 * 오늘(KST) 아직 수행하지 않은 갱신 슬롯 목록
 *
 * @param {Date} [now]
 * @param {{ open?: boolean, close?: boolean }} completedSlots
 * @returns {MarketSlotId[]}
 */
export function getMissedSlotIds(now = new Date(), completedSlots = {}) {
  const kst = toKST(now)

  if (!isTradingDay(kst)) {
    return []
  }

  const nowMin = getMinutesOfDay(kst)
  const missed = []

  if (nowMin >= slotMinutes(MARKET_SLOTS.open) && !completedSlots.open) {
    missed.push('open')
  }
  if (nowMin >= slotMinutes(MARKET_SLOTS.close) && !completedSlots.close) {
    missed.push('close')
  }

  return missed
}

/**
 * 다음 갱신 예정 시각
 *
 * @param {Date} [now]
 * @returns {{ slotId: MarketSlotId, at: Date, label: string }}
 */
export function getNextScheduledEvent(now = new Date()) {
  const kst = toKST(now)
  const dateKey = getKSTDateKey(kst)
  const nowMin = getMinutesOfDay(kst)

  if (isTradingDay(kst)) {
    if (nowMin < slotMinutes(MARKET_SLOTS.open)) {
      return {
        slotId: 'open',
        at: createKSTDateTime(dateKey, MARKET_SLOTS.open.hour, MARKET_SLOTS.open.minute),
        label: MARKET_SLOTS.open.label,
      }
    }
    if (nowMin < slotMinutes(MARKET_SLOTS.close)) {
      return {
        slotId: 'close',
        at: createKSTDateTime(dateKey, MARKET_SLOTS.close.hour, MARKET_SLOTS.close.minute),
        label: MARKET_SLOTS.close.label,
      }
    }
  }

  const cursor = new Date(kst)
  cursor.setDate(cursor.getDate() + 1)

  while (!isTradingDay(cursor)) {
    cursor.setDate(cursor.getDate() + 1)
  }

  const nextKey = getKSTDateKey(cursor)
  return {
    slotId: 'open',
    at: createKSTDateTime(nextKey, MARKET_SLOTS.open.hour, MARKET_SLOTS.open.minute),
    label: MARKET_SLOTS.open.label,
  }
}

/**
 * @param {Date} target
 * @param {Date} [now]
 * @returns {number}
 */
export function getDelayMs(target, now = new Date()) {
  return Math.max(0, target.getTime() - now.getTime())
}

/**
 * @param {Date} at
 * @returns {string}
 */
export function formatScheduleTime(at) {
  return at.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
