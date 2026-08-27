/**
 * dividendRepository.js — SQLite dividend_events
 */

import { getDb, getMeta, setMeta } from './db.js'

const MIGRATION_FLAG = 'local_dividend_migrated_v1'

function rowToEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    sourceKey: row.sourceKey || null,
    accountType: row.accountType || null,
    symbol: row.symbol || '',
    fundName: row.fundName || '',
    paymentDate: row.paymentDate || null,
    recordDate: row.recordDate || null,
    exDate: row.exDate || null,
    distributionPerShare: row.distributionPerShare,
    quantity: row.quantity,
    expectedAmount: row.expectedAmount,
    confirmedAmount: row.confirmedAmount,
    taxAmount: row.taxAmount,
    status: row.status,
    source: row.source || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * @param {import('better-sqlite3').Database} [db]
 */
export function listDividendEvents(db = getDb()) {
  const rows = db
    .prepare(
      `SELECT * FROM dividend_events
       ORDER BY paymentDate ASC, createdAt ASC`,
    )
    .all()
  return rows.map(rowToEvent)
}

/**
 * sourceKey 또는 id 기준 upsert. KIWOOM 원본은 수동 덮어쓰기 방지(기존 KIWOOM 유지).
 *
 * @param {object} event
 * @param {import('better-sqlite3').Database} [db]
 */
export function upsertDividendEvent(event, db = getDb()) {
  const now = new Date().toISOString()
  const sourceKey = event.sourceKey || null
  const id = event.id || sourceKey || crypto.randomUUID()

  const existingByKey = sourceKey
    ? db.prepare('SELECT * FROM dividend_events WHERE sourceKey = ?').get(sourceKey)
    : null
  const existingById = db.prepare('SELECT * FROM dividend_events WHERE id = ?').get(id)
  const existing = existingByKey || existingById

  if (existing && existing.source === 'KIWOOM' && event.source === 'KIWOOM') {
    // 동일 키움 건: confirmedAmount 등만 갱신(내용 동일 시에도 updatedAt 갱신 가능)
    db.prepare(
      `UPDATE dividend_events SET
        accountType = ?,
        symbol = ?,
        fundName = ?,
        paymentDate = ?,
        confirmedAmount = ?,
        taxAmount = ?,
        status = ?,
        updatedAt = ?
       WHERE id = ?`,
    ).run(
      event.accountType ?? existing.accountType,
      event.symbol ?? existing.symbol,
      event.fundName ?? existing.fundName,
      event.paymentDate ?? existing.paymentDate,
      event.confirmedAmount ?? existing.confirmedAmount,
      event.taxAmount ?? existing.taxAmount,
      event.status ?? existing.status,
      now,
      existing.id,
    )
    return { action: 'updated', event: rowToEvent(db.prepare('SELECT * FROM dividend_events WHERE id = ?').get(existing.id)) }
  }

  if (existing && existing.source === 'KIWOOM' && event.source !== 'KIWOOM') {
    // 수동 수정으로 키움 원본을 덮지 않음
    return { action: 'skipped_kiwoom_readonly', event: rowToEvent(existing) }
  }

  if (existing) {
    db.prepare(
      `UPDATE dividend_events SET
        sourceKey = ?,
        accountType = ?,
        symbol = ?,
        fundName = ?,
        paymentDate = ?,
        recordDate = ?,
        exDate = ?,
        distributionPerShare = ?,
        quantity = ?,
        expectedAmount = ?,
        confirmedAmount = ?,
        taxAmount = ?,
        status = ?,
        source = ?,
        updatedAt = ?
       WHERE id = ?`,
    ).run(
      sourceKey ?? existing.sourceKey,
      event.accountType ?? existing.accountType,
      event.symbol ?? existing.symbol,
      event.fundName ?? existing.fundName,
      event.paymentDate ?? existing.paymentDate,
      event.recordDate ?? existing.recordDate,
      event.exDate ?? existing.exDate,
      event.distributionPerShare ?? existing.distributionPerShare,
      event.quantity ?? existing.quantity,
      event.expectedAmount ?? existing.expectedAmount,
      event.confirmedAmount ?? existing.confirmedAmount,
      event.taxAmount ?? existing.taxAmount,
      event.status ?? existing.status,
      event.source ?? existing.source,
      now,
      existing.id,
    )
    return { action: 'updated', event: rowToEvent(db.prepare('SELECT * FROM dividend_events WHERE id = ?').get(existing.id)) }
  }

  db.prepare(
    `INSERT INTO dividend_events (
      id, sourceKey, accountType, symbol, fundName, paymentDate,
      recordDate, exDate, distributionPerShare, quantity,
      expectedAmount, confirmedAmount, taxAmount, status, source,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sourceKey,
    event.accountType ?? null,
    event.symbol ?? '',
    event.fundName ?? '',
    event.paymentDate ?? null,
    event.recordDate ?? null,
    event.exDate ?? null,
    event.distributionPerShare ?? null,
    event.quantity ?? null,
    event.expectedAmount ?? null,
    event.confirmedAmount ?? null,
    event.taxAmount ?? null,
    event.status || 'PAID',
    event.source ?? null,
    event.createdAt || now,
    now,
  )

  return { action: 'inserted', event: rowToEvent(db.prepare('SELECT * FROM dividend_events WHERE id = ?').get(id)) }
}

/**
 * @param {Array<object>} events
 * @param {import('better-sqlite3').Database} [db]
 */
export function upsertDividendEvents(events, db = getDb()) {
  const list = Array.isArray(events) ? events : []
  let inserted = 0
  let updated = 0
  let skipped = 0

  const tx = db.transaction((items) => {
    for (const item of items) {
      const result = upsertDividendEvent(item, db)
      if (result.action === 'inserted') inserted += 1
      else if (result.action === 'updated') updated += 1
      else skipped += 1
    }
  })

  tx(list)
  return { inserted, updated, skipped, total: listDividendEvents(db).length }
}

/**
 * @param {string} id
 * @param {import('better-sqlite3').Database} [db]
 */
export function deleteDividendEventById(id, db = getDb()) {
  const existing = db.prepare('SELECT * FROM dividend_events WHERE id = ?').get(id)
  if (!existing) {
    return { ok: false, reason: 'not_found' }
  }
  if (existing.source === 'KIWOOM') {
    return { ok: false, reason: 'kiwoom_readonly' }
  }
  db.prepare('DELETE FROM dividend_events WHERE id = ?').run(id)
  return { ok: true }
}

/**
 * localStorage 이관 (1회만)
 * @param {Array<object>} events
 * @param {import('better-sqlite3').Database} [db]
 */
export function migrateLocalDividendsOnce(events, db = getDb()) {
  if (getMeta(db, MIGRATION_FLAG) === '1') {
    return {
      migrated: false,
      reason: 'already_migrated',
      total: listDividendEvents(db).length,
    }
  }

  const result = upsertDividendEvents(Array.isArray(events) ? events : [], db)
  setMeta(db, MIGRATION_FLAG, '1')

  return {
    migrated: true,
    ...result,
  }
}

export function isLocalDividendMigrated(db = getDb()) {
  return getMeta(db, MIGRATION_FLAG) === '1'
}
