/** Trading Lab Upbit real trade read-only API. */

import express from 'express'
import { asListLimit } from './validate.js'
import { getUpbitIntegration } from './upbitIntegration.js'

const STATUS_SET = new Set(['OPEN', 'CLOSED', 'PARTIAL', 'UNKNOWN_BASIS'])

function market(value) {
  if (value == null || value === '') return null
  const normalized = String(value).trim().toUpperCase()
  return /^[A-Z]{2,10}-[A-Z0-9]{2,20}$/.test(normalized) ? normalized : undefined
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
    res.status(200).json({ ok: true, ...result })
  })

  return router
}
