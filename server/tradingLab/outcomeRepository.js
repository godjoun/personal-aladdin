/**
 * outcomeRepository.js — trade_analysis_outcomes 저장/조회
 *
 * 분석 1건당 결과 1건(UNIQUE analysisId)을 유지하고 upsert 한다.
 * 자동 판정은 하지 않는다. 현재는 기록 구조만 제공한다.
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db.js'

/**
 * @param {object} row
 */
function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    analysisId: row.analysisId,
    evaluatedAt: row.evaluatedAt ?? null,
    price1h: row.price1h ?? null,
    price4h: row.price4h ?? null,
    price12h: row.price12h ?? null,
    price24h: row.price24h ?? null,
    maxFavorableMove: row.maxFavorableMove ?? null,
    maxAdverseMove: row.maxAdverseMove ?? null,
    result: row.result,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * @param {string} analysisId
 * @param {import('better-sqlite3').Database} [db]
 */
export function getOutcomeByAnalysisId(analysisId, db = getDb()) {
  const row = db
    .prepare('SELECT * FROM trade_analysis_outcomes WHERE analysisId = ?')
    .get(analysisId)
  return mapRow(row)
}

/**
 * @param {string} analysisId
 * @param {object} input sanitizeOutcomeInput 을 통과한 값
 * @param {import('better-sqlite3').Database} [db]
 * @returns {{ ok: false, reason: string } | { ok: true, action: 'inserted' | 'updated', outcome: object }}
 */
export function upsertOutcome(analysisId, input, db = getDb()) {
  const analysis = db
    .prepare('SELECT id FROM trade_analysis WHERE id = ?')
    .get(analysisId)
  if (!analysis) {
    return { ok: false, reason: 'analysis_not_found' }
  }

  const now = new Date().toISOString()
  const existing = getOutcomeByAnalysisId(analysisId, db)

  if (existing) {
    db.prepare(
      `UPDATE trade_analysis_outcomes SET
         evaluatedAt = ?,
         price1h = ?, price4h = ?, price12h = ?, price24h = ?,
         maxFavorableMove = ?, maxAdverseMove = ?,
         result = ?, notes = ?, updatedAt = ?
       WHERE analysisId = ?`,
    ).run(
      input.evaluatedAt ?? null,
      input.price1h ?? null,
      input.price4h ?? null,
      input.price12h ?? null,
      input.price24h ?? null,
      input.maxFavorableMove ?? null,
      input.maxAdverseMove ?? null,
      input.result,
      input.notes ?? null,
      now,
      analysisId,
    )
    return {
      ok: true,
      action: 'updated',
      outcome: getOutcomeByAnalysisId(analysisId, db),
    }
  }

  db.prepare(
    `INSERT INTO trade_analysis_outcomes (
      id, analysisId, evaluatedAt,
      price1h, price4h, price12h, price24h,
      maxFavorableMove, maxAdverseMove,
      result, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    analysisId,
    input.evaluatedAt ?? null,
    input.price1h ?? null,
    input.price4h ?? null,
    input.price12h ?? null,
    input.price24h ?? null,
    input.maxFavorableMove ?? null,
    input.maxAdverseMove ?? null,
    input.result,
    input.notes ?? null,
    now,
    now,
  )

  return {
    ok: true,
    action: 'inserted',
    outcome: getOutcomeByAnalysisId(analysisId, db),
  }
}

/**
 * 여러 분석의 결과를 한 번에 조회 (목록 화면용)
 *
 * @param {string[]} analysisIds
 * @param {import('better-sqlite3').Database} [db]
 * @returns {Map<string, object>}
 */
export function getOutcomesByAnalysisIds(analysisIds, db = getDb()) {
  const ids = Array.isArray(analysisIds) ? analysisIds.filter(Boolean) : []
  if (ids.length === 0) return new Map()

  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT * FROM trade_analysis_outcomes WHERE analysisId IN (${placeholders})`,
    )
    .all(...ids)

  return new Map(rows.map((row) => [row.analysisId, mapRow(row)]))
}
