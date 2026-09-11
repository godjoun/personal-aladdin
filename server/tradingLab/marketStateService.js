/**
 * marketStateService.js — 시장 snapshot 조합 + 판정 + 기록
 *
 * 기존 collector / provider 는 호출만 하고 수정하지 않는다.
 */

import { getMarketSnapshot } from './marketSnapshotService.js'
import { getCvdSummary } from './tradeFlowRepository.js'
import { getObservedLiquidationSummary } from './liquidationRepository.js'
import { evaluateMarketState, getMarketStateLabel } from './marketStateEngine.js'
import {
  insertMarketStateObservation,
  listMarketStateObservations,
} from './marketStateRepository.js'
import {
  MARKET_STATE_DISCLAIMER,
  MARKET_STATE_HISTORY_LIMIT,
  TRADING_LAB_SYMBOLS,
} from './constants.js'

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asFinite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/**
 * @param {object | null} snapshot
 * @param {string} timeframe
 */
function readTimeframe(snapshot, timeframe) {
  const fromMap = snapshot?.timeframes?.[timeframe]
  if (fromMap) {
    return {
      changePct: asFinite(fromMap.changePct),
      structure: fromMap.structure || fromMap.state || null,
      volumeRatio: asFinite(fromMap.volumeRatio),
    }
  }
  const item = Array.isArray(snapshot?.structure)
    ? snapshot.structure.find((entry) => entry.timeframe === timeframe)
    : null
  return {
    changePct: asFinite(item?.changePct),
    structure: item?.state || item?.structure || null,
    volumeRatio: asFinite(item?.volumeRatio),
  }
}

/**
 * 현재 수집 데이터를 엔진 입력으로 정규화한다.
 *
 * @param {string} symbol
 * @param {{
 *   nowMs?: number,
 *   snapshot?: object | null,
 *   cvd?: object | null,
 *   liquidations?: object | null,
 * }} [options]
 */
export async function assembleMarketStateInput(symbol, options = {}) {
  const nowMs = options.nowMs ?? Date.now()
  const evaluatedAt = new Date(nowMs).toISOString()

  const snapshot =
    options.snapshot !== undefined
      ? options.snapshot
      : await getMarketSnapshot(symbol).catch(() => null)

  const cvd =
    options.cvd !== undefined
      ? options.cvd
      : getCvdSummary({ symbol, window: '15m', nowMs })

  const liquidations =
    options.liquidations !== undefined
      ? options.liquidations
      : getObservedLiquidationSummary({ symbol, window: '15m', nowMs })

  const tf15 = readTimeframe(snapshot, '15m')
  const tf1h = readTimeframe(snapshot, '1h')
  const tf4h = readTimeframe(snapshot, '4h')

  const oiChangePct =
    asFinite(snapshot?.openInterest?.changePct) ??
    asFinite(snapshot?.metrics?.openInterestChangePct?.value)

  const tradeCount = Number(cvd?.tradeCount) || 0
  const cvdNotional = asFinite(cvd?.cvdNotional)
  const hasCvd =
    tradeCount > 0 || (cvdNotional !== null && cvdNotional !== 0)
  const buyNotional = hasCvd ? asFinite(cvd?.buyNotional) : null
  const sellNotional = hasCvd ? asFinite(cvd?.sellNotional) : null
  const totalTradeNotional =
    (buyNotional || 0) + (sellNotional || 0) > 0
      ? (buyNotional || 0) + (sellNotional || 0)
      : null
  const cvdImbalancePct =
    hasCvd && totalTradeNotional
      ? (Math.abs(cvdNotional || 0) / totalTradeNotional) * 100
      : null

  return {
    symbol,
    evaluatedAt,
    referencePrice:
      asFinite(snapshot?.metrics?.price?.value) ??
      asFinite(snapshot?.ticker?.lastPrice) ??
      asFinite(snapshot?.ticker?.price),
    priceChange15m: tf15.changePct,
    priceChange1h: tf1h.changePct,
    priceChange4h: tf4h.changePct,
    structure15m: tf15.structure,
    structure1h: tf1h.structure,
    structure4h: tf4h.structure,
    volumeRatio: tf15.volumeRatio,
    oiChangePct,
    fundingRate:
      asFinite(snapshot?.funding?.rate) ??
      asFinite(snapshot?.metrics?.fundingRate?.value),
    cvdNotional: hasCvd ? cvdNotional : null,
    buyNotional,
    sellNotional,
    totalTradeNotional,
    cvdImbalancePct,
    buySharePct: hasCvd ? asFinite(cvd?.buySharePct) : null,
    sellSharePct: hasCvd ? asFinite(cvd?.sellSharePct) : null,
    tradeCount,
    longLiquidationNotional: asFinite(liquidations?.long?.estimatedNotional) ?? 0,
    shortLiquidationNotional: asFinite(liquidations?.short?.estimatedNotional) ?? 0,
    longLiquidationCount: Number(liquidations?.long?.count) || 0,
    shortLiquidationCount: Number(liquidations?.short?.count) || 0,
  }
}

/**
 * @param {object} evaluation
 * @param {object} assembled
 */
function toObservationPayload(evaluation, assembled) {
  return {
    ...evaluation,
    referencePrice: assembled.referencePrice,
    priceChange15m: assembled.priceChange15m,
    priceChange1h: assembled.priceChange1h,
    priceChange4h: assembled.priceChange4h,
    volumeRatio: assembled.volumeRatio,
    oiChangePct: assembled.oiChangePct,
    fundingRate: assembled.fundingRate,
    cvdNotional: assembled.cvdNotional,
    buySharePct: assembled.buySharePct,
    sellSharePct: assembled.sellSharePct,
    longLiquidationNotional: assembled.longLiquidationNotional,
    shortLiquidationNotional: assembled.shortLiquidationNotional,
  }
}

/**
 * 현재 상태만 평가한다. DB 에 쓰지 않는다.
 *
 * @param {string} symbol
 * @param {object} [options]
 */
export async function evaluateCurrentMarketState(symbol, options = {}) {
  const assembled = await assembleMarketStateInput(symbol, options)
  const evaluation = evaluateMarketState(assembled)
  return {
    ...evaluation,
    primaryStateLabel: getMarketStateLabel(evaluation.primaryState),
    secondaryStateLabels: evaluation.secondaryStates.map(getMarketStateLabel),
    disclaimer: MARKET_STATE_DISCLAIMER,
  }
}

/**
 * recorder 전용. 5분 bucket 에 한 번만 저장한다.
 *
 * @param {string} symbol
 * @param {object} [options]
 */
export async function evaluateAndPersistMarketState(symbol, options = {}) {
  const assembled = await assembleMarketStateInput(symbol, options)
  const evaluation = evaluateMarketState(assembled)
  let persisted = false
  let observation = null
  try {
    const saved = insertMarketStateObservation(
      toObservationPayload(evaluation, assembled),
      options.db,
    )
    persisted = saved.inserted
    observation = saved.observation
  } catch {
    observation = null
  }

  return {
    ...evaluation,
    primaryStateLabel: getMarketStateLabel(evaluation.primaryState),
    secondaryStateLabels: evaluation.secondaryStates.map(getMarketStateLabel),
    disclaimer: MARKET_STATE_DISCLAIMER,
    persisted,
    observation,
  }
}

/**
 * @param {{ symbols?: string[], nowMs?: number, db?: import('better-sqlite3').Database }} [options]
 */
export async function evaluateAndPersistMarketStates(options = {}) {
  const symbols = options.symbols || [...TRADING_LAB_SYMBOLS]
  const results = []
  for (const symbol of symbols) {
    results.push(await evaluateAndPersistMarketState(symbol, options))
  }
  return results
}

/**
 * @param {string} symbol
 * @param {{ limit?: number }} [options]
 */
export function getMarketStateHistory(symbol, options = {}) {
  return listMarketStateObservations({
    symbol,
    limit: options.limit ?? MARKET_STATE_HISTORY_LIMIT,
  })
}
