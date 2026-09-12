/**
 * strategyCheckRepository.js — My Strategy v1 체크 결과 저장
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db.js'
import { STRATEGY_CHECKLIST_VERSION } from './constants.js'

/**
 * @param {string | null} json
 * @param {unknown} fallback
 */
function parseJson(json, fallback) {
  if (!json) return fallback
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

/**
 * @param {object} row
 */
export function mapStrategyCheck(row) {
  if (!row) return null
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    checkedAt: row.checkedAt,
    strategyVersion: row.strategyVersion,
    score: Number(row.score),
    result: row.result,
    selectedTags: parseJson(row.selectedTagsJson, []),
    autoEvidence: parseJson(row.autoEvidenceJson, {}),
    missingItems: parseJson(row.missingItemsJson, []),
    riskWarnings: parseJson(row.riskWarningsJson, []),
    marketStateSnapshot: parseJson(row.marketStateSnapshotJson, null),
    shadowTradeId: row.shadowTradeId ?? null,
  }
}

/**
 * @param {object} input
 * @param {import('better-sqlite3').Database} [db]
 */
export function insertStrategyCheck(input, db = getDb()) {
  const id = input.id || randomUUID()
  db.prepare(
    `INSERT INTO strategy_check (
      id, symbol, direction, checkedAt, strategyVersion, score, result,
      selectedTagsJson, autoEvidenceJson, missingItemsJson, riskWarningsJson,
      marketStateSnapshotJson, shadowTradeId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.symbol,
    input.direction,
    input.checkedAt,
    input.strategyVersion || STRATEGY_CHECKLIST_VERSION,
    input.score,
    input.result,
    JSON.stringify(input.selectedTags || []),
    JSON.stringify(input.autoEvidence || {}),
    JSON.stringify(input.missingItems || []),
    JSON.stringify(input.riskWarnings || []),
    JSON.stringify(input.marketStateSnapshot ?? null),
    input.shadowTradeId ?? null,
  )
  return getStrategyCheckById(id, db)
}

/**
 * @param {string} id
 * @param {import('better-sqlite3').Database} [db]
 */
export function getStrategyCheckById(id, db = getDb()) {
  const row = db.prepare(`SELECT * FROM strategy_check WHERE id = ?`).get(id)
  return mapStrategyCheck(row)
}

/**
 * @param {string} id
 * @param {string} shadowTradeId
 * @param {import('better-sqlite3').Database} [db]
 */
export function updateStrategyCheckShadowTradeId(id, shadowTradeId, db = getDb()) {
  db.prepare(`UPDATE strategy_check SET shadowTradeId = ? WHERE id = ?`).run(
    shadowTradeId,
    id,
  )
  return getStrategyCheckById(id, db)
}

/**
 * @param {string} shadowTradeId
 * @param {import('better-sqlite3').Database} [db]
 */
export function getStrategyCheckByShadowTradeId(shadowTradeId, db = getDb()) {
  if (!shadowTradeId) return null
  const row = db
    .prepare(`SELECT * FROM strategy_check WHERE shadowTradeId = ?`)
    .get(shadowTradeId)
  return mapStrategyCheck(row)
}

/**
 * @param {{ symbol?: string, limit?: number }} [params]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listStrategyChecks(params = {}, db = getDb()) {
  const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100)
  if (params.symbol) {
    return db
      .prepare(
        `SELECT * FROM strategy_check
         WHERE symbol = ?
         ORDER BY checkedAt DESC, id DESC
         LIMIT ?`,
      )
      .all(params.symbol, limit)
      .map(mapStrategyCheck)
  }
  return db
    .prepare(
      `SELECT * FROM strategy_check
       ORDER BY checkedAt DESC, id DESC
       LIMIT ?`,
    )
    .all(limit)
    .map(mapStrategyCheck)
}
