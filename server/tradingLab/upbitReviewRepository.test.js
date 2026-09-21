import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateTradingLab } from './schema.js'
import {
  deferUpbitReview,
  ensureUpbitReviewFeatureAt,
  ensureUpbitReviewReminders,
  getUpbitReviewByEpisodeId,
  listPendingUpbitReviewReminders,
  saveUpbitReview,
  validateUpbitReviewBody,
} from './upbitReviewRepository.js'
import { listUpbitEpisodes, replaceUpbitEpisodes } from './upbitRepository.js'

function episode(overrides = {}) {
  const now = '2026-09-21T12:00:00.000Z'
  return {
    id: 'upbit-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    market: 'KRW-BTC',
    status: 'CLOSED',
    openedAt: '2026-09-21T10:00:00.000Z',
    closedAt: '2026-09-21T11:00:00.000Z',
    boughtQuantity: 1,
    soldQuantity: 1,
    remainingQuantity: 0,
    grossBuyAmount: 100,
    grossSellAmount: 110,
    buyFees: 0.1,
    sellFees: 0.1,
    averageEntryPrice: 100,
    averageExitPrice: 110,
    realizedPnl: 9.8,
    realizedPnlPct: 9.8,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

let db
beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrateTradingLab(db)
  ensureUpbitReviewFeatureAt(db, '2026-09-21T00:00:00.000Z')
})
afterEach(() => db.close())

describe('Upbit trade review reminders', () => {
  it('CLOSED + review 없음이면 PENDING 복기 대상이 된다', () => {
    replaceUpbitEpisodes([episode()], db)
    const pending = listPendingUpbitReviewReminders(db)
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      episodeId: 'upbit-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      market: 'KRW-BTC',
      reminderState: 'PENDING',
    })
    expect(listUpbitEpisodes({}, db)[0].review.reminderState).toBe('PENDING')
  })

  it('같은 CLOSED를 여러 번 rebuild해도 PENDING 알림은 1건이다', () => {
    const closed = episode()
    replaceUpbitEpisodes([closed], db)
    replaceUpbitEpisodes([closed], db)
    replaceUpbitEpisodes([closed, episode({ id: 'upbit-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', market: 'KRW-ETH' })], db)
    ensureUpbitReviewReminders(db)
    ensureUpbitReviewReminders(db)
    expect(listPendingUpbitReviewReminders(db)).toHaveLength(2)
    expect(db.prepare('SELECT COUNT(*) AS n FROM upbit_trade_review').get().n).toBe(2)
  })

  it('feature 이전 CLOSED는 팝업 대상이 아니다', () => {
    replaceUpbitEpisodes([episode({ closedAt: '2026-09-20T10:00:00.000Z' })], db)
    expect(listPendingUpbitReviewReminders(db)).toHaveLength(0)
    expect(listUpbitEpisodes({}, db)[0].review).toBeNull()
  })

  it('OPEN 거래에는 review reminder를 만들지 않는다', () => {
    replaceUpbitEpisodes([episode({ status: 'OPEN', closedAt: null, remainingQuantity: 1, soldQuantity: 0 })], db)
    expect(listPendingUpbitReviewReminders(db)).toHaveLength(0)
  })

  it('나중에를 선택하면 LATER가 되고 새로고침 후에도 popup 대상이 아니다', () => {
    replaceUpbitEpisodes([episode()], db)
    const deferred = deferUpbitReview(episode().id, db)
    expect(deferred.review.reminderState).toBe('LATER')
    ensureUpbitReviewReminders(db)
    expect(listPendingUpbitReviewReminders(db)).toHaveLength(0)
    expect(listUpbitEpisodes({}, db)[0].review.reminderState).toBe('LATER')
  })

  it('복기를 저장·수정하고 reasonTags / exitReason을 유지한다', () => {
    replaceUpbitEpisodes([episode()], db)
    const saved = saveUpbitReview(episode().id, {
      entryReasonText: '4H 지지 재테스트',
      reasonTags: ['FVG', 'support'],
      exitReason: 'TARGET',
      reviewText: '진입은 괜찮았다',
    }, db)
    expect(saved.review).toMatchObject({
      reminderState: 'COMPLETED',
      entryReasonText: '4H 지지 재테스트',
      reasonTags: ['FVG', 'support'],
      exitReason: 'TARGET',
      reviewText: '진입은 괜찮았다',
    })
    expect(listPendingUpbitReviewReminders(db)).toHaveLength(0)
    const updated = saveUpbitReview(episode().id, {
      entryReasonText: '수정된 진입 근거',
      reasonTags: ['resistance'],
      exitReason: 'STOP',
      reviewText: '손절이 맞았다',
    }, db)
    expect(updated.review).toMatchObject({
      reminderState: 'COMPLETED',
      entryReasonText: '수정된 진입 근거',
      reasonTags: ['resistance'],
      exitReason: 'STOP',
    })
    expect(getUpbitReviewByEpisodeId(episode().id, db).reviewText).toBe('손절이 맞았다')
  })

  it('episode rebuild 후에도 review 원본은 유지된다', () => {
    replaceUpbitEpisodes([episode()], db)
    saveUpbitReview(episode().id, {
      entryReasonText: '원본 유지',
      reasonTags: ['volume'],
      exitReason: 'MANUAL',
      reviewText: '유지 확인',
    }, db)
    replaceUpbitEpisodes([episode({ realizedPnl: 12 })], db)
    expect(getUpbitReviewByEpisodeId(episode().id, db)).toMatchObject({
      entryReasonText: '원본 유지',
      reasonTags: ['volume'],
      exitReason: 'MANUAL',
      reminderState: 'COMPLETED',
    })
  })

  it('잘못된 review body는 거부한다', () => {
    expect(validateUpbitReviewBody({ reasonTags: ['nope'], exitReason: 'TARGET' }).ok).toBe(false)
    expect(validateUpbitReviewBody({ reasonTags: [], exitReason: 'BUY' }).ok).toBe(false)
    expect(validateUpbitReviewBody({ reasonTags: [], exitReason: 'STOP', entryReasonText: 'ok' }).ok).toBe(true)
  })
})
