/**
 * chartAnnotationRepository.js — 사용자가 표시한 차트 구간 저장
 *
 * 자동 인식/주문과 무관하다. 삭제는 soft delete.
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db.js'

/**
 * @param {object} row
 */
export function mapChartAnnotation(row) {
  if (!row) return null
  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    annotationType: row.annotationType,
    startTime: row.startTime ?? null,
    endTime: row.endTime ?? null,
    price: row.price == null ? null : Number(row.price),
    topPrice: row.topPrice == null ? null : Number(row.topPrice),
    bottomPrice: row.bottomPrice == null ? null : Number(row.bottomPrice),
    memo: row.memo ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

/**
 * @param {object} input
 * @param {import('better-sqlite3').Database} [db]
 */
export function insertChartAnnotation(input, db = getDb()) {
  const id = input.id || randomUUID()
  const now = input.createdAt || new Date().toISOString()
  db.prepare(
    `INSERT INTO chart_annotation (
      id, symbol, timeframe, annotationType, startTime, endTime,
      price, topPrice, bottomPrice, memo, createdAt, updatedAt, deletedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    input.symbol,
    input.timeframe,
    input.annotationType,
    input.startTime ?? null,
    input.endTime ?? null,
    input.price ?? null,
    input.topPrice ?? null,
    input.bottomPrice ?? null,
    input.memo ?? null,
    now,
    input.updatedAt || now,
  )
  return getChartAnnotationById(id, db)
}

/**
 * @param {string} id
 * @param {import('better-sqlite3').Database} [db]
 */
export function getChartAnnotationById(id, db = getDb()) {
  const row = db.prepare(`SELECT * FROM chart_annotation WHERE id = ?`).get(id)
  return mapChartAnnotation(row)
}

/**
 * @param {{ symbol?: string, timeframe?: string, includeDeleted?: boolean }} [params]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listChartAnnotations(params = {}, db = getDb()) {
  const clauses = []
  const values = []
  if (params.symbol) {
    clauses.push('symbol = ?')
    values.push(params.symbol)
  }
  if (params.timeframe) {
    clauses.push('timeframe = ?')
    values.push(params.timeframe)
  }
  if (!params.includeDeleted) {
    clauses.push('deletedAt IS NULL')
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db
    .prepare(
      `SELECT * FROM chart_annotation
       ${where}
       ORDER BY createdAt DESC, id DESC`,
    )
    .all(...values)
    .map(mapChartAnnotation)
}

/**
 * @param {string} id
 * @param {object} patch
 * @param {import('better-sqlite3').Database} [db]
 */
export function updateChartAnnotation(id, patch, db = getDb()) {
  const current = getChartAnnotationById(id, db)
  if (!current || current.deletedAt) return null
  const next = {
    ...current,
    ...patch,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  }
  db.prepare(
    `UPDATE chart_annotation SET
      annotationType = ?,
      startTime = ?,
      endTime = ?,
      price = ?,
      topPrice = ?,
      bottomPrice = ?,
      memo = ?,
      updatedAt = ?
     WHERE id = ? AND deletedAt IS NULL`,
  ).run(
    next.annotationType,
    next.startTime ?? null,
    next.endTime ?? null,
    next.price ?? null,
    next.topPrice ?? null,
    next.bottomPrice ?? null,
    next.memo ?? null,
    next.updatedAt,
    id,
  )
  return getChartAnnotationById(id, db)
}

/**
 * @param {string} id
 * @param {import('better-sqlite3').Database} [db]
 */
export function softDeleteChartAnnotation(id, db = getDb()) {
  const current = getChartAnnotationById(id, db)
  if (!current || current.deletedAt) return null
  const deletedAt = new Date().toISOString()
  db.prepare(
    `UPDATE chart_annotation
     SET deletedAt = ?, updatedAt = ?
     WHERE id = ? AND deletedAt IS NULL`,
  ).run(deletedAt, deletedAt, id)
  return getChartAnnotationById(id, db)
}
