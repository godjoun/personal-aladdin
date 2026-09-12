/**
 * shadowTradeRepository.js — 가상 포지션 기록
 *
 * 실제 주문 id / 계좌 / API key 컬럼은 없다.
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db.js'
import {
  SHADOW_DEDUP_WINDOW_MS,
  SHADOW_STRATEGY_VERSION,
} from './constants.js'
import { resolveShadowDedupBucket } from './shadowTradeEngine.js'

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
export function mapShadowTrade(row) {
  if (!row) return null
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt,
    entryPrice: row.entryPrice,
    entryReason: row.entryReason ?? null,
    strategyVersion: row.strategyVersion,
    marketStateObservationId: row.marketStateObservationId ?? null,
    strengthScore:
      row.strengthScore == null ? null : Number(row.strengthScore),
    primaryState: row.primaryState ?? null,
    secondaryStates: parseJson(row.secondaryStatesJson, []),
    timeframe15m: row.timeframe15m ?? null,
    timeframe1h: row.timeframe1h ?? null,
    timeframe4h: row.timeframe4h ?? null,
    cvdNotional: row.cvdNotional ?? null,
    buySharePct: row.buySharePct ?? null,
    sellSharePct: row.sellSharePct ?? null,
    oiChangePct: row.oiChangePct ?? null,
    fundingRate: row.fundingRate ?? null,
    volumeRatio: row.volumeRatio ?? null,
    longLiquidationNotional: row.longLiquidationNotional ?? null,
    shortLiquidationNotional: row.shortLiquidationNotional ?? null,
    userTags: parseJson(row.userTagsJson, []),
    userNote: row.userNote ?? null,
  }
}

/**
 * @param {object} row
 */
export function mapShadowTradeOutcome(row) {
  if (!row) return null
  return {
    shadowTradeId: row.shadowTradeId,
    evaluatedAt: row.evaluatedAt ?? null,
    price1h: row.price1h ?? null,
    price4h: row.price4h ?? null,
    price12h: row.price12h ?? null,
    price24h: row.price24h ?? null,
    return1hPct: row.return1hPct ?? null,
    return4hPct: row.return4hPct ?? null,
    return12hPct: row.return12hPct ?? null,
    return24hPct: row.return24hPct ?? null,
    maxFavorableMovePct: row.maxFavorableMovePct ?? null,
    maxAdverseMovePct: row.maxAdverseMovePct ?? null,
    result: row.result || 'UNRESOLVED',
    feeAdjustedReturnPct: row.feeAdjustedReturnPct ?? null,
    assumedFeeBps: row.assumedFeeBps ?? null,
    assumedSlippageBps: row.assumedSlippageBps ?? null,
  }
}

/**
 * @param {object} row
 */
export function mapShadowTradeCandidate(row) {
  if (!row) return null
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    primaryState: row.primaryState,
    strengthScore:
      row.strengthScore == null ? null : Number(row.strengthScore),
    evaluatedAt: row.evaluatedAt,
    bucketStart: row.bucketStart,
    reason: row.reason ?? null,
  }
}

/**
 * @param {object} input
 * @param {import('better-sqlite3').Database} [db]
 */
export function insertShadowTrade(input, db = getDb()) {
  const id = input.id || randomUUID()
  const createdAt = input.createdAt || new Date().toISOString()
  db.prepare(
    `INSERT INTO shadow_trade (
      id, symbol, direction, source, status, createdAt, entryPrice, entryReason,
      strategyVersion, marketStateObservationId, strengthScore, primaryState,
      secondaryStatesJson, timeframe15m, timeframe1h, timeframe4h,
      cvdNotional, buySharePct, sellSharePct, oiChangePct, fundingRate,
      volumeRatio, longLiquidationNotional, shortLiquidationNotional,
      userTagsJson, userNote
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?
    )`,
  ).run(
    id,
    input.symbol,
    input.direction,
    input.source,
    input.status || 'OPEN',
    createdAt,
    input.entryPrice,
    input.entryReason ?? null,
    input.strategyVersion || SHADOW_STRATEGY_VERSION,
    input.marketStateObservationId ?? null,
    input.strengthScore ?? null,
    input.primaryState ?? null,
    JSON.stringify(input.secondaryStates || []),
    input.timeframe15m ?? null,
    input.timeframe1h ?? null,
    input.timeframe4h ?? null,
    input.cvdNotional ?? null,
    input.buySharePct ?? null,
    input.sellSharePct ?? null,
    input.oiChangePct ?? null,
    input.fundingRate ?? null,
    input.volumeRatio ?? null,
    input.longLiquidationNotional ?? null,
    input.shortLiquidationNotional ?? null,
    JSON.stringify(input.userTags || []),
    input.userNote ?? null,
  )
  return getShadowTradeById(id, db)
}

/**
 * @param {string} id
 * @param {import('better-sqlite3').Database} [db]
 */
export function getShadowTradeById(id, db = getDb()) {
  const row = db.prepare(`SELECT * FROM shadow_trade WHERE id = ?`).get(id)
  return mapShadowTrade(row)
}

/**
 * @param {string} id
 * @param {string} status
 * @param {import('better-sqlite3').Database} [db]
 */
export function updateShadowTradeStatus(id, status, db = getDb()) {
  db.prepare(`UPDATE shadow_trade SET status = ? WHERE id = ?`).run(status, id)
  return getShadowTradeById(id, db)
}

/**
 * @param {{
 *   symbol?: string | null,
 *   status?: string | null,
 *   limit?: number,
 * }} [params]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listShadowTrades(params = {}, db = getDb()) {
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200)
  const clauses = []
  const values = []
  if (params.symbol) {
    clauses.push('symbol = ?')
    values.push(params.symbol)
  }
  if (params.status) {
    clauses.push('status = ?')
    values.push(params.status)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db
    .prepare(
      `SELECT * FROM shadow_trade
       ${where}
       ORDER BY createdAt DESC, id DESC
       LIMIT ?`,
    )
    .all(...values, limit)
    .map(mapShadowTrade)
}

/**
 * @param {string[]} ids
 * @param {import('better-sqlite3').Database} [db]
 */
export function getOutcomesByShadowTradeIds(ids, db = getDb()) {
  const map = new Map()
  if (!Array.isArray(ids) || ids.length === 0) return map
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT * FROM shadow_trade_outcome WHERE shadowTradeId IN (${placeholders})`,
    )
    .all(...ids)
  for (const row of rows) {
    map.set(row.shadowTradeId, mapShadowTradeOutcome(row))
  }
  return map
}

/**
 * @param {string} id
 * @param {import('better-sqlite3').Database} [db]
 */
export function getShadowTradeOutcome(id, db = getDb()) {
  const row = db
    .prepare(`SELECT * FROM shadow_trade_outcome WHERE shadowTradeId = ?`)
    .get(id)
  return mapShadowTradeOutcome(row)
}

/**
 * @param {string} shadowTradeId
 * @param {object} outcome
 * @param {import('better-sqlite3').Database} [db]
 */
export function upsertShadowTradeOutcome(shadowTradeId, outcome, db = getDb()) {
  const now = new Date().toISOString()
  const existing = getShadowTradeOutcome(shadowTradeId, db)
  if (existing) {
    db.prepare(
      `UPDATE shadow_trade_outcome SET
        evaluatedAt = ?,
        price1h = ?, price4h = ?, price12h = ?, price24h = ?,
        return1hPct = ?, return4hPct = ?, return12hPct = ?, return24hPct = ?,
        maxFavorableMovePct = ?, maxAdverseMovePct = ?,
        result = ?, feeAdjustedReturnPct = ?,
        assumedFeeBps = ?, assumedSlippageBps = ?,
        updatedAt = ?
       WHERE shadowTradeId = ?`,
    ).run(
      outcome.evaluatedAt ?? now,
      outcome.price1h ?? null,
      outcome.price4h ?? null,
      outcome.price12h ?? null,
      outcome.price24h ?? null,
      outcome.return1hPct ?? null,
      outcome.return4hPct ?? null,
      outcome.return12hPct ?? null,
      outcome.return24hPct ?? null,
      outcome.maxFavorableMovePct ?? null,
      outcome.maxAdverseMovePct ?? null,
      outcome.result || 'UNRESOLVED',
      outcome.feeAdjustedReturnPct ?? null,
      outcome.assumedFeeBps ?? null,
      outcome.assumedSlippageBps ?? null,
      now,
      shadowTradeId,
    )
  } else {
    db.prepare(
      `INSERT INTO shadow_trade_outcome (
        shadowTradeId, evaluatedAt,
        price1h, price4h, price12h, price24h,
        return1hPct, return4hPct, return12hPct, return24hPct,
        maxFavorableMovePct, maxAdverseMovePct,
        result, feeAdjustedReturnPct, assumedFeeBps, assumedSlippageBps,
        createdAt, updatedAt
      ) VALUES (
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )`,
    ).run(
      shadowTradeId,
      outcome.evaluatedAt ?? now,
      outcome.price1h ?? null,
      outcome.price4h ?? null,
      outcome.price12h ?? null,
      outcome.price24h ?? null,
      outcome.return1hPct ?? null,
      outcome.return4hPct ?? null,
      outcome.return12hPct ?? null,
      outcome.return24hPct ?? null,
      outcome.maxFavorableMovePct ?? null,
      outcome.maxAdverseMovePct ?? null,
      outcome.result || 'UNRESOLVED',
      outcome.feeAdjustedReturnPct ?? null,
      outcome.assumedFeeBps ?? null,
      outcome.assumedSlippageBps ?? null,
      now,
      now,
    )
  }
  return getShadowTradeOutcome(shadowTradeId, db)
}

/**
 * @param {{ symbol: string, direction: string, createdAt: string, source?: string }} params
 * @param {import('better-sqlite3').Database} [db]
 */
export function findShadowTradeInDedupWindow(params, db = getDb()) {
  const bucketStart = resolveShadowDedupBucket(params.createdAt)
  const bucketEndMs = Date.parse(bucketStart) + SHADOW_DEDUP_WINDOW_MS
  const bucketEnd = new Date(bucketEndMs).toISOString()
  const source = params.source || 'AUTO_MARKET_STATE'
  const row = db
    .prepare(
      `SELECT * FROM shadow_trade
       WHERE symbol = ?
         AND direction = ?
         AND source = ?
         AND createdAt >= ?
         AND createdAt < ?
       ORDER BY createdAt DESC
       LIMIT 1`,
    )
    .get(params.symbol, params.direction, source, bucketStart, bucketEnd)
  return mapShadowTrade(row)
}

/**
 * @param {{ symbol?: string, direction: string, sinceIso: string }} params
 * @param {import('better-sqlite3').Database} [db]
 */
export function countShadowTradesSince(params, db = getDb()) {
  const clauses = ['direction = ?', 'createdAt >= ?']
  const values = [params.direction, params.sinceIso]
  if (params.symbol) {
    clauses.unshift('symbol = ?')
    values.unshift(params.symbol)
  }
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM shadow_trade WHERE ${clauses.join(' AND ')}`,
    )
    .get(...values)
  return Number(row?.count) || 0
}

/**
 * @param {{ limit?: number }} [params]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listRecentClosedResults(params = {}, db = getDb()) {
  const limit = Math.min(Math.max(Number(params.limit) || 3, 1), 20)
  return db
    .prepare(
      `SELECT o.result AS result
       FROM shadow_trade t
       JOIN shadow_trade_outcome o ON o.shadowTradeId = t.id
       WHERE t.status = 'CLOSED'
       ORDER BY t.createdAt DESC, t.id DESC
       LIMIT ?`,
    )
    .all(limit)
    .map((row) => row.result)
}

/**
 * @param {object} input
 * @param {import('better-sqlite3').Database} [db]
 */
export function insertShadowTradeCandidate(input, db = getDb()) {
  const id = input.id || randomUUID()
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO shadow_trade_candidate (
        id, symbol, direction, primaryState, strengthScore,
        evaluatedAt, bucketStart, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.symbol,
      input.direction,
      input.primaryState,
      input.strengthScore ?? null,
      input.evaluatedAt,
      input.bucketStart,
      input.reason ?? null,
    )
  const row = db
    .prepare(
      `SELECT * FROM shadow_trade_candidate
       WHERE symbol = ? AND direction = ? AND bucketStart = ?`,
    )
    .get(input.symbol, input.direction, input.bucketStart)
  return {
    inserted: result.changes > 0,
    candidate: mapShadowTradeCandidate(row),
  }
}

/**
 * @param {{ symbol?: string | null, limit?: number }} [params]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listShadowTradeCandidates(params = {}, db = getDb()) {
  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50)
  if (params.symbol) {
    return db
      .prepare(
        `SELECT * FROM shadow_trade_candidate
         WHERE symbol = ?
         ORDER BY evaluatedAt DESC
         LIMIT ?`,
      )
      .all(params.symbol, limit)
      .map(mapShadowTradeCandidate)
  }
  return db
    .prepare(
      `SELECT * FROM shadow_trade_candidate
       ORDER BY evaluatedAt DESC
       LIMIT ?`,
    )
    .all(limit)
    .map(mapShadowTradeCandidate)
}

/**
 * @param {import('better-sqlite3').Database} [db]
 */
export function getShadowTradeSettings(db = getDb()) {
  const row = db
    .prepare(`SELECT value FROM shadow_trade_setting WHERE key = 'autoRecord'`)
    .get()
  return {
    autoRecord: row?.value === 'true',
  }
}

/**
 * @param {{ autoRecord?: boolean }} input
 * @param {import('better-sqlite3').Database} [db]
 */
export function setShadowTradeSettings(input, db = getDb()) {
  const now = new Date().toISOString()
  if (typeof input.autoRecord === 'boolean') {
    db.prepare(
      `INSERT INTO shadow_trade_setting (key, value, updatedAt)
       VALUES ('autoRecord', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    ).run(input.autoRecord ? 'true' : 'false', now)
  }
  return getShadowTradeSettings(db)
}

/**
 * @param {{ symbol?: string | null }} [params]
 * @param {import('better-sqlite3').Database} [db]
 */
export function getShadowTradeStats(params = {}, db = getDb()) {
  const symbolFilter = params.symbol ? 'WHERE symbol = ?' : ''
  const symbolValues = params.symbol ? [params.symbol] : []
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS openCount,
         SUM(CASE WHEN status = 'EVALUATING' THEN 1 ELSE 0 END) AS evaluatingCount,
         SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) AS closedCount,
         SUM(CASE WHEN direction = 'LONG' THEN 1 ELSE 0 END) AS longCount,
         SUM(CASE WHEN direction = 'SHORT' THEN 1 ELSE 0 END) AS shortCount
       FROM shadow_trade
       ${symbolFilter}`,
    )
    .get(...symbolValues)

  const outcomeWhere = params.symbol
    ? 'WHERE t.symbol = ?'
    : ''
  const averages = db
    .prepare(
      `SELECT
         AVG(o.maxFavorableMovePct) AS averageMfe,
         AVG(o.maxAdverseMovePct) AS averageMae
       FROM shadow_trade_outcome o
       JOIN shadow_trade t ON t.id = o.shadowTradeId
       ${outcomeWhere}`,
    )
    .get(...symbolValues)

  const closedResults = db
    .prepare(
      `SELECT o.result AS result, COUNT(*) AS count
       FROM shadow_trade t
       JOIN shadow_trade_outcome o ON o.shadowTradeId = t.id
       WHERE t.status = 'CLOSED'${params.symbol ? ' AND t.symbol = ?' : ''}
       GROUP BY o.result`,
    )
    .all(...symbolValues)

  const byState = db
    .prepare(
      `SELECT
         COALESCE(t.primaryState, 'UNKNOWN') AS primaryState,
         o.result AS result,
         COUNT(*) AS count
       FROM shadow_trade t
       JOIN shadow_trade_outcome o ON o.shadowTradeId = t.id
       WHERE t.status = 'CLOSED'${params.symbol ? ' AND t.symbol = ?' : ''}
       GROUP BY COALESCE(t.primaryState, 'UNKNOWN'), o.result`,
    )
    .all(...symbolValues)

  const resultShare = { WIN: 0, LOSS: 0, NEUTRAL: 0 }
  let closedResolved = 0
  for (const row of closedResults) {
    if (row.result in resultShare) {
      resultShare[row.result] = Number(row.count) || 0
      closedResolved += Number(row.count) || 0
    }
  }
  const resultSharePct = {
    WIN: closedResolved ? (resultShare.WIN / closedResolved) * 100 : null,
    LOSS: closedResolved ? (resultShare.LOSS / closedResolved) * 100 : null,
    NEUTRAL: closedResolved ? (resultShare.NEUTRAL / closedResolved) * 100 : null,
  }

  /** @type {Record<string, { WIN: number, LOSS: number, NEUTRAL: number, UNRESOLVED: number, total: number }>} */
  const resultsByState = {}
  for (const row of byState) {
    if (!resultsByState[row.primaryState]) {
      resultsByState[row.primaryState] = {
        WIN: 0,
        LOSS: 0,
        NEUTRAL: 0,
        UNRESOLVED: 0,
        total: 0,
      }
    }
    const bucket = resultsByState[row.primaryState]
    const key = row.result
    if (key in bucket) bucket[key] += Number(row.count) || 0
    bucket.total += Number(row.count) || 0
  }

  return {
    total: Number(totals.total) || 0,
    open: Number(totals.openCount) || 0,
    evaluating: Number(totals.evaluatingCount) || 0,
    closed: Number(totals.closedCount) || 0,
    long: Number(totals.longCount) || 0,
    short: Number(totals.shortCount) || 0,
    averageMfe: averages.averageMfe ?? null,
    averageMae: averages.averageMae ?? null,
    resultShare,
    resultSharePct,
    resultsByState,
  }
}
