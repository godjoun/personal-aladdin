/**
 * marketScheduleSettings.js — 시세 자동 갱신 설정·완료 기록
 */

import {
  getKSTDateKey,
  getMinutesOfDay,
  isTradingDay,
  MARKET_SLOTS,
  slotMinutes,
  toKST,
} from '../utils/marketSchedule.js'

const ENABLED_KEY = 'aladdin_auto_market_refresh'
const LOG_KEY = 'aladdin_market_refresh_log'

/**
 * 기본값 true — 자동 갱신 사용
 *
 * @returns {boolean}
 */
export function getAutoMarketRefreshEnabled() {
  const stored = localStorage.getItem(ENABLED_KEY)
  if (stored === null) {
    return true
  }
  return stored === 'true'
}

/**
 * @param {boolean} enabled
 */
export function setAutoMarketRefreshEnabled(enabled) {
  localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false')
}

/**
 * 오늘(KST) 슬롯별 완료 여부
 *
 * @returns {{ date: string, open: boolean, close: boolean }}
 */
export function getTodayRefreshLog() {
  const today = getKSTDateKey(toKST())

  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (!raw) {
      return { date: today, open: false, close: false }
    }

    const log = JSON.parse(raw)
    if (log.date !== today) {
      return { date: today, open: false, close: false }
    }

    return {
      date: today,
      open: Boolean(log.open),
      close: Boolean(log.close),
    }
  } catch {
    return { date: today, open: false, close: false }
  }
}

/**
 * @param {import('../utils/marketSchedule.js').MarketSlotId[]} slotIds
 */
export function markSlotsRefreshed(slotIds) {
  const log = getTodayRefreshLog()

  for (const slotId of slotIds) {
    log[slotId] = true
  }

  localStorage.setItem(LOG_KEY, JSON.stringify(log))
}

/**
 * 수동·자동 갱신 성공 후, 이미 지난 슬롯을 완료 처리합니다.
 */
export function markPassedSlotsCompleted() {
  const kst = toKST()

  if (!isTradingDay(kst)) {
    return
  }

  const log = getTodayRefreshLog()
  const nowMin = getMinutesOfDay(kst)

  if (nowMin >= slotMinutes(MARKET_SLOTS.open)) {
    log.open = true
  }
  if (nowMin >= slotMinutes(MARKET_SLOTS.close)) {
    log.close = true
  }

  localStorage.setItem(LOG_KEY, JSON.stringify(log))
}
