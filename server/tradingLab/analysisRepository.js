/**
 * analysisRepository.js — trade_analysis 저장/조회
 *
 * 시장 snapshot 은 조건별 통계 집계를 위해 개별 컬럼으로 저장하고,
 * 서비스 경계에서는 marketSnapshot 객체로 감싸 노출한다.
 * 모든 쿼리는 parameterized 로 작성한다.
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db.js'

const SNAPSHOT_FIELDS = Object.freeze([
  'volume',
  'volumeZScore',
  'openInterest',
  'openInterestChange',
  'fundingRate',
  'cvd',
  'liquidationAbove',
  'liquidationBelow',
])

/**
 * @param {string | null} json
 * @returns {string[]}
 */
function parseList(json) {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((i) => typeof i === 'string') : []
  } catch {
    return []
  }
}

/**
 * @param {object} row
 */
function mapRow(row) {
  if (!row) return null

  /** @type {Record<string, number | null>} */
  const marketSnapshot = {}
  for (const field of SNAPSHOT_FIELDS) {
    marketSnapshot[field] = row[field] ?? null
  }

  return {
    id: row.id,
    symbol: row.symbol,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    referencePrice: row.referencePrice ?? null,
    bias: row.bias,
    confidence: row.confidence ?? null,
    timeframe15m: row.timeframe15m ?? null,
    timeframe1h: row.timeframe1h ?? null,
    timeframe4h: row.timeframe4h ?? null,
    reasoning: parseList(row.reasoningJson),
    cautions: parseList(row.cautionsJson),
    invalidationPrice: row.invalidationPrice ?? null,
    notes: row.notes ?? null,
    marketSnapshot,
    marketDataStatus: row.marketDataStatus ?? null,
    marketDataSource: row.marketDataSource ?? null,
  }
}

/**
 * @param {object} input sanitizeAnalysisInput 을 통과한 값
 * @param {import('better-sqlite3').Database} [db]
 */
export function createAnalysis(input, db = getDb()) {
  const now = new Date().toISOString()
  const id = randomUUID()
  const snapshot = input.marketSnapshot || {}

  db.prepare(
    `INSERT INTO trade_analysis (
      id, symbol, createdAt, updatedAt, referencePrice,
      bias, confidence,
      timeframe15m, timeframe1h, timeframe4h,
      reasoningJson, cautionsJson, invalidationPrice, notes,
      volume, volumeZScore, openInterest, openInterestChange,
      fundingRate, cvd, liquidationAbove, liquidationBelow,
      marketDataStatus, marketDataSource
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )`,
  ).run(
    id,
    input.symbol,
    now,
    now,
    input.referencePrice ?? null,
    input.bias,
    input.confidence ?? null,
    input.timeframe15m ?? null,
    input.timeframe1h ?? null,
    input.timeframe4h ?? null,
    JSON.stringify(input.reasoning || []),
    JSON.stringify(input.cautions || []),
    input.invalidationPrice ?? null,
    input.notes ?? null,
    snapshot.volume ?? null,
    snapshot.volumeZScore ?? null,
    snapshot.openInterest ?? null,
    snapshot.openInterestChange ?? null,
    snapshot.fundingRate ?? null,
    snapshot.cvd ?? null,
    snapshot.liquidationAbove ?? null,
    snapshot.liquidationBelow ?? null,
    input.marketDataStatus ?? null,
    input.marketDataSource ?? null,
  )

  return getAnalysisById(id, db)
}

/**
 * @param {string} id
 * @param {import('better-sqlite3').Database} [db]
 */
export function getAnalysisById(id, db = getDb()) {
  const row = db.prepare('SELECT * FROM trade_analysis WHERE id = ?').get(id)
  return mapRow(row)
}

/**
 * @param {{ symbol?: string | null, bias?: string | null, limit?: number }} [filter]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listAnalyses(filter = {}, db = getDb()) {
  const { symbol = null, bias = null, limit = 20 } = filter

  const conditions = []
  const params = []
  if (symbol) {
    conditions.push('symbol = ?')
    params.push(symbol)
  }
  if (bias) {
    conditions.push('bias = ?')
    params.push(bias)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit)

  const rows = db
    .prepare(
      `SELECT * FROM trade_analysis
       ${where}
       ORDER BY createdAt DESC, id DESC
       LIMIT ?`,
    )
    .all(...params)

  return rows.map(mapRow)
}

/**
 * @param {string} id
 * @param {import('better-sqlite3').Database} [db]
 */
export function deleteAnalysisById(id, db = getDb()) {
  const result = db.prepare('DELETE FROM trade_analysis WHERE id = ?').run(id)
  return { ok: result.changes > 0 }
}

/**
 * 통계 화면의 기반 집계.
 * 조건별 성공률 같은 세부 분석은 다음 단계에서 이 위에 쌓는다.
 *
 * @param {import('better-sqlite3').Database} [db]
 */
export function getAnalysisStats(db = getDb()) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM trade_analysis').get().n

  const biasRows = db
    .prepare('SELECT bias, COUNT(*) AS n FROM trade_analysis GROUP BY bias')
    .all()

  const resultRows = db
    .prepare(
      `SELECT result, COUNT(*) AS n
       FROM trade_analysis_outcomes
       GROUP BY result`,
    )
    .all()

  /** @type {Record<string, number>} */
  const byBias = { LONG: 0, SHORT: 0, NEUTRAL: 0 }
  for (const row of biasRows) {
    byBias[row.bias] = row.n
  }

  /** @type {Record<string, number>} */
  const byResult = { SUCCESS: 0, FAILURE: 0, NEUTRAL: 0, UNRESOLVED: 0 }
  for (const row of resultRows) {
    byResult[row.result] = row.n
  }

  const resolved =
    byResult.SUCCESS + byResult.FAILURE + byResult.NEUTRAL

  return {
    total,
    byBias,
    byResult,
    resolved,
    unresolved: total - resolved,
  }
}
