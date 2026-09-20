/**
 * Upbit spot executions -> real trade episodes.
 * 평균원가 방식. 과거 매수 근거 없는 매도는 UNKNOWN_BASIS.
 */

import { createHash } from 'crypto'

export const UPBIT_INVENTORY_EPSILON = 1e-12

function deterministicId(...parts) {
  return `upbit-${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)}`
}

function newKnownEpisode(execution, nowIso) {
  return {
    id: deterministicId(execution.market, execution.tradeUuid, 'known'),
    market: execution.market,
    status: 'OPEN',
    openedAt: execution.tradedAt,
    closedAt: null,
    boughtQuantity: 0,
    soldQuantity: 0,
    remainingQuantity: 0,
    grossBuyAmount: 0,
    grossSellAmount: 0,
    buyFees: 0,
    sellFees: 0,
    averageEntryPrice: null,
    averageExitPrice: null,
    realizedPnl: 0,
    realizedPnlPct: null,
    matchedCost: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

function unknownEpisode(execution, quantity, funds, fee, nowIso) {
  return {
    id: deterministicId(execution.market, execution.tradeUuid, 'unknown'),
    market: execution.market,
    status: 'UNKNOWN_BASIS',
    openedAt: null,
    closedAt: execution.tradedAt,
    boughtQuantity: 0,
    soldQuantity: quantity,
    remainingQuantity: 0,
    grossBuyAmount: 0,
    grossSellAmount: funds,
    buyFees: 0,
    sellFees: fee,
    averageEntryPrice: null,
    averageExitPrice: quantity > 0 ? funds / quantity : null,
    realizedPnl: null,
    realizedPnlPct: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

function finishEpisode(episode) {
  const matchedCost = episode.matchedCost || 0
  episode.averageEntryPrice = episode.boughtQuantity > 0
    ? (episode.grossBuyAmount + episode.buyFees) / episode.boughtQuantity
    : null
  episode.averageExitPrice = episode.soldQuantity > 0
    ? episode.grossSellAmount / episode.soldQuantity
    : null
  episode.realizedPnlPct = matchedCost > 0
    ? (episode.realizedPnl / matchedCost) * 100
    : null
  delete episode.matchedCost
  return episode
}

export function buildUpbitTradeEpisodes(executions, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString()
  const grouped = new Map()
  for (const execution of executions || []) {
    if (!grouped.has(execution.market)) grouped.set(execution.market, [])
    grouped.get(execution.market).push(execution)
  }
  const episodes = []
  for (const [market, rows] of grouped) {
    rows.sort((a, b) => a.tradedAt.localeCompare(b.tradedAt) || a.tradeUuid.localeCompare(b.tradeUuid))
    let active = null
    let inventoryQuantity = 0
    let inventoryCost = 0
    for (const execution of rows) {
      const quantity = Number(execution.volume) || 0
      const funds = Number(execution.funds) || Number(execution.price) * quantity
      const fee = Number(execution.fee) || 0
      if (execution.side === 'BID') {
        if (!active || inventoryQuantity <= UPBIT_INVENTORY_EPSILON) {
          active = newKnownEpisode({ ...execution, market }, nowIso)
          episodes.push(active)
          inventoryQuantity = 0
          inventoryCost = 0
        }
        active.boughtQuantity += quantity
        active.grossBuyAmount += funds
        active.buyFees += fee
        active.remainingQuantity += quantity
        active.updatedAt = nowIso
        inventoryQuantity += quantity
        inventoryCost += funds + fee
        continue
      }
      if (execution.side !== 'ASK') continue
      if (!active || inventoryQuantity <= UPBIT_INVENTORY_EPSILON) {
        episodes.push(unknownEpisode(execution, quantity, funds, fee, nowIso))
        continue
      }
      const matched = Math.min(quantity, inventoryQuantity)
      const matchedRatio = quantity > 0 ? matched / quantity : 0
      const averageCost = inventoryQuantity > 0 ? inventoryCost / inventoryQuantity : 0
      const matchedCost = averageCost * matched
      const matchedFunds = funds * matchedRatio
      const matchedFee = fee * matchedRatio
      active.soldQuantity += matched
      active.grossSellAmount += matchedFunds
      active.sellFees += matchedFee
      active.matchedCost += matchedCost
      active.realizedPnl += matchedFunds - matchedFee - matchedCost
      inventoryQuantity -= matched
      inventoryCost -= matchedCost
      if (inventoryQuantity <= UPBIT_INVENTORY_EPSILON) {
        inventoryQuantity = 0
        inventoryCost = 0
        active.remainingQuantity = 0
        active.status = 'CLOSED'
        active.closedAt = execution.tradedAt
      } else {
        active.remainingQuantity = inventoryQuantity
        active.status = 'PARTIAL'
      }
      active.updatedAt = nowIso
      const excess = quantity - matched
      if (excess > UPBIT_INVENTORY_EPSILON) {
        episodes.push(unknownEpisode(
          execution,
          excess,
          funds * (excess / quantity),
          fee * (excess / quantity),
          nowIso,
        ))
      }
      if (active.status === 'CLOSED') active = null
    }
  }
  return episodes.map(finishEpisode)
}
