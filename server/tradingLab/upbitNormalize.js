/** Upbit order / execution payload validation. */

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function positiveNumber(value) {
  const number = finiteNumber(value)
  return number !== null && number > 0 ? number : null
}

function timestampIso(value) {
  if (value === null || value === undefined || value === '') return null
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function normalizeUpbitSide(value) {
  const side = String(value || '').toLowerCase()
  if (side === 'bid' || side === 'buy') return 'BID'
  if (side === 'ask' || side === 'sell') return 'ASK'
  return null
}

export function normalizeUpbitOrder(raw, nowIso = new Date().toISOString()) {
  const uuid = String(raw?.uuid || '').trim()
  const market = String(raw?.market || raw?.code || '').trim().toUpperCase()
  if (!uuid || !market) return null
  return {
    uuid,
    market,
    side: normalizeUpbitSide(raw.side ?? raw.ask_bid),
    orderType: String(raw.ord_type ?? raw.order_type ?? '').trim() || null,
    state: String(raw.state || '').trim().toLowerCase() || null,
    orderPrice: finiteNumber(raw.price),
    volume: finiteNumber(raw.volume),
    remainingVolume: finiteNumber(raw.remaining_volume),
    executedVolume: finiteNumber(raw.executed_volume) ?? 0,
    executedFunds: finiteNumber(raw.executed_funds),
    paidFee: finiteNumber(raw.paid_fee),
    tradesCount: finiteNumber(raw.trades_count),
    orderedAt:
      timestampIso(raw.created_at) ?? timestampIso(raw.order_timestamp) ?? nowIso,
    lastEventAt: timestampIso(raw.timestamp) ?? nowIso,
    updatedAt: nowIso,
  }
}

export function normalizeUpbitExecution(raw, context = {}, nowIso = new Date().toISOString()) {
  const tradeUuid = String(raw?.trade_uuid ?? raw?.uuid ?? '').trim()
  const orderUuid = String(context.orderUuid ?? raw?.order_uuid ?? raw?.uuid ?? '').trim()
  const market = String(context.market ?? raw?.market ?? raw?.code ?? '').trim().toUpperCase()
  const side = normalizeUpbitSide(context.side ?? raw?.side ?? raw?.ask_bid)
  const price = positiveNumber(raw?.price)
  const volume = positiveNumber(raw?.volume)
  const tradedAt =
    timestampIso(raw?.created_at) ?? timestampIso(raw?.trade_timestamp)
  if (!tradeUuid || !orderUuid || !market || !side || !price || !volume || !tradedAt) {
    return null
  }
  return {
    tradeUuid,
    orderUuid,
    market,
    side,
    price,
    volume,
    funds: finiteNumber(raw?.funds ?? raw?.executed_funds) ?? price * volume,
    fee: finiteNumber(raw?.fee ?? raw?.trade_fee) ?? 0,
    isMaker: raw?.is_maker == null ? null : raw.is_maker ? 1 : 0,
    tradedAt,
    createdAt: nowIso,
  }
}

export function extractUpbitOrderExecutions(raw, order, nowIso = new Date().toISOString()) {
  if (!Array.isArray(raw?.trades)) return []
  return raw.trades
    .map((trade) =>
      normalizeUpbitExecution(
        trade,
        { orderUuid: order.uuid, market: order.market, side: order.side },
        nowIso,
      ),
    )
    .filter(Boolean)
}

export function hasExecutedUpbitVolume(order) {
  return Number(order?.executedVolume) > 0
}
