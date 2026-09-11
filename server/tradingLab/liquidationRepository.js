/**
 * liquidationRepository.js — liquidation_snapshot 저장/조회
 *
 * 여기 저장되는 가격 구간은 전부 "추정치"다.
 * source/sourceType 으로 외부 provider 데이터와 자체 추정치를 구분한다.
 * - EXTERNAL: 외부 provider 가 제공한 값
 * - ESTIMATED: 우리 시스템이 계산/추정한 값
 * - MANUAL: 사용자가 직접 입력한 값
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
