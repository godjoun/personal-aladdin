/**
 * server/index.js — ALADDIN API 서버 (인증 필수, 조회 전용)
 */

import cors from 'cors'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { config } from 'dotenv'
import { proxyPublicData } from './marketProxy.js'
import { getKiwoomAuthStatus, getKiwoomBalances, searchKiwoomStocks } from './kiwoomClient.js'
import { getKiwoomDividendPayments } from './kiwoomTransactions.js'
import {
  getHoldingsAttentionSummary,
  getStockBriefing,
} from './briefing/stockBriefing.js'
import { getBriefingIntegrationStatus } from './briefing/briefingStatus.js'
import { getDb } from './db.js'
import {
  deleteDividendEventById,
  isLocalDividendMigrated,
  listDividendEvents,
  migrateLocalDividendsOnce,
  upsertDividendEvent,
  upsertDividendEvents,
} from './dividendRepository.js'
import {
  listManualAssets,
  listManualTrades,
  mergeManualAssets,
  mergeManualTrades,
  replaceManualAssets,
  replaceManualTrades,
} from './manualRepository.js'
import { verifyPassword } from './auth/password.js'
import {
  createSession,
  destroySession,
  getSession,
  getSessionCookieName,
  SESSION_TTL_MS,
} from './auth/sessionStore.js'
import {
  checkLoginAllowed,
  getClientIp,
  recordLoginFailure,
  recordLoginSuccess,
} from './auth/rateLimit.js'
import {
  LOGIN_FAIL_MESSAGE,
  LOGIN_LOCK_MESSAGE,
  checkAccountLoginLock,
  clearAccountLoginLockout,
  recordAccountLoginFailure,
} from './auth/loginLockout.js'
import { securityHeaders } from './security/headers.js'
import {
  CSRF_COOKIE,
  createCsrfToken,
  getAllowedOrigins,
  requireCsrf,
} from './security/csrf.js'
import { clearCookie, parseCookieHeader, setCookie } from './security/cookies.js'
import {
  asAccountType,
  asDate,
  asId,
  asNonNegativeNumber,
  asSearchQuery,
  asSymbol,
  asTrimmedString,
  sanitizeDividendEvent,
  sanitizeDividendEvents,
  sanitizeManualAssets,
  sanitizeManualTrades,
} from './security/validate.js'
import {
  getListenHost,
  shouldUseSecureCookies,
} from './listenConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env') })

const isProd = process.env.NODE_ENV === 'production'
const PORT = Number(process.env.PORT || process.env.CENTRAL_PORT) || 3001
const distPath = path.join(__dirname, '..', 'dist')
const LISTEN_HOST = getListenHost()

function authConfigured() {
  const user = process.env.ALADDIN_ADMIN_USERNAME?.trim()
  const hash = process.env.ALADDIN_ADMIN_PASSWORD_HASH?.trim()
  const secret = process.env.ALADDIN_SESSION_SECRET?.trim()
  return Boolean(user && hash && secret && secret.length >= 32)
}

function cookieSecure(req) {
  return shouldUseSecureCookies(req, { isProd })
}

function sendSessionCookie(res, req, sessionId, expiresAt) {
  setCookie(res, getSessionCookieName(), sessionId, {
    httpOnly: true,
    secure: cookieSecure(req),
    sameSite: 'Strict',
    path: '/',
    expires: expiresAt,
    maxAgeMs: SESSION_TTL_MS,
  })
}

function sendCsrfCookie(res, req, token) {
  setCookie(res, CSRF_COOKIE, token, {
    httpOnly: false,
    secure: cookieSecure(req),
    sameSite: 'Strict',
    path: '/',
    maxAgeMs: SESSION_TTL_MS,
  })
}

function readSessionId(req) {
  return req.cookies?.[getSessionCookieName()]
}

function requireAuth(req, res, next) {
  if (!authConfigured()) {
    res.status(503).json({ ok: false, message: 'Authentication is not configured' })
    return
  }
  const session = getSession(readSessionId(req))
  if (!session) {
    res.status(401).json({ ok: false, message: 'Unauthorized' })
    return
  }
  req.user = { username: session.username }
  next()
}

function safeError(res, status = 500) {
  res.status(status).json({ ok: false, message: 'Internal server error' })
}

/**
 * Express 앱 생성 (테스트용 export)
 */
export function createApp() {
  if (!authConfigured() && isProd) {
    throw new Error(
      'Production requires ALADDIN_ADMIN_USERNAME, ALADDIN_ADMIN_PASSWORD_HASH, ALADDIN_SESSION_SECRET',
    )
  }

  // DB 초기화 (production은 persistent path 필수)
  getDb({ isProd })

  const app = express()

  if (process.env.ALADDIN_TRUST_PROXY === '1') {
    app.set('trust proxy', 1)
  }

  app.use(securityHeaders)
  app.use((req, _res, next) => {
    req.cookies = parseCookieHeader(req.headers.cookie)
    next()
  })

  // CORS: production same-origin이면 비활성. 개발은 allowlist만.
  if (!isProd) {
    const origins = getAllowedOrigins()
    app.use(
      cors({
        origin(origin, callback) {
          if (!origin || origins.includes(origin)) {
            callback(null, true)
            return
          }
          callback(new Error('Not allowed by CORS'))
        },
        credentials: true,
      }),
    )
  }

  app.use(express.json({ limit: '256kb' }))

  /** 공개 health — 최소 정보만 */
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true })
  })

  /** CSRF 토큰 발급 */
  app.get('/api/auth/csrf', (req, res) => {
    const token = createCsrfToken()
    sendCsrfCookie(res, req, token)
    res.status(200).json({ ok: true, csrfToken: token })
  })

  /** 로그인 상태 */
  app.get('/api/auth/me', (req, res) => {
    if (!authConfigured()) {
      res.status(503).json({ ok: false, authenticated: false })
      return
    }
    const session = getSession(readSessionId(req))
    if (!session) {
      res.status(401).json({ ok: false, authenticated: false })
      return
    }
    res.status(200).json({ ok: true, authenticated: true, username: session.username })
  })

  /** 로그인 */
  app.post('/api/auth/login', requireCsrf, (req, res) => {
    if (!authConfigured()) {
      res.status(503).json({ ok: false, message: 'Authentication is not configured' })
      return
    }

    const ip = getClientIp(req)
    const limit = checkLoginAllowed(ip)
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec || 60))
      res.status(429).json({ ok: false, message: LOGIN_LOCK_MESSAGE })
      return
    }

    const username =
      typeof req.body?.username === 'string' ? req.body.username.trim().slice(0, 64) : ''
    const password =
      typeof req.body?.password === 'string' ? req.body.password.slice(0, 256) : ''

    const expectedUser = process.env.ALADDIN_ADMIN_USERNAME.trim()
    const expectedHash = process.env.ALADDIN_ADMIN_PASSWORD_HASH.trim()

    // 동일 계정 잠금 — 올바른 비밀번호여도 잠금 중이면 거부
    if (username === expectedUser) {
      const accountLock = checkAccountLoginLock(expectedUser)
      if (accountLock.locked) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((accountLock.lockedUntil - Date.now()) / 1000),
        )
        res.setHeader('Retry-After', String(retryAfterSec))
        res.status(429).json({ ok: false, message: LOGIN_LOCK_MESSAGE })
        return
      }
    }

    const userOk = username === expectedUser
    const passOk = userOk && verifyPassword(password, expectedHash)

    if (!passOk) {
      recordLoginFailure(ip)
      if (userOk) {
        const account = recordAccountLoginFailure(expectedUser)
        if (account.locked) {
          const retryAfterSec = Math.max(
            1,
            Math.ceil(((account.lockedUntil ?? Date.now()) - Date.now()) / 1000),
          )
          res.setHeader('Retry-After', String(retryAfterSec))
          res.status(429).json({ ok: false, message: LOGIN_LOCK_MESSAGE })
          return
        }
      }
      res.status(401).json({ ok: false, message: LOGIN_FAIL_MESSAGE })
      return
    }

    recordLoginSuccess(ip)
    clearAccountLoginLockout(expectedUser)
    const { sessionId, expiresAt } = createSession(expectedUser)
    sendSessionCookie(res, req, sessionId, expiresAt)
    const csrf = createCsrfToken()
    sendCsrfCookie(res, req, csrf)
    res.status(200).json({ ok: true, username: expectedUser, csrfToken: csrf })
  })

  /** 로그아웃 */
  app.post('/api/auth/logout', requireCsrf, (req, res) => {
    destroySession(readSessionId(req))
    clearCookie(res, getSessionCookieName(), { secure: cookieSecure(req) })
    clearCookie(res, CSRF_COOKIE, { secure: cookieSecure(req) })
    // CSRF cookie clear needs non-httpOnly clear
    setCookie(res, CSRF_COOKIE, '', {
      httpOnly: false,
      secure: cookieSecure(req),
      sameSite: 'Strict',
      path: '/',
      maxAgeMs: 0,
      expires: new Date(0),
    })
    res.status(200).json({ ok: true })
  })

  // ─── 이하 전부 API: 인증 필수 ───────────────────────────
  app.use('/api/kiwoom', requireAuth, requireCsrf)
  app.use('/api/dividends', requireAuth, requireCsrf)
  app.use('/api/manual', requireAuth, requireCsrf)
  app.use('/api/public-data', requireAuth, requireCsrf)
  app.use('/api/stocks', requireAuth, requireCsrf)
  app.use('/api/briefing', requireAuth, requireCsrf)

  app.get('/api/public-data', async (req, res) => {
    const service = req.query.service === 'stock' ? 'stock' : 'etf'
    const queryParams = {}
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'service') continue
      if (typeof value === 'string') queryParams[key] = value
    }

    try {
      const data = await proxyPublicData(service, queryParams)
      res.json(data)
    } catch {
      safeError(res, 500)
    }
  })

  app.get('/api/kiwoom/status', async (_req, res) => {
    try {
      const status = await getKiwoomAuthStatus()
      res.status(200).json(status)
    } catch {
      safeError(res, 500)
    }
  })

  app.get('/api/kiwoom/balances', async (_req, res) => {
    try {
      const balances = await getKiwoomBalances()
      res.status(200).json(balances)
    } catch {
      console.error('[Server] kiwoom balance sync failed')
      safeError(res, 500)
    }
  })

  app.get('/api/kiwoom/stocks/search', async (req, res) => {
    const query = asSearchQuery(req.query.q)
    if (!query) {
      res.status(400).json({ ok: false, message: 'Invalid query', results: [] })
      return
    }

    try {
      const results = await searchKiwoomStocks(query, { limit: 10 })
      res.status(200).json(results)
    } catch {
      console.error('[Server] kiwoom stock search failed')
      res.status(503).json({ error: 'Kiwoom stock search is unavailable', results: [] })
    }
  })

  app.get('/api/kiwoom/dividends', async (req, res) => {
    const from = asDate(req.query.from) || '2026-08-01'
    const to = req.query.to != null ? asDate(req.query.to) : undefined
    if (req.query.to != null && !to) {
      res.status(400).json({ ok: false, message: 'Invalid date', dividends: [] })
      return
    }

    try {
      const result = await getKiwoomDividendPayments({ from, to })

      if (result.ok && Array.isArray(result.dividends)) {
        upsertDividendEvents(
          result.dividends.map((item) => ({
            id: item.sourceKey,
            sourceKey: item.sourceKey,
            accountType: item.accountType,
            symbol: item.symbol,
            fundName: item.name,
            paymentDate: item.paymentDate,
            distributionPerShare: 0,
            quantity: 0,
            confirmedAmount: item.amount,
            taxAmount: item.taxAmount,
            status: 'PAID',
            source: 'KIWOOM',
          })),
        )
        if (result.dividends.length > 0) {
          console.log(`[Server] Dividend sync: ${result.dividends.length} event(s)`)
        }
      }

      res.status(200).json({
        ok: result.ok,
        dividends: result.dividends,
        accounts: result.accounts,
      })
    } catch {
      console.error('[Server] kiwoom dividends failed')
      res.status(503).json({
        ok: false,
        error: 'Kiwoom dividends inquiry failed',
        dividends: [],
      })
    }
  })

  /** 종목 브리핑 (잔고/뉴스/공시 — 부분 실패 허용) */
  app.get('/api/stocks/:symbol/briefing', async (req, res) => {
    const symbol = asSymbol(req.params.symbol)
    if (!symbol) {
      res.status(400).json({ ok: false, message: 'Invalid symbol' })
      return
    }
    const stockName = asTrimmedString(req.query.name, 80) || ''
    let holdings = []
    if (typeof req.query.holdings === 'string' && req.query.holdings) {
      try {
        const parsed = JSON.parse(req.query.holdings)
        if (Array.isArray(parsed)) {
          holdings = parsed.slice(0, 8).map((row) => ({
            accountType: asAccountType(row?.accountType),
            quantity: asNonNegativeNumber(row?.quantity),
            averageBuyPrice: asNonNegativeNumber(row?.averageBuyPrice),
            latestPrice: asNonNegativeNumber(row?.latestPrice),
            holdingValue: asNonNegativeNumber(row?.holdingValue),
            profitLoss:
              row?.profitLoss == null || row?.profitLoss === ''
                ? null
                : Number(row.profitLoss),
            profitRate:
              row?.profitRate == null || row?.profitRate === ''
                ? null
                : Number(row.profitRate),
          }))
        }
      } catch {
        holdings = []
      }
    }

    try {
      const briefing = await getStockBriefing(symbol, {
        stockName,
        holdings,
      })
      res.status(200).json(briefing)
    } catch {
      console.error('[Server] stock briefing failed')
      safeError(res, 500)
    }
  })

  app.get('/api/stocks/:symbol/news', async (req, res) => {
    const symbol = asSymbol(req.params.symbol)
    if (!symbol) {
      res.status(400).json({ ok: false, message: 'Invalid symbol', items: [] })
      return
    }
    const stockName = asTrimmedString(req.query.name, 80) || symbol
    try {
      const { fetchNaverNews } = await import('./news/naverNewsProvider.js')
      const result = await fetchNaverNews(stockName, {
        symbol,
        stockName,
        display: 10,
      })
      res.status(200).json(result)
    } catch {
      res.status(200).json({
        ok: false,
        configured: false,
        items: [],
        message: 'News unavailable',
      })
    }
  })

  app.post('/api/stocks/attention-summary', async (req, res) => {
    const raw = Array.isArray(req.body?.holdings) ? req.body.holdings : []
    const holdings = raw
      .slice(0, 20)
      .map((row) => ({
        symbol: asSymbol(row?.symbol) || '',
        name: asTrimmedString(row?.name, 80) || '',
      }))
      .filter((row) => row.symbol || row.name)

    try {
      const summary = await getHoldingsAttentionSummary(holdings, { limit: 5 })
      res.status(200).json(summary)
    } catch {
      res.status(200).json({ ok: true, items: [] })
    }
  })

  /** 브리핑 외부 연동 상태 (키 값 미반환) */
  app.get('/api/briefing/status', async (_req, res) => {
    try {
      const status = await getBriefingIntegrationStatus({
        refreshCorpMap: false,
      })
      if (status.dart && !status.dartCorpMapReady) {
        getBriefingIntegrationStatus({ refreshCorpMap: true }).catch(() => {})
      }
      res.status(200).json({
        kiwoom: Boolean(status.kiwoom),
        naverNews: Boolean(status.naverNews),
        dart: Boolean(status.dart),
        dartCorpMapReady: Boolean(status.dartCorpMapReady),
      })
    } catch {
      res.status(200).json({
        kiwoom: false,
        naverNews: false,
        dart: false,
        dartCorpMapReady: false,
      })
    }
  })

  app.get('/api/dividends', (_req, res) => {
    res.status(200).json({
      ok: true,
      events: listDividendEvents(),
      migrated: isLocalDividendMigrated(),
    })
  })

  app.post('/api/dividends', (req, res) => {
    const raw = Array.isArray(req.body?.events)
      ? req.body.events
      : req.body
        ? [req.body]
        : []
    const events = sanitizeDividendEvents(raw)
    if (!events) {
      res.status(400).json({ ok: false, message: 'Invalid payload' })
      return
    }
    const result = upsertDividendEvents(events)
    res.status(200).json({ ok: true, ...result, events: listDividendEvents() })
  })

  app.post('/api/dividends/migrate-local', (req, res) => {
    const events = sanitizeDividendEvents(
      Array.isArray(req.body?.events) ? req.body.events : [],
    )
    if (!events) {
      res.status(400).json({ ok: false, message: 'Invalid payload' })
      return
    }
    const result = migrateLocalDividendsOnce(events)
    res.status(200).json({ ok: true, ...result, events: listDividendEvents() })
  })

  app.delete('/api/dividends/:id', (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      res.status(400).json({ ok: false, message: 'Invalid id' })
      return
    }
    const result = deleteDividendEventById(id)
    if (!result.ok && result.reason === 'kiwoom_readonly') {
      res.status(403).json({ ok: false, error: 'KIWOOM events are read-only' })
      return
    }
    if (!result.ok) {
      res.status(404).json({ ok: false, error: 'Not found' })
      return
    }
    res.status(200).json({ ok: true, events: listDividendEvents() })
  })

  app.put('/api/dividends/:id', (req, res) => {
    const id = asId(req.params.id)
    if (!id) {
      res.status(400).json({ ok: false, message: 'Invalid id' })
      return
    }
    const existing = listDividendEvents().find((e) => e.id === id)
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Not found' })
      return
    }
    if (existing.source === 'KIWOOM') {
      res.status(403).json({ ok: false, error: 'KIWOOM events are read-only' })
      return
    }

    const patch = sanitizeDividendEvent({ ...existing, ...req.body, id: existing.id })
    if (!patch) {
      res.status(400).json({ ok: false, message: 'Invalid payload' })
      return
    }

    const result = upsertDividendEvent({
      ...existing,
      ...patch,
      id: existing.id,
      source:
        existing.source === 'KIWOOM'
          ? 'KIWOOM'
          : patch.source || existing.source,
    })
    res.status(200).json({ ok: true, event: result.event })
  })

  app.get('/api/manual/assets', (_req, res) => {
    res.status(200).json({ ok: true, assets: listManualAssets() })
  })

  app.put('/api/manual/assets', (req, res) => {
    const assets = sanitizeManualAssets(
      Array.isArray(req.body?.assets) ? req.body.assets : [],
    )
    if (!assets) {
      res.status(400).json({ ok: false, message: 'Invalid payload' })
      return
    }
    const result = replaceManualAssets(assets)
    res.status(200).json({ ok: true, ...result })
  })

  app.get('/api/manual/trades', (_req, res) => {
    res.status(200).json({ ok: true, trades: listManualTrades() })
  })

  app.put('/api/manual/trades', (req, res) => {
    const trades = sanitizeManualTrades(
      Array.isArray(req.body?.trades) ? req.body.trades : [],
    )
    if (!trades) {
      res.status(400).json({ ok: false, message: 'Invalid payload' })
      return
    }
    const result = replaceManualTrades(trades)
    res.status(200).json({ ok: true, ...result })
  })

  app.post('/api/manual/merge', (req, res) => {
    const assets = sanitizeManualAssets(
      Array.isArray(req.body?.assets) ? req.body.assets : [],
    )
    const trades = sanitizeManualTrades(
      Array.isArray(req.body?.trades) ? req.body.trades : [],
    )
    if (!assets || !trades) {
      res.status(400).json({ ok: false, message: 'Invalid payload' })
      return
    }
    const assetResult = mergeManualAssets(assets)
    const tradeResult = mergeManualTrades(trades)
    res.status(200).json({
      ok: true,
      assets: assetResult,
      trades: tradeResult,
      lists: {
        assets: listManualAssets(),
        trades: listManualTrades(),
      },
    })
  })

  // SQLite / server/data 경로 정적 제공 금지 — dist만
  if (isProd) {
    if (!fs.existsSync(distPath) || !fs.existsSync(path.join(distPath, 'index.html'))) {
      throw new Error(
        'Production requires dist/ (run npm run build before npm start)',
      )
    }

    app.use(express.static(distPath, { index: false, dotfiles: 'deny' }))

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next()
        return
      }
      // data/sqlite 경로 차단
      if (/\.sqlite/i.test(req.path) || req.path.includes('/data/')) {
        res.status(404).end()
        return
      }
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  app.use((err, _req, res, _next) => {
    if (err?.message === 'Not allowed by CORS') {
      res.status(403).json({ ok: false, message: 'Forbidden' })
      return
    }
    console.error('[Server] request failed')
    safeError(res, 500)
  })

  return app
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  try {
    const app = createApp()
    app.listen(PORT, LISTEN_HOST, () => {
      console.log(`[Server] ALADDIN listening on http://${LISTEN_HOST}:${PORT}`)
      if (isProd) {
        console.log('[Server] Production mode — serving dist/')
      }
      if (!authConfigured()) {
        console.warn(
          '[Server] Auth not configured — set ALADDIN_ADMIN_* and ALADDIN_SESSION_SECRET',
        )
      }
    })
  } catch (error) {
    console.error(`[Server] startup failed: ${error.message}`)
    process.exit(1)
  }
}
