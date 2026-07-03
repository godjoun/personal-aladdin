/**
 * useMarketSchedule.js — 시세 자동 갱신 스케줄 + 접속 시 보정
 */

import { useCallback, useEffect, useRef } from 'react'
import { getMarketPrices } from '../services/storage.js'
import {
  getTodayRefreshLog,
  markSlotsRefreshed,
} from '../services/marketScheduleSettings.js'
import {
  formatScheduleTime,
  getDelayMs,
  getMissedSlotIds,
  getNextScheduledEvent,
} from '../utils/marketSchedule.js'

/**
 * @param {Object} options
 * @param {boolean} options.enabled — 자동 갱신 ON/OFF
 * @param {boolean} options.hasAssets — 등록된 자산 존재 여부
 * @param {() => Promise<unknown>} options.onRefresh — 시세 갱신 함수
 */
export function useMarketSchedule({ enabled, hasAssets, onRefresh }) {
  const onRefreshRef = useRef(onRefresh)
  const timerRef = useRef(null)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  const scheduleNext = useCallback(() => {
    clearTimeout(timerRef.current)

    const next = getNextScheduledEvent()
    const delay = getDelayMs(next.at)

    console.log(
      `[marketSchedule] 다음 자동 갱신 — ${next.label} (${next.slotId}) · ${formatScheduleTime(next.at)} · ${Math.round(delay / 60_000)}분 후`,
    )

    timerRef.current = setTimeout(async () => {
      if (!hasAssets) {
        scheduleNext()
        return
      }

      try {
        await onRefreshRef.current()
        markSlotsRefreshed([next.slotId])
        console.log(`[marketSchedule] 예약 갱신 완료 — ${next.label}`)
      } catch (error) {
        console.warn('[marketSchedule] 예약 갱신 실패:', error.message)
      }

      scheduleNext()
    }, delay)
  }, [hasAssets])

  useEffect(() => {
    if (!enabled) {
      clearTimeout(timerRef.current)
      return undefined
    }

    let cancelled = false

    async function bootstrap() {
      if (!hasAssets) {
        if (!cancelled) {
          scheduleNext()
        }
        return
      }

      const log = getTodayRefreshLog()
      const missed = getMissedSlotIds(new Date(), log)

      if (missed.length > 0) {
        console.log('[marketSchedule] 놓친 갱신 보정 —', missed.join(', '))
        try {
          await onRefreshRef.current()
          markSlotsRefreshed(missed)
          console.log('[marketSchedule] 보정 갱신 완료')
        } catch (error) {
          console.warn('[marketSchedule] 보정 갱신 실패:', error.message)
        }
      } else if (getMarketPrices().length === 0) {
        console.log('[marketSchedule] 저장된 시세 없음 — 초기 갱신')
        try {
          await onRefreshRef.current()
        } catch (error) {
          console.warn('[marketSchedule] 초기 갱신 실패:', error.message)
        }
      } else {
        console.log(
          `[marketSchedule] 오늘 보정 불필요 (open: ${log.open ? '완료' : '대기'}, close: ${log.close ? '완료' : '대기'})`,
        )
      }

      if (!cancelled) {
        scheduleNext()
      }
    }

    bootstrap()

    return () => {
      cancelled = true
      clearTimeout(timerRef.current)
    }
  }, [enabled, hasAssets, scheduleNext])
}
