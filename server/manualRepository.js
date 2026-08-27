/**
 * manualRepository.js — 수동 자산/거래 SQLite (키움 잔고는 저장하지 않음)
 */

import { getDb } from './db.js'

/**
 * @param {object} asset
 * @param {import('better-sqlite3').Database} db
 * @returns {'inserted' | 'skipped'}
 */
function insertAssetIfAbsent(asset, db) {
  if (!asset?.id) return 'skipped'
  const existing = db.prepare('SELECT id FROM manual_assets WHERE id = ?').get(asset.id)
  if (existing) return 'skipped'

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO manual_assets (
      id, name, symbol, assetType, quantity, averageBuyPrice, memo, payloadJson, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    asset.id,
    asset.name ?? '',
    asset.symbol ?? '',
    asset.assetType ?? '',
    asset.quantity ?? null,
    asset.averageBuyPrice ?? null,
    asset.memo ?? '',
    JSON.stringify(asset),
    asset.createdAt || now,
    now,
  )
  return 'inserted'
}

/**
 * @param {object} trade
 * @param {import('better-sqlite3').Database} db
 * @returns {'inserted' | 'skipped'}
 */
function insertTradeIfAbsent(trade, db) {
  if (!trade?.id) return 'skipped'
  const existing = db.prepare('SELECT id FROM manual_trades WHERE id = ?').get(trade.id)
  if (existing) return 'skipped'

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO manual_trades (
      id, assetId, type, quantity, price, tradedAt, payloadJson, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    trade.id,
    trade.assetId ?? null,
    trade.type ?? trade.side ?? null,
    trade.quantity ?? null,
    trade.price ?? null,
    trade.tradedAt || trade.date || null,
    JSON.stringify(trade),
    trade.createdAt || now,
    now,
  )
  return 'inserted'
}

/**
 * 기존 행은 덮어쓰지 않고 없는 ID만 추가
 *
 * @param {Array<object>} assets
 * @param {import('better-sqlite3').Database} [db]
 */
export function mergeManualAssets(assets, db = getDb()) {
  const list = Array.isArray(assets) ? assets : []
  let inserted = 0
  let skipped = 0

  const tx = db.transaction((items) => {
    for (const asset of items) {
      const action = insertAssetIfAbsent(asset, db)
      if (action === 'inserted') inserted += 1
      else skipped += 1
    }
  })
  tx(list)

  return { inserted, skipped, total: listManualAssets(db).length }
}

/**
 * @param {Array<object>} trades
 * @param {import('better-sqlite3').Database} [db]
 */
export function mergeManualTrades(trades, db = getDb()) {
  const list = Array.isArray(trades) ? trades : []
  let inserted = 0
  let skipped = 0

  const tx = db.transaction((items) => {
    for (const trade of items) {
      const action = insertTradeIfAbsent(trade, db)
      if (action === 'inserted') inserted += 1
      else skipped += 1
    }
  })
  tx(list)

  return { inserted, skipped, total: listManualTrades(db).length }
}

/**
 * @param {Array<object>} assets
 * @param {import('better-sqlite3').Database} [db]
 */
export function replaceManualAssets(assets, db = getDb()) {
  const list = Array.isArray(assets) ? assets : []
  const now = new Date().toISOString()

  const tx = db.transaction((items) => {
    db.prepare('DELETE FROM manual_assets').run()
    const insert = db.prepare(
      `INSERT INTO manual_assets (
        id, name, symbol, assetType, quantity, averageBuyPrice, memo, payloadJson, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    for (const asset of items) {
      if (!asset?.id) continue
      insert.run(
        asset.id,
        asset.name ?? '',
        asset.symbol ?? '',
        asset.assetType ?? '',
        asset.quantity ?? null,
        asset.averageBuyPrice ?? null,
        asset.memo ?? '',
        JSON.stringify(asset),
        asset.createdAt || now,
        now,
      )
    }
  })

  tx(list)
  return { total: list.length }
}

/**
 * @param {import('better-sqlite3').Database} [db]
 */
export function listManualAssets(db = getDb()) {
  const rows = db.prepare('SELECT payloadJson FROM manual_assets').all()
  return rows
    .map((row) => {
      try {
        return JSON.parse(row.payloadJson)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/**
 * @param {Array<object>} trades
 * @param {import('better-sqlite3').Database} [db]
 */
export function replaceManualTrades(trades, db = getDb()) {
  const list = Array.isArray(trades) ? trades : []
  const now = new Date().toISOString()

  const tx = db.transaction((items) => {
    db.prepare('DELETE FROM manual_trades').run()
    const insert = db.prepare(
      `INSERT INTO manual_trades (
        id, assetId, type, quantity, price, tradedAt, payloadJson, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    for (const trade of items) {
      if (!trade?.id) continue
      insert.run(
        trade.id,
        trade.assetId ?? null,
        trade.type ?? trade.side ?? null,
        trade.quantity ?? null,
        trade.price ?? null,
        trade.tradedAt || trade.date || null,
        JSON.stringify(trade),
        trade.createdAt || now,
        now,
      )
    }
  })

  tx(list)
  return { total: list.length }
}

/**
 * @param {import('better-sqlite3').Database} [db]
 */
export function listManualTrades(db = getDb()) {
  const rows = db.prepare('SELECT payloadJson FROM manual_trades').all()
  return rows
    .map((row) => {
      try {
        return JSON.parse(row.payloadJson)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}
