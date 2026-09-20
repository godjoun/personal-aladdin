/** Upbit read-only sync persistence. */

import { getDb } from '../db.js'

function mapEpisode(row) {
  if (!row) return null
  return {
    ...row,
    boughtQuantity: Number(row.boughtQuantity) || 0,
    soldQuantity: Number(row.soldQuantity) || 0,
    remainingQuantity: Number(row.remainingQuantity) || 0,
    grossBuyAmount: Number(row.grossBuyAmount) || 0,
    grossSellAmount: Number(row.grossSellAmount) || 0,
    buyFees: Number(row.buyFees) || 0,
    sellFees: Number(row.sellFees) || 0,
    averageEntryPrice: row.averageEntryPrice == null ? null : Number(row.averageEntryPrice),
    averageExitPrice: row.averageExitPrice == null ? null : Number(row.averageExitPrice),
    realizedPnl: row.realizedPnl == null ? null : Number(row.realizedPnl),
    realizedPnlPct: row.realizedPnlPct == null ? null : Number(row.realizedPnlPct),
  }
}

export function upsertUpbitOrder(order, db = getDb()) {
  const existing = db.prepare('SELECT createdAt FROM upbit_order WHERE uuid = ?').get(order.uuid)
  const createdAt = existing?.createdAt || order.updatedAt
  db.prepare(`
    INSERT INTO upbit_order (
      uuid, market, side, orderType, state, orderPrice, volume, remainingVolume,
      executedVolume, executedFunds, paidFee, tradesCount, orderedAt, lastEventAt,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uuid) DO UPDATE SET
      market=excluded.market, side=COALESCE(excluded.side, upbit_order.side),
      orderType=COALESCE(excluded.orderType, upbit_order.orderType),
      state=COALESCE(excluded.state, upbit_order.state),
      orderPrice=COALESCE(excluded.orderPrice, upbit_order.orderPrice),
      volume=COALESCE(excluded.volume, upbit_order.volume),
      remainingVolume=COALESCE(excluded.remainingVolume, upbit_order.remainingVolume),
      executedVolume=MAX(COALESCE(excluded.executedVolume, 0), COALESCE(upbit_order.executedVolume, 0)),
      executedFunds=COALESCE(excluded.executedFunds, upbit_order.executedFunds),
      paidFee=COALESCE(excluded.paidFee, upbit_order.paidFee),
      tradesCount=COALESCE(excluded.tradesCount, upbit_order.tradesCount),
      orderedAt=COALESCE(excluded.orderedAt, upbit_order.orderedAt),
      lastEventAt=COALESCE(excluded.lastEventAt, upbit_order.lastEventAt),
      updatedAt=excluded.updatedAt
  `).run(
    order.uuid, order.market, order.side, order.orderType, order.state,
    order.orderPrice, order.volume, order.remainingVolume, order.executedVolume,
    order.executedFunds, order.paidFee, order.tradesCount, order.orderedAt,
    order.lastEventAt, createdAt, order.updatedAt,
  )
}

export function upsertUpbitExecution(execution, db = getDb()) {
  return db.prepare(`
    INSERT INTO upbit_execution (
      tradeUuid, orderUuid, market, side, price, volume, funds, fee,
      isMaker, tradedAt, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tradeUuid) DO UPDATE SET
      orderUuid=excluded.orderUuid, market=excluded.market, side=excluded.side,
      price=excluded.price, volume=excluded.volume,
      funds=COALESCE(excluded.funds, upbit_execution.funds),
      fee=COALESCE(excluded.fee, upbit_execution.fee),
      isMaker=COALESCE(excluded.isMaker, upbit_execution.isMaker),
      tradedAt=excluded.tradedAt
  `).run(
    execution.tradeUuid, execution.orderUuid, execution.market, execution.side,
    execution.price, execution.volume, execution.funds, execution.fee,
    execution.isMaker, execution.tradedAt, execution.createdAt,
  ).changes
}

export function listUpbitExecutions(db = getDb()) {
  return db.prepare('SELECT * FROM upbit_execution ORDER BY market ASC, tradedAt ASC, tradeUuid ASC').all()
}

export function replaceUpbitEpisodes(episodes, db = getDb()) {
  const run = db.transaction(() => {
    db.prepare('DELETE FROM upbit_trade_episode').run()
    const stmt = db.prepare(`
      INSERT INTO upbit_trade_episode (
        id, market, status, openedAt, closedAt, boughtQuantity, soldQuantity,
        remainingQuantity, grossBuyAmount, grossSellAmount, buyFees, sellFees,
        averageEntryPrice, averageExitPrice, realizedPnl, realizedPnlPct,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const episode of episodes) {
      stmt.run(
        episode.id, episode.market, episode.status, episode.openedAt, episode.closedAt,
        episode.boughtQuantity, episode.soldQuantity, episode.remainingQuantity,
        episode.grossBuyAmount, episode.grossSellAmount, episode.buyFees,
        episode.sellFees, episode.averageEntryPrice, episode.averageExitPrice,
        episode.realizedPnl, episode.realizedPnlPct, episode.createdAt, episode.updatedAt,
      )
    }
  })
  run()
}

export function listUpbitEpisodes(filter = {}, db = getDb()) {
  const where = []
  const params = []
  if (filter.market) { where.push('market = ?'); params.push(filter.market) }
  if (filter.status) { where.push('status = ?'); params.push(filter.status) }
  const limit = Math.min(200, Math.max(1, Number(filter.limit) || 50))
  const offset = Math.max(0, Number(filter.offset) || 0)
  const rows = db.prepare(`
    SELECT * FROM upbit_trade_episode
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY COALESCE(closedAt, openedAt) DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)
  return rows.map(mapEpisode)
}

export function getUpbitEpisodeCount(filter = {}, db = getDb()) {
  const where = []
  const params = []
  if (filter.market) { where.push('market = ?'); params.push(filter.market) }
  if (filter.status) { where.push('status = ?'); params.push(filter.status) }
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM upbit_trade_episode ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`).get(...params)?.n) || 0
}

export function getUpbitSyncState(key, db = getDb()) {
  return db.prepare('SELECT value FROM upbit_sync_state WHERE key = ?').get(key)?.value ?? null
}

export function setUpbitSyncState(key, value, db = getDb()) {
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO upbit_sync_state (key, value, updatedAt) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt`).run(key, String(value), now)
}
