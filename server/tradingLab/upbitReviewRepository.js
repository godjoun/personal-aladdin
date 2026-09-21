/**
 * Upbit closed-trade review persistence.
 * Lives beside episodes so replaceUpbitEpisodes rebuilds do not wipe notes.
 * episodeId is a stable hash — no FK CASCADE (episode rows are deleted/reinserted).
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db.js'
import { UPBIT_EXIT_REASON_KEYS, UPBIT_REVIEW_TEXT_LIMITS } from '../../shared/upbitTradeReview.js'
import { JOURNAL_REASON_TAGS } from '../../shared/tradeJournal.js'

const REVIEW_FEATURE_AT_KEY = 'reviewFeatureAt'

function parseTags(text) {
  try {
    const value = JSON.parse(text)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function mapUpbitReview(row) {
  if (!row) return null
  return {
    id: row.id,
    episodeId: row.episodeId,
    entryReasonText: row.entryReasonText ?? null,
    reasonTags: parseTags(row.reasonTagsJson),
    exitReason: row.exitReason ?? null,
    reviewText: row.reviewText ?? null,
    reminderState: row.reminderState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function ensureUpbitReviewFeatureAt(db = getDb(), now = new Date().toISOString()) {
  const existing = db.prepare('SELECT value FROM upbit_sync_state WHERE key = ?').get(REVIEW_FEATURE_AT_KEY)?.value
  if (existing) return existing
  db.prepare(`INSERT INTO upbit_sync_state (key, value, updatedAt) VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING`).run(REVIEW_FEATURE_AT_KEY, now, now)
  return db.prepare('SELECT value FROM upbit_sync_state WHERE key = ?').get(REVIEW_FEATURE_AT_KEY)?.value || now
}

/**
 * Create PENDING review rows for newly CLOSED episodes after the feature watermark.
 * Idempotent: existing episodeId rows are left untouched (LATER/COMPLETED/PENDING).
 */
export function ensureUpbitReviewReminders(db = getDb(), now = new Date().toISOString()) {
  const featureAt = ensureUpbitReviewFeatureAt(db, now)
  const closed = db.prepare(`
    SELECT id FROM upbit_trade_episode
    WHERE status = 'CLOSED'
      AND closedAt IS NOT NULL
      AND closedAt >= ?
  `).all(featureAt)
  const insert = db.prepare(`
    INSERT INTO upbit_trade_review (
      id, episodeId, entryReasonText, reasonTagsJson, exitReason, reviewText,
      reminderState, createdAt, updatedAt
    ) VALUES (?, ?, NULL, '[]', NULL, NULL, 'PENDING', ?, ?)
    ON CONFLICT(episodeId) DO NOTHING
  `)
  const run = db.transaction(() => {
    for (const row of closed) insert.run(randomUUID(), row.id, now, now)
  })
  run()
  return featureAt
}

export function listUpbitReviewsByEpisodeIds(episodeIds, db = getDb()) {
  if (!episodeIds?.length) return new Map()
  const placeholders = episodeIds.map(() => '?').join(',')
  const rows = db.prepare(`SELECT * FROM upbit_trade_review WHERE episodeId IN (${placeholders})`).all(...episodeIds)
  return new Map(rows.map((row) => [row.episodeId, mapUpbitReview(row)]))
}

export function getUpbitReviewByEpisodeId(episodeId, db = getDb()) {
  return mapUpbitReview(db.prepare('SELECT * FROM upbit_trade_review WHERE episodeId = ?').get(episodeId))
}

export function listPendingUpbitReviewReminders(db = getDb()) {
  ensureUpbitReviewReminders(db)
  return db.prepare(`
    SELECT r.*, e.market, e.closedAt, e.realizedPnl
    FROM upbit_trade_review r
    INNER JOIN upbit_trade_episode e ON e.id = r.episodeId
    WHERE r.reminderState = 'PENDING' AND e.status = 'CLOSED'
    ORDER BY e.closedAt DESC, r.createdAt DESC
  `).all().map((row) => ({
    ...mapUpbitReview(row),
    market: row.market,
    closedAt: row.closedAt,
    realizedPnl: row.realizedPnl == null ? null : Number(row.realizedPnl),
  }))
}

export function deferUpbitReview(episodeId, db = getDb(), now = new Date().toISOString()) {
  ensureUpbitReviewReminders(db, now)
  const episode = db.prepare('SELECT id, status FROM upbit_trade_episode WHERE id = ?').get(episodeId)
  if (!episode || episode.status !== 'CLOSED') return { ok: false, code: 'NOT_FOUND' }
  const existing = getUpbitReviewByEpisodeId(episodeId, db)
  if (existing?.reminderState === 'COMPLETED') return { ok: true, review: existing }
  if (existing) {
    db.prepare(`UPDATE upbit_trade_review SET reminderState = 'LATER', updatedAt = ? WHERE episodeId = ?`).run(now, episodeId)
    return { ok: true, review: getUpbitReviewByEpisodeId(episodeId, db) }
  }
  db.prepare(`
    INSERT INTO upbit_trade_review (
      id, episodeId, entryReasonText, reasonTagsJson, exitReason, reviewText,
      reminderState, createdAt, updatedAt
    ) VALUES (?, ?, NULL, '[]', NULL, NULL, 'LATER', ?, ?)
  `).run(randomUUID(), episodeId, now, now)
  return { ok: true, review: getUpbitReviewByEpisodeId(episodeId, db) }
}

export function validateUpbitReviewBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body' }
  const allowed = new Set(['entryReasonText', 'reasonTags', 'exitReason', 'reviewText'])
  const extra = Object.keys(body).find((key) => !allowed.has(key))
  if (extra) return { ok: false, field: 'body' }
  const value = {}
  for (const [key, limit] of Object.entries(UPBIT_REVIEW_TEXT_LIMITS)) {
    if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > limit)) return { ok: false, field: key }
    value[key] = body[key]?.trim() || null
  }
  if (!Array.isArray(body.reasonTags)
    || body.reasonTags.length > JOURNAL_REASON_TAGS.length
    || body.reasonTags.some((tag) => !JOURNAL_REASON_TAGS.includes(tag))) {
    return { ok: false, field: 'reasonTags' }
  }
  value.reasonTags = [...new Set(body.reasonTags)]
  if (body.exitReason != null && !UPBIT_EXIT_REASON_KEYS.includes(body.exitReason)) return { ok: false, field: 'exitReason' }
  value.exitReason = body.exitReason ?? null
  return { ok: true, value }
}

export function saveUpbitReview(episodeId, input, db = getDb(), now = new Date().toISOString()) {
  const episode = db.prepare('SELECT id, status FROM upbit_trade_episode WHERE id = ?').get(episodeId)
  if (!episode || episode.status !== 'CLOSED') return { ok: false, code: 'NOT_FOUND' }
  const existing = getUpbitReviewByEpisodeId(episodeId, db)
  if (existing) {
    db.prepare(`
      UPDATE upbit_trade_review SET
        entryReasonText = ?, reasonTagsJson = ?, exitReason = ?, reviewText = ?,
        reminderState = 'COMPLETED', updatedAt = ?
      WHERE episodeId = ?
    `).run(
      input.entryReasonText, JSON.stringify(input.reasonTags), input.exitReason, input.reviewText,
      now, episodeId,
    )
  } else {
    db.prepare(`
      INSERT INTO upbit_trade_review (
        id, episodeId, entryReasonText, reasonTagsJson, exitReason, reviewText,
        reminderState, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
    `).run(
      randomUUID(), episodeId, input.entryReasonText, JSON.stringify(input.reasonTags),
      input.exitReason, input.reviewText, now, now,
    )
  }
  return { ok: true, review: getUpbitReviewByEpisodeId(episodeId, db) }
}
