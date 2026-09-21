/** Trading Lab Upbit real trade read-only API. */

import express from 'express'
import { getDb } from '../db.js'
import { asListLimit } from './validate.js'
import { getUpbitIntegration } from './upbitIntegration.js'
import {
  deferUpbitReview,
  getUpbitReviewByEpisodeId,
  listPendingUpbitReviewReminders,
  saveUpbitReview,
  validateUpbitReviewBody,
} from './upbitReviewRepository.js'

const STATUS_SET = new Set(['OPEN', 'CLOSED', 'PARTIAL', 'UNKNOWN_BASIS'])

function market(value) {
  if (value == null || value === '') return null
  const normalized = String(value).trim().toUpperCase()
  return /^[A-Z]{2,10}-[A-Z0-9]{2,20}$/.test(normalized) ? normalized : undefined
}

function episodeIdParam(value) {
  const id = String(value || '').trim()
  return id.length >= 8 && id.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null
}

export function createUpbitRouter() {
  const router = express.Router()

  router.get('/status', (_req, res) => {
    const integration = getUpbitIntegration()
    res.status(200).json({
      ok: true,
      status: integration?.getStatus?.() || {
        configured: false,
        connected: false,
        lastMessageAt: null,
        lastExecutionAt: null,
        lastSyncAt: null,
        reconnectCount: 0,
        lastError: null,
      },
    })
  })

  router.post('/sync', async (_req, res) => {
    const integration = getUpbitIntegration()
    if (!integration?.configured) {
      res.status(409).json({ ok: false, code: 'NOT_CONFIGURED', message: 'Upbit integration is not configured' })
      return
    }
    try {
      const result = await integration.sync()
      res.status(200).json({ ok: true, result, status: integration.getStatus() })
    } catch (error) {
      res.status(502).json({
        ok: false,
        code: String(error?.code || 'SYNC_ERROR').slice(0, 80),
        message: 'Upbit synchronization failed',
      })
    }
  })

  router.get('/trades', (req, res) => {
    const integration = getUpbitIntegration()
    const parsedMarket = market(req.query.market)
    if (parsedMarket === undefined) {
      res.status(400).json({ ok: false, message: 'Invalid request', field: 'market' })
      return
    }
    const status = req.query.status == null || req.query.status === ''
      ? null
      : String(req.query.status).trim().toUpperCase()
    if (status && !STATUS_SET.has(status)) {
      res.status(400).json({ ok: false, message: 'Invalid request', field: 'status' })
      return
    }
    const limit = asListLimit(req.query.limit, 50)
    const offset = Number(req.query.offset ?? 0)
    if (limit === null || !Number.isInteger(offset) || offset < 0 || offset > 100_000) {
      res.status(400).json({ ok: false, message: 'Invalid request', field: limit === null ? 'limit' : 'offset' })
      return
    }
    const result = integration?.listTrades?.({
      market: parsedMarket,
      status,
      limit,
      offset,
    }) || { trades: [], total: 0 }
    const pendingReminders = listPendingUpbitReviewReminders(getDb())
    res.status(200).json({ ok: true, ...result, pendingReminders })
  })

  router.get('/quotes', async (req, res) => {
    const markets = String(req.query.markets || '')
      .split(',')
      .map((value) => market(value))
    if (markets.length === 0 || markets.length > 50 || markets.some((value) => !value)) {
      res.status(400).json({ ok: false, message: 'Invalid request', field: 'markets' })
      return
    }
    const integration = getUpbitIntegration()
    try {
      const quotes = await integration?.getQuotes?.([...new Set(markets)]) || []
      res.status(200).json({ ok: true, quotes })
    } catch {
      res.status(502).json({ ok: false, code: 'UPBIT_TICKER_UNAVAILABLE', message: 'Upbit ticker is temporarily unavailable' })
    }
  })

  router.get('/trades/:episodeId/review', (req, res) => {
    const episodeId = episodeIdParam(req.params.episodeId)
    if (!episodeId) {
      res.status(400).json({ ok: false, message: 'Invalid request', field: 'episodeId' })
      return
    }
    const review = getUpbitReviewByEpisodeId(episodeId)
    if (!review) {
      res.status(404).json({ ok: false, message: 'Not found' })
      return
    }
    res.status(200).json({ ok: true, review })
  })

  router.put('/trades/:episodeId/review', (req, res) => {
    const episodeId = episodeIdParam(req.params.episodeId)
    if (!episodeId) {
      res.status(400).json({ ok: false, message: 'Invalid request', field: 'episodeId' })
      return
    }
    const parsed = validateUpbitReviewBody(req.body)
    if (!parsed.ok) {
      res.status(400).json({ ok: false, message: 'Invalid request', field: parsed.field })
      return
    }
    const saved = saveUpbitReview(episodeId, parsed.value)
    if (!saved.ok) {
      res.status(404).json({ ok: false, message: 'Not found' })
      return
    }
    res.status(200).json({ ok: true, review: saved.review })
  })

  router.post('/trades/:episodeId/review/later', (req, res) => {
    const episodeId = episodeIdParam(req.params.episodeId)
    if (!episodeId) {
      res.status(400).json({ ok: false, message: 'Invalid request', field: 'episodeId' })
      return
    }
    const deferred = deferUpbitReview(episodeId)
    if (!deferred.ok) {
      res.status(404).json({ ok: false, message: 'Not found' })
      return
    }
    res.status(200).json({ ok: true, review: deferred.review })
  })

  return router
}
