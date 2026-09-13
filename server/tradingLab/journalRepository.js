import { randomUUID } from 'crypto'
import { getDb } from '../db.js'
import { getShadowTradeById, getShadowTradeOutcome, mapShadowTrade, mapShadowTradeOutcome } from './shadowTradeRepository.js'
import { JOURNAL_TEXT_LIMITS } from './journalValidation.js'

const textFields = Object.keys(JOURNAL_TEXT_LIMITS)
const fields = [...textFields, 'timeframe', 'reasonTagsJson', 'invalidationPrice', 'hasStopPlan', 'hasTargetPlan', 'fomo', 'emotionTag', 'reviewedAt']
const parse = (text, fallback) => { try { return JSON.parse(text) ?? fallback } catch { return fallback } }
function mapJournal(row) {
  if (!row) return null
  const { reasonTagsJson, indicatorSnapshotJson, entryPlanSnapshotJson, requestId: _requestId, ...rest } = row
  return {
    ...rest, reasonTags: parse(reasonTagsJson, []),
    indicatorSnapshot: parse(indicatorSnapshotJson, null), entryPlanSnapshot: parse(entryPlanSnapshotJson, null),
    hasStopPlan: row.hasStopPlan == null ? null : Boolean(row.hasStopPlan),
    hasTargetPlan: row.hasTargetPlan == null ? null : Boolean(row.hasTargetPlan),
    fomo: row.fomo == null ? null : Boolean(row.fomo),
  }
}
export function listJournalImages(journalId, db = getDb()) {
  return db.prepare('SELECT id, journalId, mimeType, byteSize, createdAt FROM trade_journal_image WHERE journalId = ? ORDER BY createdAt, id').all(journalId)
    .map((row) => ({ ...row, url: `/api/trading-lab/journals/${journalId}/images/${row.id}` }))
}
export function getJournalByTradeId(shadowTradeId, db = getDb()) {
  const journal = mapJournal(db.prepare('SELECT * FROM trade_journal WHERE shadowTradeId = ?').get(shadowTradeId))
  return journal ? { ...journal, images: listJournalImages(journal.id, db) } : null
}
export function findJournalRequest(requestId, db = getDb()) {
  return db.prepare('SELECT shadowTradeId FROM trade_journal WHERE requestId = ?').get(requestId)?.shadowTradeId ?? null
}
export function getJournalDetail(shadowTradeId, db = getDb()) {
  const trade = getShadowTradeById(shadowTradeId, db)
  if (!trade) return null
  return { trade: { ...trade, outcome: getShadowTradeOutcome(shadowTradeId, db) }, journal: getJournalByTradeId(shadowTradeId, db) }
}
function params(input, now) {
  return {
    ...Object.fromEntries(textFields.map((key) => [key, input[key] ?? null])),
    timeframe: input.timeframe, reasonTagsJson: JSON.stringify(input.reasonTags),
    invalidationPrice: input.invalidationPrice ?? null,
    ...Object.fromEntries(['hasStopPlan', 'hasTargetPlan', 'fomo'].map((key) => [key, input[key] == null ? null : Number(input[key])])),
    emotionTag: input.emotionTag ?? null, reviewedAt: input.reviewed ? now : null,
  }
}
export function insertJournal(shadowTradeId, input, snapshot, db = getDb()) {
  const now = new Date().toISOString()
  // recordedAt stays inside the immutable JSON plan. It is not a trade_journal column.
  const plan = { ...Object.fromEntries([...textFields.filter((key) => !['reviewText', 'mistakeText', 'lessonText'].includes(key)), 'timeframe', 'reasonTags', 'invalidationPrice', 'hasStopPlan', 'hasTargetPlan', 'fomo', 'emotionTag'].map((key) => [key, input[key] ?? null])), recordedAt: now }
  db.prepare(`INSERT INTO trade_journal (
    id, shadowTradeId, requestId, ${fields.join(', ')}, indicatorSnapshotJson, entryPlanSnapshotJson, createdAt, updatedAt
  ) VALUES (@id, @shadowTradeId, @requestId, ${fields.map((key) => `@${key}`).join(', ')}, @snapshot, @plan, @now, @now)`).run({
    ...params(input, now), id: randomUUID(), shadowTradeId, requestId: input.requestId ?? null,
    snapshot: JSON.stringify(snapshot), plan: JSON.stringify(plan), now,
  })
  return getJournalByTradeId(shadowTradeId, db)
}
export function updateJournal(shadowTradeId, input, db = getDb()) {
  const current = getJournalByTradeId(shadowTradeId, db)
  if (!current || current.revision !== input.revision) return null
  const now = new Date().toISOString()
  const result = db.prepare(`UPDATE trade_journal SET ${fields.map((key) => `${key} = @${key}`).join(', ')},
    revision = revision + 1, updatedAt = @now WHERE shadowTradeId = @shadowTradeId AND revision = @revision`).run({
    ...params(input, current.reviewedAt || now), now, shadowTradeId, revision: input.revision,
  })
  return result.changes ? getJournalByTradeId(shadowTradeId, db) : null
}

/** Includes pre-journal shadow records; pagination never hides old trades permanently. */
export function listJournalTrades({ symbol, filter = 'all', offset = 0, limit = 30 }, db = getDb()) {
  const extra = filter === 'review' ? 'AND j.reviewedAt IS NULL AND (o.price1h IS NOT NULL OR o.price4h IS NOT NULL OR o.price12h IS NOT NULL OR o.price24h IS NOT NULL)' : filter === 'reviewed' ? 'AND j.reviewedAt IS NOT NULL' : ''
  const rows = db.prepare(`SELECT t.*, j.id AS journalId, j.journalTitle, j.scenarioText, j.reviewedAt, j.reasonTagsJson,
    o.price1h, o.price4h, o.price12h, o.price24h, o.return1hPct, o.return4hPct, o.return12hPct, o.return24hPct,
    o.maxFavorableMovePct, o.maxAdverseMovePct, o.result, o.evaluatedAt,
    (SELECT COUNT(*) FROM trade_journal_image i WHERE i.journalId = j.id) AS imageCount
    FROM shadow_trade t LEFT JOIN trade_journal j ON j.shadowTradeId = t.id
    LEFT JOIN shadow_trade_outcome o ON o.shadowTradeId = t.id
    WHERE t.symbol = ? ${extra} ORDER BY t.createdAt DESC, t.id DESC LIMIT ? OFFSET ?`).all(symbol, limit + 1, offset)
  const summary = db.prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(j.reviewedAt IS NOT NULL), 0) AS reviewed,
    COALESCE(SUM(j.reviewedAt IS NULL AND (o.price1h IS NOT NULL OR o.price4h IS NOT NULL OR o.price12h IS NOT NULL OR o.price24h IS NOT NULL)), 0) AS needsReview,
    COALESCE(SUM(t.status != 'CLOSED'), 0) AS tracking
    FROM shadow_trade t LEFT JOIN trade_journal j ON j.shadowTradeId = t.id
    LEFT JOIN shadow_trade_outcome o ON o.shadowTradeId = t.id WHERE t.symbol = ?`).get(symbol)
  return {
    trades: rows.slice(0, limit).map((row) => ({
      ...mapShadowTrade(row), outcome: mapShadowTradeOutcome({ ...row, shadowTradeId: row.id }),
      journal: row.journalId ? { id: row.journalId, journalTitle: row.journalTitle, scenarioText: row.scenarioText, reasonTags: parse(row.reasonTagsJson, []), reviewedAt: row.reviewedAt, imageCount: row.imageCount } : null,
    })), summary, hasMore: rows.length > limit,
  }
}
