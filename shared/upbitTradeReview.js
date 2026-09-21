/** Shared vocabulary for Upbit closed-trade reviews (read-only sync). */

import { JOURNAL_REASON_TAGS } from './tradeJournal.js'

export const UPBIT_REVIEW_REASON_TAGS = JOURNAL_REASON_TAGS

export const UPBIT_EXIT_REASONS = Object.freeze({
  TARGET: '목표 도달',
  STOP: '손절',
  PLAN_CHANGE: '계획 변경',
  IMPULSE: '충동 청산',
  MANUAL: '수동 종료',
  OTHER: '기타',
})

export const UPBIT_EXIT_REASON_KEYS = Object.freeze(Object.keys(UPBIT_EXIT_REASONS))

export const UPBIT_REVIEW_REMINDER_STATES = Object.freeze(['PENDING', 'LATER', 'COMPLETED'])

export const UPBIT_REVIEW_TEXT_LIMITS = Object.freeze({
  entryReasonText: 2000,
  reviewText: 4000,
})
