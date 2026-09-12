/**
 * shadowTradeService.js — 가상 포지션 생성·평가
 *
 * 실제 주문 / 거래소 private API / 자동매매는 없다.
 */

import {
  SHADOW_QUICK_ENTRY_REASON,
  SHADOW_STRATEGY_VERSION,
  TRADING_LAB_SYMBOLS,
} from './constants.js'
import { callMarketData } from './marketDataProvider.js'
import { assembleMarketStateInput } from './marketStateService.js'
import { evaluateMarketState } from './marketStateEngine.js'
import {
  buildShadowRiskWarnings,
  decideAutoShadowAction,
  evaluateShadowOutcome,
  resolveShadowDedupBucket,
  signedReturnPct,
  SHADOW_TRADE_DISCLAIMER,
} from './shadowTradeEngine.js'
import {
  countShadowTradesSince,
  findQuickManualInWindow,
  findShadowTradeInDedupWindow,
  getShadowTradeById,
  getShadowTradeOutcome,
  getShadowTradeSettings,
  getShadowTradeStats,
  getOutcomesByShadowTradeIds,
  insertShadowTrade,
  insertShadowTradeCandidate,
  listRecentClosedResults,
  listShadowTradeCandidates,
  listShadowTrades,
  setShadowTradeSettings,
  updateShadowTradeAnnotations,
  updateShadowTradeStatus,
  upsertShadowTradeOutcome,
} from './shadowTradeRepository.js'

function asFinite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/**
 * @param {object} tickerResult
 */
export function readTickerPrice(tickerResult) {
  return (
    asFinite(tickerResult?.data?.lastPrice) ??
    asFinite(tickerResult?.data?.markPrice) ??
    asFinite(tickerResult?.data?.price) ??
    null
  )
}

/**
 * @param {string} symbol
 */
export async function fetchShadowEntryPrice(symbol) {
  const ticker = await callMarketData('getTicker', { symbol })
  return readTickerPrice(ticker)
}

/**
 * @param {string} symbol
 * @param {{ limit?: number }} [options]
 */
export async function fetchShadowCandles(symbol, options = {}) {
  const result = await callMarketData('getCandles', {
    symbol,
    timeframe: '15m',
    limit: options.limit ?? 96,
  })
  return Array.isArray(result?.data?.candles) ? result.data.candles : []
}

/**
 * @param {object} trade
 * @param {import('better-sqlite3').Database} [db]
 */
export function attachShadowRiskContext(trade, db) {
  const createdMs = Date.parse(trade.createdAt)
  const sinceIso = Number.isFinite(createdMs)
    ? new Date(createdMs - 30 * 60 * 1000).toISOString()
    : new Date(0).toISOString()
  const sameDirectionCount30m = countShadowTradesSince(
    {
      symbol: trade.symbol,
      direction: trade.direction,
      sinceIso,
    },
    db,
  )
  const recentClosedResults = listRecentClosedResults({ limit: 3 }, db)
  const noteEmpty = !String(trade.userNote || '').trim()
  return buildShadowRiskWarnings({
    recentClosedResults,
    sameDirectionCount30m,
    noteEmpty:
      trade.source === 'MANUAL_USER'
      && trade.entryReason !== SHADOW_QUICK_ENTRY_REASON
      && noteEmpty,
  })
}

/**
 * @param {object} trade
 * @param {number | null} currentPrice
 * @param {import('better-sqlite3').Database} [db]
 */
export function presentShadowTrade(trade, currentPrice = null, db) {
  const outcome = getShadowTradeOutcome(trade.id, db)
  return {
    ...trade,
    outcome,
    currentReturnPct: signedReturnPct(
      trade.direction,
      trade.entryPrice,
      currentPrice,
    ),
    currentPrice,
    warnings: attachShadowRiskContext(trade, db),
    disclaimer: SHADOW_TRADE_DISCLAIMER,
  }
}

/**
 * @param {object} input
 * @param {{
 *   db?: import('better-sqlite3').Database,
 *   nowMs?: number,
 *   currentPrice?: number | null,
 * }} [options]
 */
export async function createManualShadowTrade(input, options = {}) {
  const db = options.db
  const nowMs = options.nowMs ?? Date.now()
  const createdAt = input.createdAt || new Date(nowMs).toISOString()
  let entryPrice = asFinite(input.entryPrice)
  if (entryPrice == null) {
    entryPrice =
      options.currentPrice ?? (await fetchShadowEntryPrice(input.symbol))
  }
  if (entryPrice == null || entryPrice <= 0) {
    return { ok: false, field: 'entryPrice' }
  }

  const trade = insertShadowTrade(
    {
      ...input,
      source: input.source || 'MANUAL_USER',
      status: 'OPEN',
      createdAt,
      entryPrice,
      entryReason: input.entryReason ?? input.userNote ?? null,
    },
    db,
  )
  return {
    ok: true,
    trade: presentShadowTrade(trade, entryPrice, db),
  }
}

/**
 * 모달 없는 1초 기록. 실제 주문 없음.
 *
 * @param {object} input
 * @param {{
 *   db?: import('better-sqlite3').Database,
 *   nowMs?: number,
 *   currentPrice?: number | null,
 *   assembled?: object,
 *   evaluation?: object,
 * }} [options]
 */
export async function createQuickShadowTrade(input, options = {}) {
  const db = options.db
  const nowMs = options.nowMs ?? Date.now()
  const createdAt = input.createdAt || new Date(nowMs).toISOString()
  const duplicate = findQuickManualInWindow(
    {
      symbol: input.symbol,
      direction: input.direction,
      createdAt,
    },
    db,
  )
  if (duplicate) {
    return {
      ok: false,
      duplicate: true,
      message: '방금 같은 방향을 기록했습니다',
      trade: presentShadowTrade(duplicate, duplicate.entryPrice, db),
    }
  }

  let entryPrice = asFinite(input.entryPrice)
  if (entryPrice == null) {
    entryPrice =
      options.currentPrice ?? (await fetchShadowEntryPrice(input.symbol))
  }
  if (entryPrice == null || entryPrice <= 0) {
    return { ok: false, field: 'entryPrice' }
  }

  let assembled = options.assembled || null
  let evaluation = options.evaluation || null
  if (!assembled || !evaluation) {
    try {
      assembled =
        assembled || (await assembleMarketStateInput(input.symbol, { nowMs }))
      evaluation = evaluation || evaluateMarketState(assembled)
    } catch {
      assembled = assembled || {}
      evaluation = evaluation || {}
    }
  }

  const trade = insertShadowTrade(
    {
      symbol: input.symbol,
      direction: input.direction,
      source: 'MANUAL_USER',
      status: 'OPEN',
      createdAt,
      entryPrice,
      entryReason: SHADOW_QUICK_ENTRY_REASON,
      strategyVersion: SHADOW_STRATEGY_VERSION,
      marketStateObservationId: input.marketStateObservationId ?? null,
      strengthScore: evaluation.strengthScore ?? null,
      primaryState: evaluation.primaryState ?? null,
      secondaryStates: evaluation.secondaryStates || [],
      timeframe15m: evaluation.context?.timeframe15m ?? assembled.structure15m,
      timeframe1h: evaluation.context?.timeframe1h ?? assembled.structure1h,
      timeframe4h: evaluation.context?.timeframe4h ?? assembled.structure4h,
      cvdNotional: assembled.cvdNotional ?? null,
      buySharePct: assembled.buySharePct ?? null,
      sellSharePct: assembled.sellSharePct ?? null,
      oiChangePct: assembled.oiChangePct ?? null,
      fundingRate: assembled.fundingRate ?? null,
      volumeRatio: assembled.volumeRatio ?? null,
      longLiquidationNotional: assembled.longLiquidationNotional ?? null,
      shortLiquidationNotional: assembled.shortLiquidationNotional ?? null,
      userTags: input.userTags || [],
      userNote: input.userNote ?? null,
    },
    db,
  )
  return {
    ok: true,
    trade: presentShadowTrade(trade, entryPrice, db),
  }
}

/**
 * @param {string} id
 * @param {{ userNote?: string | null, userTags?: string[] }} patch
 * @param {{ db?: import('better-sqlite3').Database }} [options]
 */
export async function patchShadowTradeAnnotations(id, patch, options = {}) {
  const db = options.db
  const updated = updateShadowTradeAnnotations(id, patch, db)
  if (!updated) return null
  const currentPrice = await fetchShadowEntryPrice(updated.symbol).catch(
    () => null,
  )
  return presentShadowTrade(updated, currentPrice, db)
}

/**
 * @param {{
 *   symbol: string,
 *   evaluation?: object,
 *   assembled?: object,
 *   nowMs?: number,
 *   db?: import('better-sqlite3').Database,
 *   currentPrice?: number | null,
 * }} input
 */
export async function maybeCreateAutoShadowTrade(input) {
  const db = input.db
  const settings = getShadowTradeSettings(db)
  if (!settings.autoRecord) {
    return { created: false, reason: 'auto_off', trade: null, candidate: null }
  }

  const nowMs = input.nowMs ?? Date.now()
  const assembled =
    input.assembled ||
    (await assembleMarketStateInput(input.symbol, { nowMs, db }))
  const evaluation = input.evaluation || evaluateMarketState(assembled)
  const action = decideAutoShadowAction({
    primaryState: evaluation.primaryState,
    strengthScore: evaluation.strengthScore,
    timeframe4h: evaluation.context?.timeframe4h || assembled.structure4h,
  })

  if (action.action === 'observe') {
    const saved = insertShadowTradeCandidate(
      {
        symbol: input.symbol,
        direction: action.direction,
        primaryState: evaluation.primaryState,
        strengthScore: evaluation.strengthScore,
        evaluatedAt: evaluation.evaluatedAt || new Date(nowMs).toISOString(),
        bucketStart: resolveShadowDedupBucket(
          evaluation.evaluatedAt || new Date(nowMs).toISOString(),
        ),
        reason: action.reason,
      },
      db,
    )
    return {
      created: false,
      reason: 'observe_only',
      trade: null,
      candidate: saved.candidate,
    }
  }

  if (action.action !== 'enter' || !action.direction) {
    return { created: false, reason: 'skip', trade: null, candidate: null }
  }

  const createdAt = new Date(nowMs).toISOString()
  const duplicate = findShadowTradeInDedupWindow(
    {
      symbol: input.symbol,
      direction: action.direction,
      createdAt,
      source: 'AUTO_MARKET_STATE',
    },
    db,
  )
  if (duplicate) {
    return { created: false, reason: 'duplicate', trade: duplicate, candidate: null }
  }

  const entryPrice =
    input.currentPrice ??
    asFinite(assembled.referencePrice) ??
    (await fetchShadowEntryPrice(input.symbol))
  if (entryPrice == null || entryPrice <= 0) {
    return { created: false, reason: 'no_price', trade: null, candidate: null }
  }

  const trade = insertShadowTrade(
    {
      symbol: input.symbol,
      direction: action.direction,
      source: 'AUTO_MARKET_STATE',
      status: 'OPEN',
      createdAt,
      entryPrice,
      entryReason: `${evaluation.primaryState} · 신호 강도 ${evaluation.strengthScore}`,
      marketStateObservationId: input.observationId ?? null,
      strengthScore: evaluation.strengthScore,
      primaryState: evaluation.primaryState,
      secondaryStates: evaluation.secondaryStates || [],
      timeframe15m: evaluation.context?.timeframe15m ?? assembled.structure15m,
      timeframe1h: evaluation.context?.timeframe1h ?? assembled.structure1h,
      timeframe4h: evaluation.context?.timeframe4h ?? assembled.structure4h,
      cvdNotional: assembled.cvdNotional,
      buySharePct: assembled.buySharePct,
      sellSharePct: assembled.sellSharePct,
      oiChangePct: assembled.oiChangePct,
      fundingRate: assembled.fundingRate,
      volumeRatio: assembled.volumeRatio,
      longLiquidationNotional: assembled.longLiquidationNotional,
      shortLiquidationNotional: assembled.shortLiquidationNotional,
    },
    db,
  )

  return {
    created: true,
    reason: 'created',
    trade: presentShadowTrade(trade, entryPrice, db),
    candidate: null,
  }
}

/**
 * @param {{
 *   symbols?: string[],
 *   nowMs?: number,
 *   db?: import('better-sqlite3').Database,
 * }} [options]
 */
export async function processAutoShadowTrades(options = {}) {
  const symbols = options.symbols || [...TRADING_LAB_SYMBOLS]
  const results = []
  for (const symbol of symbols) {
    results.push(
      await maybeCreateAutoShadowTrade({
        symbol,
        nowMs: options.nowMs,
        db: options.db,
      }),
    )
  }
  return results
}

/**
 * @param {object} trade
 * @param {{
 *   nowMs?: number,
 *   currentPrice?: number | null,
 *   candles?: Array<object>,
 *   db?: import('better-sqlite3').Database,
 * }} [options]
 */
export async function evaluateOpenShadowTrade(trade, options = {}) {
  const db = options.db
  const nowMs = options.nowMs ?? Date.now()
  const currentPrice =
    options.currentPrice !== undefined
      ? options.currentPrice
      : await fetchShadowEntryPrice(trade.symbol)
  const candles =
    options.candles !== undefined
      ? options.candles
      : await fetchShadowCandles(trade.symbol)

  const evaluated = evaluateShadowOutcome({
    direction: trade.direction,
    entryPrice: trade.entryPrice,
    createdAt: trade.createdAt,
    nowMs,
    currentPrice,
    candles,
  })

  const outcome = upsertShadowTradeOutcome(
    trade.id,
    {
      evaluatedAt: evaluated.evaluatedAt,
      price1h: evaluated.price1h,
      price4h: evaluated.price4h,
      price12h: evaluated.price12h,
      price24h: evaluated.price24h,
      return1hPct: evaluated.return1hPct,
      return4hPct: evaluated.return4hPct,
      return12hPct: evaluated.return12hPct,
      return24hPct: evaluated.return24hPct,
      maxFavorableMovePct: evaluated.maxFavorableMovePct,
      maxAdverseMovePct: evaluated.maxAdverseMovePct,
      result: evaluated.result,
      feeAdjustedReturnPct: evaluated.feeAdjustedReturnPct,
      assumedFeeBps: evaluated.assumedFeeBps,
      assumedSlippageBps: evaluated.assumedSlippageBps,
    },
    db,
  )

  if (trade.status !== evaluated.status) {
    updateShadowTradeStatus(trade.id, evaluated.status, db)
  }

  return {
    trade: presentShadowTrade(
      getShadowTradeById(trade.id, db),
      currentPrice,
      db,
    ),
    outcome,
    status: evaluated.status,
  }
}

/**
 * @param {{
 *   nowMs?: number,
 *   db?: import('better-sqlite3').Database,
 *   prices?: Record<string, number | null>,
 *   candlesBySymbol?: Record<string, Array<object>>,
 * }} [options]
 */
export async function evaluateOpenShadowTrades(options = {}) {
  const db = options.db
  const open = [
    ...listShadowTrades({ status: 'OPEN', limit: 200 }, db),
    ...listShadowTrades({ status: 'EVALUATING', limit: 200 }, db),
  ]
  const results = []
  for (const trade of open) {
    results.push(
      await evaluateOpenShadowTrade(trade, {
        nowMs: options.nowMs,
        db,
        currentPrice: options.prices?.[trade.symbol],
        candles:
          options.candlesBySymbol?.[trade.symbol] !== undefined
            ? options.candlesBySymbol[trade.symbol]
            : undefined,
      }),
    )
  }
  return results
}

/**
 * @param {{
 *   symbol?: string | null,
 *   status?: string | null,
 *   limit?: number,
 *   db?: import('better-sqlite3').Database,
 *   prices?: Record<string, number | null>,
 * }} [options]
 */
export async function listPresentedShadowTrades(options = {}) {
  const db = options.db
  const trades = listShadowTrades(
    {
      symbol: options.symbol,
      status: options.status,
      limit: options.limit,
    },
    db,
  )
  const outcomes = getOutcomesByShadowTradeIds(
    trades.map((trade) => trade.id),
    db,
  )
  const priceCache = { ...(options.prices || {}) }
  const presented = []
  for (const trade of trades) {
    if (priceCache[trade.symbol] === undefined && !options.prices) {
      priceCache[trade.symbol] = await fetchShadowEntryPrice(trade.symbol)
    }
    const currentPrice = priceCache[trade.symbol] ?? null
    presented.push({
      ...trade,
      outcome: outcomes.get(trade.id) || null,
      currentReturnPct: signedReturnPct(
        trade.direction,
        trade.entryPrice,
        currentPrice,
      ),
      currentPrice,
      warnings: attachShadowRiskContext(trade, db),
      disclaimer: SHADOW_TRADE_DISCLAIMER,
    })
  }
  return presented
}

/**
 * @param {string} id
 * @param {{ db?: import('better-sqlite3').Database }} [options]
 */
export async function getPresentedShadowTrade(id, options = {}) {
  const db = options.db
  const trade = getShadowTradeById(id, db)
  if (!trade) return null
  const currentPrice = await fetchShadowEntryPrice(trade.symbol)
  return presentShadowTrade(trade, currentPrice, db)
}

/**
 * @param {{ symbol?: string | null, db?: import('better-sqlite3').Database }} [options]
 */
export function getPresentedShadowStats(options = {}) {
  const db = options.db
  return {
    ...getShadowTradeStats({ symbol: options.symbol }, db),
    settings: getShadowTradeSettings(db),
    warnings: buildShadowRiskWarnings({
      recentClosedResults: listRecentClosedResults({ limit: 3 }, db),
    }),
    disclaimer: SHADOW_TRADE_DISCLAIMER,
  }
}

export function getPresentedShadowSettings(db) {
  return {
    ...getShadowTradeSettings(db),
    disclaimer: SHADOW_TRADE_DISCLAIMER,
  }
}

export function updatePresentedShadowSettings(input, db) {
  return {
    ...setShadowTradeSettings(input, db),
    disclaimer: SHADOW_TRADE_DISCLAIMER,
  }
}

/**
 * @param {{ symbol?: string | null, db?: import('better-sqlite3').Database }} [options]
 */
export function listPresentedCandidates(options = {}) {
  return listShadowTradeCandidates(
    { symbol: options.symbol, limit: 10 },
    options.db,
  )
}
