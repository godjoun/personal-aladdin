/**
 * screenshotRepository.js — 차트 캡처 metadata 저장/조회
 *
 * 이번 단계는 metadata 전용이다.
 * - 이미지 바이트는 저장하지 않는다 (imageRef 는 다음 단계용 참조 슬롯).
 * - AI 이미지 분석은 연결하지 않는다. status 는 PENDING 으로 남는다.
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
    analysisId: row.analysisId ?? null,
    symbol: row.symbol,
    timeframe: row.timeframe,
    capturedAt: row.capturedAt ?? null,
    note: row.note ?? null,
    imageRef: row.imageRef ?? null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * @param {object} input sanitizeScreenshotInput 을 통과한 값
 * @param {string | null} analysisId
 * @param {import('better-sqlite3').Database} [db]
 * @returns {{ ok: false, reason: string } | { ok: true, screenshot: object }}
 */
export function createScreenshot(input, analysisId = null, db = getDb()) {
  if (analysisId) {
    const analysis = db
      .prepare('SELECT id FROM trade_analysis WHERE id = ?')
      .get(analysisId)
    if (!analysis) {
      return { ok: false, reason: 'analysis_not_found' }
    }
  }

  const now = new Date().toISOString()
  const id = randomUUID()

  db.prepare(
    `INSERT INTO trade_analysis_screenshot (
      id, analysisId, symbol, timeframe, capturedAt,
      note, imageRef, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    analysisId,
    input.symbol,
    input.timeframe,
    input.capturedAt ?? now,
    input.note ?? null,
    input.imageRef ?? null,
    input.status || 'PENDING',
    now,
    now,
  )

  const row = db
    .prepare('SELECT * FROM trade_analysis_screenshot WHERE id = ?')
    .get(id)
  return { ok: true, screenshot: mapRow(row) }
}

/**
 * @param {string} analysisId
 * @param {import('better-sqlite3').Database} [db]
 */
export function listScreenshotsByAnalysisId(analysisId, db = getDb()) {
  const rows = db
    .prepare(
      `SELECT * FROM trade_analysis_screenshot
       WHERE analysisId = ?
       ORDER BY createdAt DESC`,
    )
    .all(analysisId)
  return rows.map(mapRow)
}

/**
 * @param {{ symbol?: string | null, limit?: number }} [filter]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listScreenshots(filter = {}, db = getDb()) {
  const { symbol = null, limit = 50 } = filter

  const params = []
  let where = ''
  if (symbol) {
    where = 'WHERE symbol = ?'
    params.push(symbol)
  }
  params.push(limit)

  const rows = db
    .prepare(
      `SELECT * FROM trade_analysis_screenshot
       ${where}
       ORDER BY createdAt DESC
       LIMIT ?`,
    )
    .all(...params)
  return rows.map(mapRow)
}
