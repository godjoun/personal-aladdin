/**
 * marketStateRepository.js — 자동 시장 상태 observation
 *
 * 수동 trade_analysis 와 분리한다.
 * 같은 symbol + 5분 bucket 은 INSERT OR IGNORE 로 한 번만 저장한다.
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db.js'
import { MARKET_STATE_HISTORY_LIMIT } from './constants.js'
import { resolveMarketStateBucketStart } from './marketStateEngine.js'

/**
 * @param {string | null} json
 * @returns {unknown}
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
export function mapMarketStateObservation(row) {
  if (!row) return null
  return {
    id: row.id,
    symbol: row.symbol,
    evaluatedAt: row.evaluatedAt,
    bucketStart: row.bucketStart,
    primaryState: row.primaryState,
    secondaryStates: parseJson(row.secondaryStatesJson, []),
    strengthScore: Number(row.strengthScore) || 0,
    referencePrice: row.referencePrice ?? null,
    priceChange15m: row.priceChange15m ?? null,
    priceChange1h: row.priceChange1h ?? null,
    priceChange4h: row.priceChange4h ?? null,
    volumeRatio: row.volumeRatio ?? null,
    oiChangePct: row.oiChangePct ?? null,
    fundingRate: row.fundingRate ?? null,
    cvdNotional: row.cvdNotional ?? null,
    buySharePct: row.buySharePct ?? null,
    sellSharePct: row.sellSharePct ?? null,
    longLiquidationNotional: row.longLiquidationNotional ?? null,
    shortLiquidationNotional: row.shortLiquidationNotional ?? null,
    evidence: parseJson(row.evidenceJson, []),
    counterEvidence: parseJson(row.counterEvidenceJson, []),
    context: parseJson(row.contextJson, {
      timeframe15m: null,
      timeframe1h: null,
      timeframe4h: null,
    }),
  }
}

/**
 * @param {object} input
 * @param {import('better-sqlite3').Database} [db]
 */
export function insertMarketStateObservation(input, db = getDb()) {
  const evaluatedAt = input.evaluatedAt || new Date().toISOString()
  const bucketStart =
    input.bucketStart || resolveMarketStateBucketStart(evaluatedAt)
  const id = input.id || randomUUID()

  const result = db
    .prepare(
      `INSERT OR IGNORE INTO market_state_observation (
        id, symbol, evaluatedAt, bucketStart, primaryState, secondaryStatesJson,
        strengthScore, referencePrice, priceChange15m, priceChange1h, priceChange4h,
        volumeRatio, oiChangePct, fundingRate, cvdNotional, buySharePct, sellSharePct,
        longLiquidationNotional, shortLiquidationNotional,
        evidenceJson, counterEvidenceJson, contextJson
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?
      )`,
    )
    .run(
      id,
      input.symbol,
      evaluatedAt,
      bucketStart,
      input.primaryState,
      JSON.stringify(input.secondaryStates || []),
      Number(input.strengthScore) || 0,
      input.referencePrice ?? null,
      input.priceChange15m ?? null,
      input.priceChange1h ?? null,
      input.priceChange4h ?? null,
      input.volumeRatio ?? null,
      input.oiChangePct ?? null,
      input.fundingRate ?? null,
      input.cvdNotional ?? null,
      input.buySharePct ?? null,
      input.sellSharePct ?? null,
      input.longLiquidationNotional ?? null,
      input.shortLiquidationNotional ?? null,
      JSON.stringify(input.evidence || []),
      JSON.stringify(input.counterEvidence || []),
      JSON.stringify(
        input.context || {
          timeframe15m: null,
          timeframe1h: null,
          timeframe4h: null,
        },
      ),
    )

  const row = getMarketStateObservationByBucket(
    { symbol: input.symbol, bucketStart },
    db,
  )
  return {
    inserted: result.changes > 0,
    observation: row,
  }
}

/**
 * @param {{ symbol: string, bucketStart: string }} params
 * @param {import('better-sqlite3').Database} [db]
 */
export function getMarketStateObservationByBucket(params, db = getDb()) {
  const row = db
    .prepare(
      `SELECT * FROM market_state_observation
       WHERE symbol = ? AND bucketStart = ?`,
    )
    .get(params.symbol, params.bucketStart)
  return mapMarketStateObservation(row)
}

/**
 * @param {{ symbol: string }} params
 * @param {import('better-sqlite3').Database} [db]
 */
export function getLatestMarketStateObservation(params, db = getDb()) {
  const row = db
    .prepare(
      `SELECT * FROM market_state_observation
       WHERE symbol = ?
       ORDER BY evaluatedAt DESC, id DESC
       LIMIT 1`,
    )
    .get(params.symbol)
  return mapMarketStateObservation(row)
}

/**
 * @param {{ symbol: string, limit?: number }} params
 * @param {import('better-sqlite3').Database} [db]
 */
export function listMarketStateObservations(params, db = getDb()) {
  const limit = Math.min(
    Math.max(Number(params.limit) || MARKET_STATE_HISTORY_LIMIT, 1),
    200,
  )
  return db
    .prepare(
      `SELECT * FROM market_state_observation
       WHERE symbol = ?
       ORDER BY evaluatedAt DESC, id DESC
       LIMIT ?`,
    )
    .all(params.symbol, limit)
    .map(mapMarketStateObservation)
}
