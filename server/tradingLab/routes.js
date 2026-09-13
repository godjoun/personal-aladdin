/**
 * routes.js — Trading Lab API (분석/기록/복기 전용)
 *
 * 주문·매수·매도·레버리지 endpoint 는 정의하지 않는다.
 * 인증/CSRF 는 server/index.js 에서 라우터 mount 시 적용된다.
 * 오류 응답은 필드명 수준까지만 노출하고 내부 예외는 전달하지 않는다.
 */

import express from 'express'
import { createJournalRouter } from './journalRoutes.js'
import { asId } from '../security/validate.js'
import {
  TRADING_LAB_BIASES,
  TRADING_LAB_LIQUIDATION_SIDES,
  TRADING_LAB_LIQUIDATION_WINDOWS,
  TRADING_LAB_OUTCOME_RESULTS,
  TRADING_LAB_SOURCE_TYPES,
  TRADING_LAB_STRUCTURE_STATES,
  TRADING_LAB_CVD_WINDOWS,
  TRADING_LAB_SYMBOLS,
  TRADING_LAB_TIMEFRAMES,
  CHART_TIMEFRAMES,
  MARKET_STATES,
  MARKET_STATE_HISTORY_LIMIT,
  SHADOW_TRADE_DIRECTIONS,
  SHADOW_TRADE_SOURCES,
  SHADOW_TRADE_STATUSES,
  SHADOW_TRADE_RESULTS,
  SHADOW_TRADE_TAGS,
  SHADOW_TRADE_TAG_LABELS,
  SHADOW_TRADE_DISCLAIMER,
  SHADOW_ASSUMED_FEE_BPS,
  SHADOW_ASSUMED_SLIPPAGE_BPS,
  STRATEGY_CHECKLIST_VERSION,
  STRATEGY_CHECK_RESULTS,
  STRATEGY_CHECK_RESULT_LABELS,
  STRATEGY_CHECK_DISCLAIMER,
  STRATEGY_SCORE_LABEL,
  STRATEGY_LOCATION_TAGS,
  STRATEGY_RISK_TAGS,
  CHART_ANNOTATION_TYPES,
  CHART_ANNOTATION_LABELS,
  CHART_ANNOTATION_DISCLAIMER,
} from './constants.js'
import {
  asBias,
  asChartTimeframe,
  asCvdWindow,
  asLabSymbol,
  asLiquidationSide,
  asLiquidationWindow,
  asListLimit,
  sanitizeAnalysisInput,
  sanitizeLiquidationInput,
  sanitizeOutcomeInput,
  sanitizeScreenshotInput,
  sanitizeShadowSettingsInput,
  sanitizeShadowTradeInput,
  sanitizeShadowTradePatch,
  sanitizeStrategyCheckInput,
  sanitizeChartAnnotationInput,
} from './validate.js'
import {
  createAnalysis,
  deleteAnalysisById,
  getAnalysisById,
  getAnalysisStats,
  listAnalyses,
} from './analysisRepository.js'
import {
  getOutcomeByAnalysisId,
  getOutcomesByAnalysisIds,
  upsertOutcome,
} from './outcomeRepository.js'
import {
  createLiquidationSnapshot,
  getObservedLiquidationSummary,
  listLiquidationSnapshots,
} from './liquidationRepository.js'
import {
  createScreenshot,
  listScreenshotsByAnalysisId,
} from './screenshotRepository.js'
import { getMarketSnapshot } from './marketSnapshotService.js'
import {
  PROVIDER_STATUS,
  callMarketData,
  isMarketDataConfigured,
} from './marketDataProvider.js'
import { getLiquidationCollector } from './liquidationCollector.js'
import { getCvdSummary } from './tradeFlowRepository.js'
import { getTradeFlowCollector } from './tradeFlowCollector.js'
import {
  evaluateCurrentMarketState,
  getMarketStateHistory,
} from './marketStateService.js'
import {
  createManualShadowTrade,
  createQuickShadowTrade,
  evaluateOpenShadowTrades,
  getPresentedShadowSettings,
  getPresentedShadowStats,
  getPresentedShadowTrade,
  listPresentedCandidates,
  listPresentedShadowTrades,
  patchShadowTradeAnnotations,
  processAutoShadowTrades,
  updatePresentedShadowSettings,
} from './shadowTradeService.js'
import {
  createShadowTradeFromStrategyCheck,
  createStrategyCheck,
  listPresentedStrategyChecks,
} from './strategyCheckService.js'
import {
  getChartAnnotationById,
  insertChartAnnotation,
  listChartAnnotations,
  softDeleteChartAnnotation,
  updateChartAnnotation,
} from './chartAnnotationRepository.js'

/**
 * @param {import('express').Response} res
 * @param {string} field
 */
function badRequest(res, field) {
  res.status(400).json({ ok: false, message: 'Invalid request', field })
}

/**
 * @param {import('express').Response} res
 */
function serverError(res) {
  res.status(500).json({ ok: false, message: 'Internal server error' })
}

/**
 * provider 구현체의 내부 오류 문자열이 UI 로 새지 않도록 상태별 문구만 쓴다.
 *
 * @param {string} status
 */
function marketDataMessage(status) {
  if (status === PROVIDER_STATUS.NOT_CONFIGURED) return '데이터 연결 전'
  if (status === PROVIDER_STATUS.INVALID_REQUEST) return 'Invalid request'
  if (status === PROVIDER_STATUS.UNSUPPORTED) return 'Unsupported market data request'
  if (status === PROVIDER_STATUS.ERROR) {
    return '시장 데이터를 불러오지 못했습니다.'
  }
  return null
}

export function createTradingLabRouter() {
  const router = express.Router()
  router.use(createJournalRouter())

  /** 허용값 목록 — 클라이언트가 allowlist 를 하드코딩하지 않도록 제공 */
  router.get('/config', (_req, res) => {
    res.status(200).json({
      ok: true,
      symbols: TRADING_LAB_SYMBOLS,
      timeframes: TRADING_LAB_TIMEFRAMES,
      chartTimeframes: CHART_TIMEFRAMES,
      biases: TRADING_LAB_BIASES,
      outcomeResults: TRADING_LAB_OUTCOME_RESULTS,
      structureStates: TRADING_LAB_STRUCTURE_STATES,
      liquidationSides: TRADING_LAB_LIQUIDATION_SIDES,
      liquidationWindows: TRADING_LAB_LIQUIDATION_WINDOWS,
      cvdWindows: TRADING_LAB_CVD_WINDOWS,
      marketStates: MARKET_STATES,
      sourceTypes: TRADING_LAB_SOURCE_TYPES,
      shadowDirections: SHADOW_TRADE_DIRECTIONS,
      shadowSources: SHADOW_TRADE_SOURCES,
      shadowStatuses: SHADOW_TRADE_STATUSES,
      shadowResults: SHADOW_TRADE_RESULTS,
      shadowTags: SHADOW_TRADE_TAGS,
      shadowTagLabels: SHADOW_TRADE_TAG_LABELS,
      shadowDisclaimer: SHADOW_TRADE_DISCLAIMER,
      assumedFeeBps: SHADOW_ASSUMED_FEE_BPS,
      assumedSlippageBps: SHADOW_ASSUMED_SLIPPAGE_BPS,
      strategyVersion: STRATEGY_CHECKLIST_VERSION,
      strategyCheckResults: STRATEGY_CHECK_RESULTS,
      strategyCheckResultLabels: STRATEGY_CHECK_RESULT_LABELS,
      strategyScoreLabel: STRATEGY_SCORE_LABEL,
      strategyLocationTags: STRATEGY_LOCATION_TAGS,
      strategyRiskTags: STRATEGY_RISK_TAGS,
      strategyCheckDisclaimer: STRATEGY_CHECK_DISCLAIMER,
      chartAnnotationTypes: CHART_ANNOTATION_TYPES,
      chartAnnotationLabels: CHART_ANNOTATION_LABELS,
      chartAnnotationDisclaimer: CHART_ANNOTATION_DISCLAIMER,
      marketDataConfigured: isMarketDataConfigured(),
    })
  })

  /** 시장 상태 — provider 미연결이면 NOT_CONFIGURED */
  router.get('/market/:symbol', async (req, res) => {
    const symbol = asLabSymbol(req.params.symbol)
    if (!symbol) {
      badRequest(res, 'symbol')
      return
    }

    try {
      const snapshot = await getMarketSnapshot(symbol)
      res.status(200).json({ ok: true, market: snapshot })
    } catch {
      console.error('[TradingLab] market snapshot failed')
      serverError(res)
    }
  })

  /** Chart View — Bybit 공개 캔들만. 주문/프라이빗 API 없음 */
  router.get('/market/:symbol/candles', async (req, res) => {
    const symbol = asLabSymbol(req.params.symbol)
    if (!symbol) {
      badRequest(res, 'symbol')
      return
    }

    const timeframe = asChartTimeframe(req.query.timeframe || '1h')
    if (!timeframe) {
      badRequest(res, 'timeframe')
      return
    }

    const limit = asListLimit(req.query.limit, 150)
    if (limit === null) {
      badRequest(res, 'limit')
      return
    }

    try {
      const result = await callMarketData('getCandles', {
        symbol,
        timeframe,
        limit,
      })
      const data = result.data || {}
      res.status(200).json({
        ok: true,
        symbol,
        timeframe,
        status: result.status,
        stale: Boolean(result.stale),
        fetchedAt: result.fetchedAt || null,
        candles: Array.isArray(data.candles) ? data.candles : [],
        structure: data.structure ?? null,
        changePct: typeof data.changePct === 'number' ? data.changePct : null,
        message:
          result.status === PROVIDER_STATUS.OK
            ? null
            : marketDataMessage(result.status),
      })
    } catch {
      console.error('[TradingLab] market candles failed')
      serverError(res)
    }
  })

  router.get('/chart-annotations', (req, res) => {
    const symbol = asLabSymbol(req.query.symbol)
    if (!symbol) {
      badRequest(res, 'symbol')
      return
    }
    const timeframe =
      req.query.timeframe != null && req.query.timeframe !== ''
        ? asChartTimeframe(req.query.timeframe)
        : null
    if (req.query.timeframe != null && req.query.timeframe !== '' && !timeframe) {
      badRequest(res, 'timeframe')
      return
    }

    try {
      res.status(200).json({
        ok: true,
        symbol,
        timeframe,
        annotations: listChartAnnotations({ symbol, timeframe }),
        disclaimer: CHART_ANNOTATION_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] list chart annotations failed')
      serverError(res)
    }
  })

  router.post('/chart-annotations', (req, res) => {
    const parsed = sanitizeChartAnnotationInput(req.body)
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      const annotation = insertChartAnnotation(parsed.value)
      res.status(201).json({
        ok: true,
        annotation,
        disclaimer: CHART_ANNOTATION_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] create chart annotation failed')
      serverError(res)
    }
  })

  router.patch('/chart-annotations/:id', (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      badRequest(res, 'id')
      return
    }
    const parsed = sanitizeChartAnnotationInput(req.body, { partial: true })
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      const current = getChartAnnotationById(id)
      if (!current || current.deletedAt) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      const merged = sanitizeChartAnnotationInput(
        { ...current, ...parsed.value },
      )
      if (!merged.ok) {
        badRequest(res, merged.field)
        return
      }
      const annotation = updateChartAnnotation(id, merged.value)
      if (!annotation) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      res.status(200).json({
        ok: true,
        annotation,
        disclaimer: CHART_ANNOTATION_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] patch chart annotation failed')
      serverError(res)
    }
  })

  router.delete('/chart-annotations/:id', (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      badRequest(res, 'id')
      return
    }

    try {
      const annotation = softDeleteChartAnnotation(id)
      if (!annotation) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      res.status(200).json({
        ok: true,
        annotation,
        disclaimer: CHART_ANNOTATION_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] delete chart annotation failed')
      serverError(res)
    }
  })

  /** 최근 분석 목록 (결과 요약 포함) */
  router.get('/analyses', (req, res) => {
    const symbol = req.query.symbol != null ? asLabSymbol(req.query.symbol) : null
    if (req.query.symbol != null && !symbol) {
      badRequest(res, 'symbol')
      return
    }

    const bias = req.query.bias != null ? asBias(req.query.bias) : null
    if (req.query.bias != null && !bias) {
      badRequest(res, 'bias')
      return
    }

    const limit = asListLimit(req.query.limit, 20)
    if (limit === null) {
      badRequest(res, 'limit')
      return
    }

    try {
      const analyses = listAnalyses({ symbol, bias, limit })
      const outcomes = getOutcomesByAnalysisIds(analyses.map((a) => a.id))
      res.status(200).json({
        ok: true,
        analyses: analyses.map((analysis) => ({
          ...analysis,
          outcome: outcomes.get(analysis.id) || null,
        })),
      })
    } catch {
      console.error('[TradingLab] list analyses failed')
      serverError(res)
    }
  })

  /** 분석 생성 */
  router.post('/analyses', (req, res) => {
    const parsed = sanitizeAnalysisInput(req.body)
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      const analysis = createAnalysis(parsed.value)
      res.status(201).json({ ok: true, analysis })
    } catch {
      console.error('[TradingLab] create analysis failed')
      serverError(res)
    }
  })

  /** 분석 상세 — 당시 시장 데이터 + 판단 + 결과 + 캡처 metadata */
  router.get('/analyses/:id', (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      badRequest(res, 'id')
      return
    }

    try {
      const analysis = getAnalysisById(id)
      if (!analysis) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      res.status(200).json({
        ok: true,
        analysis,
        outcome: getOutcomeByAnalysisId(id),
        screenshots: listScreenshotsByAnalysisId(id),
      })
    } catch {
      console.error('[TradingLab] get analysis failed')
      serverError(res)
    }
  })

  router.delete('/analyses/:id', (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      badRequest(res, 'id')
      return
    }

    try {
      const result = deleteAnalysisById(id)
      if (!result.ok) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      res.status(200).json({ ok: true })
    } catch {
      console.error('[TradingLab] delete analysis failed')
      serverError(res)
    }
  })

  /** 결과 기록 (분석 1건당 1건 upsert) */
  router.put('/analyses/:id/outcome', (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      badRequest(res, 'id')
      return
    }

    const parsed = sanitizeOutcomeInput(req.body)
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      const result = upsertOutcome(id, parsed.value)
      if (!result.ok) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      res.status(200).json({
        ok: true,
        action: result.action,
        outcome: result.outcome,
      })
    } catch {
      console.error('[TradingLab] upsert outcome failed')
      serverError(res)
    }
  })

  /** 차트 캡처 metadata 등록 (이미지 바이트 미저장, AI 분석 미연결) */
  router.post('/analyses/:id/screenshots', (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      badRequest(res, 'id')
      return
    }

    const parsed = sanitizeScreenshotInput(req.body)
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      const result = createScreenshot(parsed.value, id)
      if (!result.ok) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      res.status(201).json({ ok: true, screenshot: result.screenshot })
    } catch {
      console.error('[TradingLab] create screenshot failed')
      serverError(res)
    }
  })

  /** 청산 추정 구간 기록 — 전부 추정치로 취급한다 */
  router.get('/liquidations/status', (_req, res) => {
    const collector = getLiquidationCollector()
    res.status(200).json({
      ok: true,
      collector: collector?.getStatus
        ? collector.getStatus()
        : {
            provider: 'BYBIT',
            connected: false,
            subscribedSymbols: [],
            lastEventAt: null,
            lastMessageAt: null,
            reconnectCount: 0,
          },
    })
  })

  router.get('/liquidations/:symbol', (req, res) => {
    const symbol = asLabSymbol(req.params.symbol)
    if (!symbol) {
      badRequest(res, 'symbol')
      return
    }
    const window = asLiquidationWindow(req.query.window)
    if (!window) {
      badRequest(res, 'window')
      return
    }

    try {
      const summary = getObservedLiquidationSummary({ symbol, window })
      res.status(200).json({ ok: true, ...summary })
    } catch {
      console.error('[TradingLab] observed liquidations failed')
      serverError(res)
    }
  })

  router.get('/liquidations', (req, res) => {
    const symbol = req.query.symbol != null ? asLabSymbol(req.query.symbol) : null
    if (req.query.symbol != null && !symbol) {
      badRequest(res, 'symbol')
      return
    }

    const side = req.query.side != null ? asLiquidationSide(req.query.side) : null
    if (req.query.side != null && !side) {
      badRequest(res, 'side')
      return
    }

    const limit = asListLimit(req.query.limit, 50)
    if (limit === null) {
      badRequest(res, 'limit')
      return
    }

    try {
      res.status(200).json({
        ok: true,
        estimated: true,
        snapshots: listLiquidationSnapshots({ symbol, side, limit }),
      })
    } catch {
      console.error('[TradingLab] list liquidations failed')
      serverError(res)
    }
  })

  router.post('/liquidations', (req, res) => {
    const parsed = sanitizeLiquidationInput(req.body)
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      const snapshot = createLiquidationSnapshot(parsed.value)
      res.status(201).json({ ok: true, snapshot })
    } catch {
      console.error('[TradingLab] create liquidation snapshot failed')
      serverError(res)
    }
  })

  router.get('/cvd/status', (_req, res) => {
    const collector = getTradeFlowCollector()
    res.status(200).json({
      ok: true,
      collector: collector?.getStatus
        ? collector.getStatus()
        : {
            provider: 'BYBIT',
            connected: false,
            subscribedSymbols: [],
            lastTradeAt: null,
            lastMessageAt: null,
            reconnectCount: 0,
          },
    })
  })

  router.get('/cvd/:symbol', (req, res) => {
    const symbol = asLabSymbol(req.params.symbol)
    if (!symbol) {
      badRequest(res, 'symbol')
      return
    }
    const window = asCvdWindow(req.query.window)
    if (!window) {
      badRequest(res, 'window')
      return
    }

    try {
      const summary = getCvdSummary({ symbol, window })
      res.status(200).json({ ok: true, ...summary })
    } catch {
      console.error('[TradingLab] cvd summary failed')
      serverError(res)
    }
  })

  router.get('/market-state/:symbol/history', (req, res) => {
    const symbol = asLabSymbol(req.params.symbol)
    if (!symbol) {
      badRequest(res, 'symbol')
      return
    }
    const limit = asListLimit(req.query.limit, MARKET_STATE_HISTORY_LIMIT)
    if (limit === null) {
      badRequest(res, 'limit')
      return
    }

    try {
      res.status(200).json({
        ok: true,
        symbol,
        observations: getMarketStateHistory(symbol, { limit }),
      })
    } catch {
      console.error('[TradingLab] market state history failed')
      serverError(res)
    }
  })

  router.get('/market-state/:symbol', async (req, res) => {
    const symbol = asLabSymbol(req.params.symbol)
    if (!symbol) {
      badRequest(res, 'symbol')
      return
    }

    try {
      const state = await evaluateCurrentMarketState(symbol)
      res.status(200).json({ ok: true, ...state })
    } catch {
      console.error('[TradingLab] market state evaluate failed')
      serverError(res)
    }
  })

  router.get('/shadow-trades', async (req, res) => {
    const symbol = req.query.symbol != null ? asLabSymbol(req.query.symbol) : null
    if (req.query.symbol != null && !symbol) {
      badRequest(res, 'symbol')
      return
    }
    const status =
      req.query.status != null
        ? String(req.query.status).trim().toUpperCase()
        : null
    if (req.query.status != null && !SHADOW_TRADE_STATUSES.includes(status)) {
      badRequest(res, 'status')
      return
    }
    const limit = asListLimit(req.query.limit, 50)
    if (limit === null) {
      badRequest(res, 'limit')
      return
    }

    try {
      const trades = await listPresentedShadowTrades({ symbol, status, limit })
      res.status(200).json({
        ok: true,
        trades,
        settings: getPresentedShadowSettings(),
        candidates: listPresentedCandidates({ symbol }),
        disclaimer: SHADOW_TRADE_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] list shadow trades failed')
      serverError(res)
    }
  })

  router.post('/shadow-trades', async (req, res) => {
    const parsed = sanitizeShadowTradeInput(req.body)
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      const created = parsed.value.quick
        ? await createQuickShadowTrade(parsed.value)
        : await createManualShadowTrade(parsed.value)
      if (created.duplicate) {
        res.status(409).json({
          ok: false,
          duplicate: true,
          message: created.message,
          trade: created.trade,
          disclaimer: SHADOW_TRADE_DISCLAIMER,
        })
        return
      }
      if (!created.ok) {
        badRequest(res, created.field)
        return
      }
      res.status(201).json({
        ok: true,
        trade: created.trade,
        disclaimer: SHADOW_TRADE_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] create shadow trade failed')
      serverError(res)
    }
  })

  router.get('/shadow-trades/stats', (req, res) => {
    const symbol = req.query.symbol != null ? asLabSymbol(req.query.symbol) : null
    if (req.query.symbol != null && !symbol) {
      badRequest(res, 'symbol')
      return
    }

    try {
      res.status(200).json({
        ok: true,
        stats: getPresentedShadowStats({ symbol }),
        disclaimer: SHADOW_TRADE_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] shadow trade stats failed')
      serverError(res)
    }
  })

  router.get('/shadow-trades/settings', (_req, res) => {
    try {
      res.status(200).json({
        ok: true,
        settings: getPresentedShadowSettings(),
        disclaimer: SHADOW_TRADE_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] shadow trade settings failed')
      serverError(res)
    }
  })

  router.post('/shadow-trades/settings', (req, res) => {
    const parsed = sanitizeShadowSettingsInput(req.body)
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      res.status(200).json({
        ok: true,
        settings: updatePresentedShadowSettings(parsed.value),
        disclaimer: SHADOW_TRADE_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] update shadow settings failed')
      serverError(res)
    }
  })

  router.post('/shadow-trades/evaluate', async (_req, res) => {
    try {
      const evaluated = await evaluateOpenShadowTrades()
      res.status(200).json({
        ok: true,
        evaluated: evaluated.length,
        disclaimer: SHADOW_TRADE_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] evaluate shadow trades failed')
      serverError(res)
    }
  })

  router.post('/shadow-trades/auto', async (_req, res) => {
    try {
      const results = await processAutoShadowTrades()
      res.status(200).json({
        ok: true,
        results: results.map((item) => ({
          created: item.created,
          reason: item.reason,
          tradeId: item.trade?.id || null,
          candidateId: item.candidate?.id || null,
        })),
        disclaimer: SHADOW_TRADE_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] auto shadow trades failed')
      serverError(res)
    }
  })

  router.patch('/shadow-trades/:id', async (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      badRequest(res, 'id')
      return
    }
    const parsed = sanitizeShadowTradePatch(req.body)
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      const trade = await patchShadowTradeAnnotations(id, parsed.value)
      if (!trade) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      res.status(200).json({
        ok: true,
        trade,
        disclaimer: SHADOW_TRADE_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] patch shadow trade failed')
      serverError(res)
    }
  })

  router.get('/shadow-trades/:id', async (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      badRequest(res, 'id')
      return
    }

    try {
      const trade = await getPresentedShadowTrade(id)
      if (!trade) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      res.status(200).json({
        ok: true,
        trade,
        disclaimer: SHADOW_TRADE_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] get shadow trade failed')
      serverError(res)
    }
  })

  router.get('/strategy-checks', (req, res) => {
    const symbol = req.query.symbol != null ? asLabSymbol(req.query.symbol) : null
    if (req.query.symbol != null && !symbol) {
      badRequest(res, 'symbol')
      return
    }
    const limit = asListLimit(req.query.limit, 20)
    if (limit === null) {
      badRequest(res, 'limit')
      return
    }

    try {
      res.status(200).json({
        ok: true,
        checks: listPresentedStrategyChecks({ symbol, limit }),
        disclaimer: STRATEGY_CHECK_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] list strategy checks failed')
      serverError(res)
    }
  })

  router.post('/strategy-checks', async (req, res) => {
    const parsed = sanitizeStrategyCheckInput(req.body)
    if (!parsed.ok) {
      badRequest(res, parsed.field)
      return
    }

    try {
      const created = await createStrategyCheck(parsed.value)
      res.status(201).json({
        ok: true,
        check: created.check,
        disclaimer: STRATEGY_CHECK_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] create strategy check failed')
      serverError(res)
    }
  })

  router.post('/strategy-checks/:id/shadow-trade', async (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      badRequest(res, 'id')
      return
    }

    try {
      const created = await createShadowTradeFromStrategyCheck(id)
      if (created.notFound) {
        res.status(404).json({ ok: false, message: 'Not found' })
        return
      }
      if (!created.ok) {
        badRequest(res, created.field)
        return
      }
      res.status(201).json({
        ok: true,
        check: created.check,
        trade: created.trade,
        disclaimer: STRATEGY_CHECK_DISCLAIMER,
      })
    } catch {
      console.error('[TradingLab] strategy shadow trade failed')
      serverError(res)
    }
  })

  /** 기초 집계 — 조건별 성공률 등 세부 통계는 다음 단계 */
  router.get('/stats', (_req, res) => {
    try {
      res.status(200).json({ ok: true, stats: getAnalysisStats() })
    } catch {
      console.error('[TradingLab] stats failed')
      serverError(res)
    }
  })

  return router
}
