/**
 * strategyCheckService.js — My Strategy v1 점검·저장·가상 기록 연결
 *
 * 실제 주문은 없다.
 */

import {
  STRATEGY_CHECK_DISCLAIMER,
  STRATEGY_CHECK_RESULT_LABELS,
  STRATEGY_CHECKLIST_VERSION,
  STRATEGY_ENTRY_REASON,
  STRATEGY_SCORE_LABEL,
} from './constants.js'
import { assembleMarketStateInput } from './marketStateService.js'
import { evaluateMarketState } from './marketStateEngine.js'
import {
  countShadowTradesSince,
  listRecentClosedResults,
} from './shadowTradeRepository.js'
import { createManualShadowTrade, presentShadowTrade } from './shadowTradeService.js'
import {
  classifyShadowRecordType,
  getShadowRecordTypeLabel,
} from './shadowRecordType.js'
import {
  buildStrategyShadowNote,
  evaluateStrategyChecklist,
} from './strategyChecklistEngine.js'
import { STRATEGY_CHECKLIST_THRESHOLDS } from './strategyChecklistThresholds.js'
import {
  getStrategyCheckById,
  insertStrategyCheck,
  listStrategyChecks,
  updateStrategyCheckShadowTradeId,
} from './strategyCheckRepository.js'
import { listChartAnnotations } from './chartAnnotationRepository.js'

/**
 * @param {object} row
 * @param {object} [evaluation]
 */
export function presentStrategyCheck(row, evaluation = null) {
  if (!row) return null
  const resultLabel =
    evaluation?.resultLabel || STRATEGY_CHECK_RESULT_LABELS[row.result] || row.result
  const recordType = classifyShadowRecordType({
    result: row.result,
    selectedTags: row.selectedTags,
    score: row.score,
  })
  return {
    ...row,
    resultLabel,
    scoreLabel: STRATEGY_SCORE_LABEL,
    categories: evaluation?.categories || null,
    confirmedEvidence: evaluation?.confirmedEvidence || [],
    recordType,
    recordTypeLabel: getShadowRecordTypeLabel(recordType),
    linkedAnnotations: row.autoEvidence?.linkedAnnotations || [],
    disclaimer: STRATEGY_CHECK_DISCLAIMER,
  }
}

/**
 * @param {object} input
 * @param {{
 *   db?: import('better-sqlite3').Database,
 *   nowMs?: number,
 *   assembled?: object,
 *   evaluation?: object,
 *   sameDirectionCount30m?: number,
 *   recentClosedResults?: string[],
 * }} [options]
 */
export async function createStrategyCheck(input, options = {}) {
  const db = options.db
  const nowMs = options.nowMs ?? Date.now()
  const checkedAt = input.checkedAt || new Date(nowMs).toISOString()

  const assembled =
    options.assembled
    ?? (await assembleMarketStateInput(input.symbol, { nowMs, db }))
  const marketEval =
    options.evaluation ?? evaluateMarketState(assembled)

  const sinceIso = new Date(
    nowMs - STRATEGY_CHECKLIST_THRESHOLDS.REENTRY_WINDOW_MS,
  ).toISOString()
  const sameDirectionCount30m =
    options.sameDirectionCount30m
    ?? countShadowTradesSince(
      {
        symbol: input.symbol,
        direction: input.direction,
        sinceIso,
      },
      db,
    )
  const recentClosedResults =
    options.recentClosedResults
    ?? listRecentClosedResults({ limit: 3 }, db)

  const evaluation = evaluateStrategyChecklist({
    direction: input.direction,
    selectedTags: input.selectedTags,
    assembled,
    primaryState: marketEval?.primaryState ?? null,
    sameDirectionCount30m,
    recentClosedResults,
    annotations:
      options.annotations
      ?? listChartAnnotations({ symbol: input.symbol }, db),
    referencePrice: assembled.referencePrice ?? null,
  })

  const row = insertStrategyCheck(
    {
      symbol: input.symbol,
      direction: evaluation.direction,
      checkedAt,
      strategyVersion: STRATEGY_CHECKLIST_VERSION,
      score: evaluation.score,
      result: evaluation.result,
      selectedTags: evaluation.selectedTags,
      autoEvidence: evaluation.autoEvidence,
      missingItems: evaluation.missingItems,
      riskWarnings: evaluation.riskWarnings,
      marketStateSnapshot: {
        ...assembled,
        primaryState: marketEval?.primaryState ?? null,
        strengthScore: marketEval?.strengthScore ?? null,
      },
    },
    db,
  )

  return {
    ok: true,
    check: presentStrategyCheck(row, evaluation),
  }
}

/**
 * @param {string} id
 * @param {{
 *   db?: import('better-sqlite3').Database,
 *   nowMs?: number,
 *   currentPrice?: number | null,
 * }} [options]
 */
export async function createShadowTradeFromStrategyCheck(id, options = {}) {
  const db = options.db
  const check = getStrategyCheckById(id, db)
  if (!check) return { ok: false, notFound: true }

  const snapshot = check.marketStateSnapshot || {}
  const evaluation = evaluateStrategyChecklist({
    direction: check.direction,
    selectedTags: check.selectedTags,
    assembled: snapshot,
    primaryState: snapshot.primaryState ?? check.autoEvidence?.primaryState,
    sameDirectionCount30m: check.autoEvidence?.sameDirectionCount30m,
    recentClosedResults: check.autoEvidence?.recentClosedResults,
    linkedAnnotations: check.autoEvidence?.linkedAnnotations,
    referencePrice: snapshot.referencePrice ?? null,
  })
  const presented = presentStrategyCheck(check, evaluation)
  const userNote = buildStrategyShadowNote(evaluation)
  const recordType = classifyShadowRecordType({
    result: check.result,
    selectedTags: check.selectedTags,
    score: check.score,
  })

  const created = await createManualShadowTrade(
    {
      symbol: check.symbol,
      direction: check.direction,
      source: 'MANUAL_USER',
      entryReason: STRATEGY_ENTRY_REASON,
      userTags: check.selectedTags,
      userNote,
      recordType,
      entryPrice: snapshot.referencePrice ?? null,
      strategyVersion: STRATEGY_CHECKLIST_VERSION,
      primaryState: snapshot.primaryState ?? null,
      strengthScore: snapshot.strengthScore ?? null,
      timeframe15m: snapshot.structure15m ?? null,
      timeframe1h: snapshot.structure1h ?? null,
      timeframe4h: snapshot.structure4h ?? null,
      cvdNotional: snapshot.cvdNotional ?? null,
      buySharePct: snapshot.buySharePct ?? null,
      sellSharePct: snapshot.sellSharePct ?? null,
      oiChangePct: snapshot.oiChangePct ?? null,
      fundingRate: snapshot.fundingRate ?? null,
      volumeRatio: snapshot.volumeRatio ?? null,
      longLiquidationNotional: snapshot.longLiquidationNotional ?? null,
      shortLiquidationNotional: snapshot.shortLiquidationNotional ?? null,
    },
    {
      db,
      nowMs: options.nowMs,
      currentPrice: options.currentPrice ?? snapshot.referencePrice ?? null,
    },
  )
  if (!created.ok) return created

  const linked = updateStrategyCheckShadowTradeId(check.id, created.trade.id, db)
  return {
    ok: true,
    check: presentStrategyCheck(linked, evaluation),
    trade: presentShadowTrade(
      created.trade,
      created.trade.entryPrice ?? options.currentPrice ?? snapshot.referencePrice ?? null,
      db,
    ),
    presented,
  }
}

/**
 * @param {{ symbol?: string, limit?: number }} [params]
 * @param {import('better-sqlite3').Database} [db]
 */
export function listPresentedStrategyChecks(params = {}, db) {
  return listStrategyChecks(params, db).map((row) => {
    const evaluation = evaluateStrategyChecklist({
      direction: row.direction,
      selectedTags: row.selectedTags,
      assembled: row.marketStateSnapshot || {},
      primaryState: row.autoEvidence?.primaryState,
      sameDirectionCount30m: row.autoEvidence?.sameDirectionCount30m,
      recentClosedResults: row.autoEvidence?.recentClosedResults,
      linkedAnnotations: row.autoEvidence?.linkedAnnotations,
      referencePrice: row.marketStateSnapshot?.referencePrice ?? null,
    })
    return presentStrategyCheck(row, evaluation)
  })
}
