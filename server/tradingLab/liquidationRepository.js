/**
 * liquidationRepository.js — liquidation_snapshot 저장/조회
 *
 * 수동/추정 snapshot 과 Bybit 관측 청산을 같은 테이블에 둔다.
 * sourceType 으로 구분한다.
 * - EXTERNAL / ESTIMATED / MANUAL: 기존 추정·입력
 * - OBSERVED_LIQUIDATION: public stream 에서 관측된 실제 청산
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db.js'
import {
  OBSERVED_LIQUIDATION_SOURCE_TYPE,
  TRADING_LAB_LIQUIDATION_WINDOW_MS,
} from './constants.js'
import {
  LIQUIDATION_QUERY_LIMIT,
  aggregateLiquidationBuckets,
  summarizeLiquidationSide,
} from './liquidationEvent.js'

/**
 * @param {object} row
 */
function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    symbol: row.symbol,
    timestamp: row.timestamp,
    referencePrice: row.referencePrice ?? null,
    side: row.side,
    priceLevel: row.priceLevel ?? null,
    estimatedValue: row.estimatedValue ?? null,
    source: row.source ?? null,
    sourceType: row.sourceType,
    note: row.note ?? null,
    createdAt: row.createdAt,
    receivedAt: row.receivedAt ?? row.createdAt,
    quantity: row.quantity ?? null,
    rawSide: row.rawSide ?? null,
    sourceKey: row.sourceKey ?? null,
    price: row.priceLevel ?? null,
    estimatedNotional: row.estimatedValue ?? null,
    liquidatedSide: row.side,
  }
}

/**
 * @param {object} input sanitizeLiquidationInput 을 통과한 값
 * @param {import('better-sqlite3').Database} [db]
 */
export function createLiquidationSnapshot(input, db = getDb()) {
  const now = new Date().toISOString()
  const id = randomUUID()

  db.prepare(
    `INSERT INTO liquidation_snapshot (
      id, symbol, timestamp, referencePrice,
      side, priceLevel, estimatedValue,
      source, sourceType, note, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.symbol,
    input.timestamp || now,
    input.referencePrice ?? null,
    input.side,
    input.priceLevel ?? null,
    input.estimatedValue ?? null,
    input.source ?? null,
    input.sourceType,
    input.note ?? null,
    now,
  )

  const row = db.prepare('SELECT * FROM liquidation_snapshot WHERE id = ?').get(id)
  return mapRow(row)
}

/**
 * @param {{ symbol?: string | null, side?: string | null, limit?: number }} [filter]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listLiquidationSnapshots(filter = {}, db = getDb()) {
  const { symbol = null, side = null, limit = 50 } = filter

  const conditions = []
  const params = []
  if (symbol) {
    conditions.push('symbol = ?')
    params.push(symbol)
  }
  if (side) {
    conditions.push('side = ?')
    params.push(side)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit)

  const rows = db
    .prepare(
      `SELECT * FROM liquidation_snapshot
       ${where}
       ORDER BY timestamp DESC, id DESC
       LIMIT ?`,
    )
    .all(...params)

  return rows.map(mapRow)
}

/**
 * Bybit 관측 청산 저장. sourceKey 중복은 무시한다.
 *
 * @param {object} event normalizeBybitLiquidationEvent 결과
 * @param {import('better-sqlite3').Database} [db]
 * @returns {{ inserted: boolean, event: object | null }}
 */
export function insertObservedLiquidation(event, db = getDb()) {
  const now = event.receivedAt || new Date().toISOString()
  const id = randomUUID()

  const result = db
    .prepare(
      `INSERT OR IGNORE INTO liquidation_snapshot (
        id, symbol, timestamp, referencePrice,
        side, priceLevel, estimatedValue,
        source, sourceType, note, createdAt,
        receivedAt, quantity, rawSide, sourceKey
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      event.symbol,
      event.timestamp,
      null,
      event.liquidatedSide,
      event.price,
      event.estimatedNotional,
      event.source,
      event.sourceType,
      null,
      now,
      event.receivedAt || now,
      event.quantity,
      event.rawSide,
      event.sourceKey,
    )

  if (result.changes === 0) {
    return { inserted: false, event: null }
  }

  const row = db.prepare('SELECT * FROM liquidation_snapshot WHERE id = ?').get(id)
  return { inserted: true, event: mapRow(row) }
}

/**
 * @param {{ symbol: string, window?: string, eventLimit?: number, nowMs?: number }} params
 * @param {import('better-sqlite3').Database} [db]
 */
export function getObservedLiquidationSummary(params, db = getDb()) {
  const window = params.window || '15m'
  const windowMs = TRADING_LAB_LIQUIDATION_WINDOW_MS[window]
  const nowMs = params.nowMs ?? Date.now()
  const since = new Date(nowMs - windowMs).toISOString()
  const eventLimit = Math.min(Math.max(Number(params.eventLimit) || 20, 1), 50)

  const rows = db
    .prepare(
      `SELECT * FROM liquidation_snapshot
       WHERE symbol = ?
         AND sourceType = ?
         AND timestamp >= ?
       ORDER BY timestamp DESC, id DESC
       LIMIT ?`,
    )
    .all(params.symbol, OBSERVED_LIQUIDATION_SOURCE_TYPE, since, LIQUIDATION_QUERY_LIMIT)
    .map(mapRow)

  const longEvents = rows.filter((row) => row.side === 'LONG')
  const shortEvents = rows.filter((row) => row.side === 'SHORT')

  return {
    symbol: params.symbol,
    window,
    observed: true,
    long: summarizeLiquidationSide(longEvents),
    short: summarizeLiquidationSide(shortEvents),
    events: rows.slice(0, eventLimit),
    buckets: aggregateLiquidationBuckets(rows, {
      referencePrice: rows[0]?.price ?? null,
    }),
  }
}
