/**
 * tradingLabApi.test.js — Trading Lab API 인증/검증/기록 흐름
 */

import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from './auth/password.js'
import { resetLoginRateLimit } from './auth/rateLimit.js'
import { resetAccountLoginLockouts } from './auth/loginLockout.js'
import { closeDb, getDb } from './db.js'
import { CSRF_COOKIE, CSRF_HEADER } from './security/csrf.js'
import {
  registerMarketDataProvider,
  resetMarketDataProvider,
} from './tradingLab/marketDataProvider.js'
import { createBybitMarketDataProvider } from './tradingLab/bybitMarketDataProvider.js'
import {
  resetLiquidationCollector,
  setLiquidationCollector,
} from './tradingLab/liquidationCollector.js'
import {
  resetTradeFlowCollector,
  setTradeFlowCollector,
} from './tradingLab/tradeFlowCollector.js'
import { resetMarketStateRecorder } from './tradingLab/marketStateRecorder.js'
import { resetShadowTradeRuntime } from './tradingLab/shadowTradeRuntime.js'
import {
  createUpbitIntegration,
  resetUpbitIntegration,
  setUpbitIntegration,
} from './tradingLab/upbitIntegration.js'
import {
  insertShadowTrade,
  upsertShadowTradeOutcome,
  updateShadowTradeStatus,
} from './tradingLab/shadowTradeRepository.js'
import { upsertTradeFlowBucket } from './tradingLab/tradeFlowRepository.js'
import { evaluateAndPersistMarketStates } from './tradingLab/marketStateService.js'
import { listMarketStateObservations } from './tradingLab/marketStateRepository.js'
import {
  applyTradeToBucket,
  createEmptyTradeFlowBucket,
  normalizeBybitPublicTrade,
} from './tradingLab/tradeEvent.js'

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-lab-api-'))
const DB_PATH = path.join(TEMP_DIR, 'lab-api.sqlite')

process.env.NODE_ENV = 'test'
process.env.ALADDIN_DB_PATH = DB_PATH
process.env.ALADDIN_ADMIN_USERNAME = 'admin'
process.env.ALADDIN_ADMIN_PASSWORD_HASH = hashPassword('CorrectHorseBattery-99')
process.env.ALADDIN_SESSION_SECRET = 'test-session-secret-min-32-chars!!'
process.env.ALADDIN_ALLOWED_ORIGIN = 'http://localhost:5173'
// 로컬 .env 의 bypass 설정과 무관하게 인증 게이트를 검증한다
process.env.ALADDIN_LOCAL_AUTH_BYPASS = 'false'

const ORIGIN = 'http://localhost:5173'
const { createApp } = await import('./index.js')

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    },
  }
}

function createMockBybitFetch() {
  return async (url) => {
    const href = String(url)
    if (href.includes('/v5/market/tickers')) {
      const symbol = href.includes('ETHUSDT') ? 'ETHUSDT' : 'BTCUSDT'
      return jsonResponse({
        retCode: 0,
        retMsg: 'OK',
        result: {
          category: 'linear',
          list: [
            {
              symbol,
              lastPrice: symbol === 'ETHUSDT' ? '3500' : '65000',
              markPrice: symbol === 'ETHUSDT' ? '3501' : '65010',
              indexPrice: symbol === 'ETHUSDT' ? '3499' : '64990',
              price24hPcnt: '0.01',
              highPrice24h: '66000',
              lowPrice24h: '64000',
              volume24h: '1000',
              turnover24h: '65000000',
              openInterest: '50000',
              openInterestValue: '3250000000',
              fundingRate: '0.0001',
              nextFundingTime: '1700000000000',
              bid1Price: '64999',
              ask1Price: '65001',
            },
          ],
        },
      })
    }
    if (href.includes('/v5/market/kline')) {
      return jsonResponse({
        retCode: 0,
        retMsg: 'OK',
        result: {
          list: [
            ['1700000900000', '3', '4', '2', '3.5', '30', '300'],
            ['1700000000000', '1', '2', '0.5', '1.5', '10', '100'],
            ['1700000450000', '2', '3', '1', '2.5', '20', '200'],
          ],
        },
      })
    }
    if (href.includes('/v5/market/open-interest')) {
      return jsonResponse({
        retCode: 0,
        retMsg: 'OK',
        result: {
          list: [
            { openInterest: '110', timestamp: '2' },
            { openInterest: '100', timestamp: '1' },
          ],
        },
      })
    }
    return jsonResponse({ retCode: 1, retMsg: 'unexpected' }, 500)
  }
}

function createChartProvider(getCandles) {
  const ok = async () => ({
    status: 'OK',
    data: null,
    provider: 'TEST',
    fetchedAt: '2026-09-12T00:00:00.000Z',
  })
  return {
    id: 'TEST',
    configured: true,
    getTicker: ok,
    getCandles,
    getOpenInterest: ok,
    getFundingRate: ok,
    getLiquidations: ok,
    getOrderFlow: ok,
  }
}

describe('Trading Lab API', () => {
  /** @type {http.Server} */
  let server
  /** @type {number} */
  let port
  /** @type {Record<string, string>} */
  let jar

  beforeAll(async () => {
    closeDb()
    const app = createApp({
      marketDataProvider: createBybitMarketDataProvider({
        fetchImpl: createMockBybitFetch(),
        now: () => 1_700_001_000_000,
      }),
    })
    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = /** @type {import('net').AddressInfo} */ (server.address()).port
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    closeDb()
    resetMarketDataProvider()
    resetLiquidationCollector()
    resetTradeFlowCollector()
    resetMarketStateRecorder()
    resetShadowTradeRuntime()
    resetUpbitIntegration()
  })

  beforeEach(() => {
    jar = {}
    resetLoginRateLimit()
    resetAccountLoginLockouts(getDb())
    resetMarketDataProvider()
    resetLiquidationCollector()
    resetTradeFlowCollector()
    resetUpbitIntegration()
    createUpbitIntegration({ credentials: null, db: getDb(), autoStart: false })
    registerMarketDataProvider(
      createBybitMarketDataProvider({
        fetchImpl: createMockBybitFetch(),
        now: () => 1_700_001_000_000,
      }),
    )
  })

  async function request(method, urlPath, { body, headers = {}, origin } = {}) {
    const reqHeaders = {
      ...headers,
      cookie: Object.entries(jar)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('; '),
    }
    if (origin) reqHeaders.origin = origin
    if (body != null && !reqHeaders['content-type']) {
      reqHeaders['content-type'] = 'application/json'
    }

    const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      method,
      headers: reqHeaders,
      body: body != null ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })

    const cookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : []
    for (const item of cookies) {
      const [pair] = item.split(';')
      const idx = pair.indexOf('=')
      if (idx < 0) continue
      jar[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1))
    }

    const text = await response.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: response.status, json, text }
  }

  async function login() {
    const csrfRes = await request('GET', '/api/auth/csrf')
    jar[CSRF_COOKIE] = csrfRes.json.csrfToken
    const res = await request('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'CorrectHorseBattery-99' },
      headers: { [CSRF_HEADER]: csrfRes.json.csrfToken },
      origin: ORIGIN,
    })
    expect(res.status).toBe(200)
    if (res.json.csrfToken) jar[CSRF_COOKIE] = res.json.csrfToken
  }

  function authed(body) {
    return {
      body,
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
      origin: ORIGIN,
    }
  }

  async function createAnalysis(overrides = {}) {
    const res = await request(
      'POST',
      '/api/trading-lab/analyses',
      authed({ symbol: 'BTCUSDT', bias: 'LONG', confidence: 55, ...overrides }),
    )
    expect(res.status).toBe(201)
    return res.json.analysis
  }

  it('인증 없이 Trading Lab API 접근은 401', async () => {
    for (const urlPath of [
      '/api/trading-lab/config',
      '/api/trading-lab/market/BTCUSDT',
      '/api/trading-lab/market/BTCUSDT/candles',
      '/api/trading-lab/analyses',
      '/api/trading-lab/liquidations',
      '/api/trading-lab/liquidations/status',
      '/api/trading-lab/liquidations/BTCUSDT',
      '/api/trading-lab/cvd/status',
      '/api/trading-lab/cvd/BTCUSDT',
      '/api/trading-lab/market-state/BTCUSDT',
      '/api/trading-lab/market-state/BTCUSDT/history',
      '/api/trading-lab/shadow-trades',
      '/api/trading-lab/shadow-trades/stats',
      '/api/trading-lab/shadow-trades/settings',
      '/api/trading-lab/strategy-checks',
      '/api/trading-lab/upbit/status',
      '/api/trading-lab/upbit/trades',
      '/api/trading-lab/stats',
    ]) {
      const res = await request('GET', urlPath)
      expect(res.status, urlPath).toBe(401)
      expect(res.json?.message).toBe('Unauthorized')
    }

    const post = await request('POST', '/api/trading-lab/analyses', {
      body: { symbol: 'BTCUSDT', bias: 'LONG' },
      origin: ORIGIN,
    })
    expect(post.status).toBe(401)

    const shadowPost = await request('POST', '/api/trading-lab/shadow-trades', {
      body: { symbol: 'BTCUSDT', direction: 'LONG', entryPrice: 1 },
      origin: ORIGIN,
    })
    expect(shadowPost.status).toBe(401)

    const shadowPatch = await request('PATCH', '/api/trading-lab/shadow-trades/abc', {
      body: { userNote: 'x' },
      origin: ORIGIN,
    })
    expect(shadowPatch.status).toBe(401)

    const strategyPost = await request('POST', '/api/trading-lab/strategy-checks', {
      body: { symbol: 'BTCUSDT', direction: 'LONG' },
      origin: ORIGIN,
    })
    expect(strategyPost.status).toBe(401)

    const upbitSync = await request('POST', '/api/trading-lab/upbit/sync', {
      origin: ORIGIN,
    })
    expect(upbitSync.status).toBe(401)
  })

  it('Upbit 미설정 상태는 secret 없이 정상 응답한다', async () => {
    await login()
    const status = await request('GET', '/api/trading-lab/upbit/status')
    expect(status.status).toBe(200)
    expect(status.json.status).toMatchObject({ configured: false, connected: false })
    expect(JSON.stringify(status.json)).not.toMatch(/ACCESS|SECRET|Bearer/i)

    const trades = await request('GET', '/api/trading-lab/upbit/trades?limit=20&offset=0')
    expect(trades.status).toBe(200)
    expect(trades.json).toMatchObject({ trades: [], total: 0 })

    const sync = await request('POST', '/api/trading-lab/upbit/sync', authed({}))
    expect(sync.status).toBe(409)
    expect(sync.json.code).toBe('NOT_CONFIGURED')
  })

  it('Upbit configured integration은 sync와 episode 목록을 제공한다', async () => {
    const sync = vi.fn(async () => ({ orderCount: 2, executionCount: 2, episodeCount: 1, lastSyncAt: '2026-09-20T00:00:00Z' }))
    setUpbitIntegration({
      configured: true,
      sync,
      getStatus: () => ({
        configured: true, connected: true, lastMessageAt: null,
        lastExecutionAt: null, lastSyncAt: '2026-09-20T00:00:00Z',
        reconnectCount: 0, lastError: null,
      }),
      listTrades: () => ({
        total: 1,
        trades: [{ id: 'ep1', market: 'KRW-BTC', status: 'CLOSED' }],
      }),
    })
    await login()
    const result = await request('POST', '/api/trading-lab/upbit/sync', authed({}))
    expect(result.status).toBe(200)
    expect(sync).toHaveBeenCalledTimes(1)
    const trades = await request('GET', '/api/trading-lab/upbit/trades?market=KRW-BTC&status=CLOSED')
    expect(trades.status).toBe(200)
    expect(trades.json.trades[0].id).toBe('ep1')
  })

  it('CSRF 토큰 없는 쓰기 요청은 403', async () => {
    await login()
    const res = await request('POST', '/api/trading-lab/analyses', {
      body: { symbol: 'BTCUSDT', bias: 'LONG' },
      headers: { [CSRF_HEADER]: '0'.repeat(64) },
      origin: ORIGIN,
    })
    expect(res.status).toBe(403)
  })

  it('허용되지 않은 Origin 의 쓰기 요청은 403', async () => {
    await login()
    const res = await request('POST', '/api/trading-lab/analyses', {
      body: { symbol: 'BTCUSDT', bias: 'LONG' },
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
      origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
  })

  it('config 는 allowlist 와 provider 상태를 반환한다', async () => {
    await login()
    const res = await request('GET', '/api/trading-lab/config')
    expect(res.status).toBe(200)
    expect(res.json.symbols).toEqual(['BTCUSDT', 'ETHUSDT'])
    expect(res.json.biases).toEqual(['LONG', 'SHORT', 'NEUTRAL'])
    expect(res.json.cvdWindows).toEqual(['5m', '15m', '1h', '4h'])
    expect(res.json.marketStates).toContain('BULLISH_PRESSURE')
    expect(res.json.marketStates).toContain('DATA_INSUFFICIENT')
    expect(res.json.marketDataConfigured).toBe(true)
    expect(res.json.chartTimeframes).toEqual(['15m', '1h', '4h'])
    expect(res.json.strategyVersion).toBe('my_strategy_v1')
    expect(res.json.strategyCheckResults).toEqual(['READY', 'NOT_READY', 'RISK_HIGH'])
    expect(res.json.strategyScoreLabel).toBe('기준 충족도')
    expect(res.json.strategyCheckDisclaimer).not.toMatch(/승률|수익 확률/)
  })

  it('시장 데이터는 Bybit provider 로 조회한다', async () => {
    await login()
    const res = await request('GET', '/api/trading-lab/market/BTCUSDT')
    expect(res.status).toBe(200)
    expect(res.json.market.configured).toBe(true)
    expect(res.json.market.provider).toBe('BYBIT')
    expect(res.json.market.metrics.price.value).toBe(65000)
    expect(res.json.market.metrics.markPrice.value).toBe(65010)
    expect(res.json.market.metrics.fundingRate.value).toBe(0.0001)
    expect(res.json.market.funding.ratePercent).toBe('+0.0100%')
    expect(res.json.market.timeframes['15m'].candleCount).toBeGreaterThan(0)
    expect(res.json.market.timeframes['1h'].candleCount).toBeGreaterThan(0)
    expect(res.json.market.timeframes['4h'].candleCount).toBeGreaterThan(0)
    expect(res.json.market.openInterest.changePct).toBe(10)
    expect(res.json.market.metrics.liquidationAbove.value).toBeNull()
    expect(res.json.market.metrics.cvd.value).toBeNull()

    const eth = await request('GET', '/api/trading-lab/market/ETHUSDT')
    expect(eth.status).toBe(200)
    expect(eth.json.market.symbol).toBe('ETHUSDT')
    expect(eth.json.market.metrics.price.value).toBe(3500)
  })

  it('Chart View 공개 캔들을 15m/1h/4h 로 조회한다', async () => {
    await login()

    const hourly = await request('GET', '/api/trading-lab/market/BTCUSDT/candles?timeframe=1h')
    expect(hourly.status).toBe(200)
    expect(hourly.json.symbol).toBe('BTCUSDT')
    expect(hourly.json.timeframe).toBe('1h')
    expect(hourly.json.status).toBe('OK')
    expect(hourly.json.candles.length).toBe(3)
    expect(hourly.json.candles[0]).toMatchObject({
      timestamp: 1_700_000_000_000,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
    })
    expect(JSON.stringify(hourly.json)).not.toMatch(/placeOrder|private|승률/)

    const fifteen = await request(
      'GET',
      '/api/trading-lab/market/ETHUSDT/candles?timeframe=15m',
    )
    expect(fifteen.status).toBe(200)
    expect(fifteen.json.symbol).toBe('ETHUSDT')
    expect(fifteen.json.timeframe).toBe('15m')
    expect(fifteen.json.candles.length).toBe(3)

    const fourHour = await request(
      'GET',
      '/api/trading-lab/market/BTCUSDT/candles?timeframe=4h',
    )
    expect(fourHour.status).toBe(200)
    expect(fourHour.json.timeframe).toBe('4h')

    const blocked = await request(
      'GET',
      '/api/trading-lab/market/BTCUSDT/candles?timeframe=12h',
    )
    expect(blocked.status).toBe(400)
    expect(blocked.json.field).toBe('timeframe')

    const daily = await request(
      'GET',
      '/api/trading-lab/market/BTCUSDT/candles?timeframe=1d',
    )
    expect(daily.status).toBe(400)
    expect(daily.json.field).toBe('timeframe')
  })

  it('Chart View 캔들 API 는 빈 데이터, 최근 데이터, 오류 상태를 안전하게 반환한다', async () => {
    await login()

    registerMarketDataProvider(
      createChartProvider(async () => ({
        status: 'OK',
        data: { candles: [] },
        provider: 'TEST',
        fetchedAt: '2026-09-12T00:00:00.000Z',
      })),
    )
    const empty = await request(
      'GET',
      '/api/trading-lab/market/BTCUSDT/candles?timeframe=1h',
    )
    expect(empty.status).toBe(200)
    expect(empty.json.status).toBe('OK')
    expect(empty.json.candles).toEqual([])

    registerMarketDataProvider(
      createChartProvider(async () => ({
        status: 'OK',
        stale: true,
        data: {
          candles: [
            {
              timestamp: 1_700_000_000_000,
              open: 1,
              high: 2,
              low: 0.5,
              close: 1.5,
            },
          ],
        },
        provider: 'TEST',
        fetchedAt: '2026-09-12T00:00:00.000Z',
      })),
    )
    const stale = await request(
      'GET',
      '/api/trading-lab/market/BTCUSDT/candles?timeframe=1h',
    )
    expect(stale.status).toBe(200)
    expect(stale.json.stale).toBe(true)
    expect(stale.json.candles).toHaveLength(1)

    registerMarketDataProvider(
      createChartProvider(async () => ({
        status: 'ERROR',
        data: null,
        provider: 'TEST',
        fetchedAt: '2026-09-12T00:00:00.000Z',
        message: '/Users/sinjoun/.env ALADDIN_SECRET',
      })),
    )
    const failed = await request(
      'GET',
      '/api/trading-lab/market/BTCUSDT/candles?timeframe=1h',
    )
    expect(failed.status).toBe(200)
    expect(failed.json.status).toBe('ERROR')
    expect(failed.json.message).toBe('시장 데이터를 불러오지 못했습니다.')
    expect(failed.json.candles).toEqual([])
    expect(JSON.stringify(failed.json)).not.toMatch(/ALADDIN_SECRET|\.env|sinjoun/)
  })

  it('관측 청산 status / window API 를 제공한다', async () => {
    setLiquidationCollector({
      getStatus() {
        return {
          provider: 'BYBIT',
          connected: true,
          subscribedSymbols: ['BTCUSDT', 'ETHUSDT'],
          lastEventAt: null,
          lastMessageAt: '2026-01-01T00:00:00.000Z',
          reconnectCount: 0,
        }
      },
    })
    await login()

    const status = await request('GET', '/api/trading-lab/liquidations/status')
    expect(status.status).toBe(200)
    expect(status.json.collector).toEqual({
      provider: 'BYBIT',
      connected: true,
      subscribedSymbols: ['BTCUSDT', 'ETHUSDT'],
      lastEventAt: null,
      lastMessageAt: '2026-01-01T00:00:00.000Z',
      reconnectCount: 0,
    })

    const summary = await request(
      'GET',
      '/api/trading-lab/liquidations/ETHUSDT?window=5m',
    )
    expect(summary.status).toBe(200)
    expect(summary.json.symbol).toBe('ETHUSDT')
    expect(summary.json.window).toBe('5m')
    expect(summary.json.observed).toBe(true)
    expect(summary.json.long.count).toBe(0)
    expect(summary.json.short.count).toBe(0)

    const badWindow = await request(
      'GET',
      '/api/trading-lab/liquidations/BTCUSDT?window=3m',
    )
    expect(badWindow.status).toBe(400)
    expect(badWindow.json.field).toBe('window')
  })

  it('CVD status / window API 를 제공한다', async () => {
    setTradeFlowCollector({
      getStatus() {
        return {
          provider: 'BYBIT',
          connected: true,
          subscribedSymbols: ['BTCUSDT', 'ETHUSDT'],
          lastTradeAt: '2026-01-01T00:00:00.000Z',
          lastMessageAt: '2026-01-01T00:00:00.000Z',
          reconnectCount: 0,
        }
      },
    })
    await login()

    const status = await request('GET', '/api/trading-lab/cvd/status')
    expect(status.status).toBe(200)
    expect(status.json.collector).toEqual({
      provider: 'BYBIT',
      connected: true,
      subscribedSymbols: ['BTCUSDT', 'ETHUSDT'],
      lastTradeAt: '2026-01-01T00:00:00.000Z',
      lastMessageAt: '2026-01-01T00:00:00.000Z',
      reconnectCount: 0,
    })

    const empty = await request('GET', '/api/trading-lab/cvd/ETHUSDT?window=5m')
    expect(empty.status).toBe(200)
    expect(empty.json.symbol).toBe('ETHUSDT')
    expect(empty.json.provider).toBe('BYBIT')
    expect(empty.json.window).toBe('5m')
    expect(empty.json.cvd).toBe(0)
    expect(empty.json.buySharePct).toBeNull()

    const bucketStartMs = Math.floor(Date.now() / 60_000) * 60_000
    const bucket = createEmptyTradeFlowBucket({
      symbol: 'BTCUSDT',
      bucketStart: new Date(bucketStartMs).toISOString(),
    })
    applyTradeToBucket(
      bucket,
      normalizeBybitPublicTrade({
        T: bucketStartMs + 1_000,
        s: 'BTCUSDT',
        S: 'Buy',
        v: '2',
        p: '100',
        i: 'api-cvd-1',
      }).value,
    )
    upsertTradeFlowBucket(bucket, getDb())

    const summary = await request('GET', '/api/trading-lab/cvd/BTCUSDT?window=15m')
    expect(summary.status).toBe(200)
    expect(summary.json.buyVolume).toBe(2)
    expect(summary.json.cvdNotional).toBe(200)
    expect(summary.json.buySharePct).toBe(100)

    const badWindow = await request(
      'GET',
      '/api/trading-lab/cvd/BTCUSDT?window=24h',
    )
    expect(badWindow.status).toBe(400)
    expect(badWindow.json.field).toBe('window')
  })

  it('GET 시장 상태는 평가만 하고 observation 을 만들지 않는다', async () => {
    await login()
    const db = getDb()
    const beforeBtc = listMarketStateObservations({ symbol: 'BTCUSDT', limit: 200 }, db)
      .length
    const beforeEth = listMarketStateObservations({ symbol: 'ETHUSDT', limit: 200 }, db)
      .length

    const first = await request('GET', '/api/trading-lab/market-state/BTCUSDT')
    expect(first.status).toBe(200)
    expect(first.json.symbol).toBe('BTCUSDT')
    expect(first.json.primaryState).toBeTruthy()
    expect(first.json.strengthScore).toBeGreaterThanOrEqual(0)
    expect(first.json.strengthScore).toBeLessThanOrEqual(100)
    expect(first.json.disclaimer).toContain('매수·매도 추천이 아닙니다')
    expect(first.json.persisted).toBeUndefined()
    expect(Array.isArray(first.json.evidence)).toBe(true)
    expect(Array.isArray(first.json.counterEvidence)).toBe(true)

    await request('GET', '/api/trading-lab/market-state/BTCUSDT')
    await request('GET', '/api/trading-lab/market-state/ETHUSDT')

    const afterGetBtc = listMarketStateObservations({ symbol: 'BTCUSDT', limit: 200 }, db)
    const afterGetEth = listMarketStateObservations({ symbol: 'ETHUSDT', limit: 200 }, db)
    expect(afterGetBtc).toHaveLength(beforeBtc)
    expect(afterGetEth).toHaveLength(beforeEth)

    const recorded = await evaluateAndPersistMarketStates({ db })
    expect(recorded.map((item) => item.symbol)).toEqual(['BTCUSDT', 'ETHUSDT'])
    expect(recorded.every((item) => item.persisted)).toBe(true)

    const again = await evaluateAndPersistMarketStates({ db })
    expect(again.every((item) => item.persisted)).toBe(false)

    const btcHistory = await request(
      'GET',
      '/api/trading-lab/market-state/BTCUSDT/history',
    )
    expect(btcHistory.status).toBe(200)
    expect(btcHistory.json.observations.length).toBe(beforeBtc + 1)
    expect(
      btcHistory.json.observations.every((row) => row.symbol === 'BTCUSDT'),
    ).toBe(true)

    const ethHistory = await request(
      'GET',
      '/api/trading-lab/market-state/ETHUSDT/history',
    )
    expect(ethHistory.status).toBe(200)
    expect(ethHistory.json.observations.length).toBe(beforeEth + 1)
    expect(
      ethHistory.json.observations.every((row) => row.symbol === 'ETHUSDT'),
    ).toBe(true)
  })

  it('provider 미설정이면 NOT_CONFIGURED 로 정상 응답한다', async () => {
    resetMarketDataProvider()
    await login()
    const res = await request('GET', '/api/trading-lab/market/BTCUSDT')
    expect(res.status).toBe(200)
    expect(res.json.market.status).toBe('NOT_CONFIGURED')
    expect(res.json.market.configured).toBe(false)
    expect(res.json.market.metrics.price.value).toBeNull()

    const candles = await request('GET', '/api/trading-lab/market/BTCUSDT/candles?timeframe=1h')
    expect(candles.status).toBe(200)
    expect(candles.json.status).toBe('NOT_CONFIGURED')
    expect(candles.json.candles).toEqual([])
  })

  it('허용되지 않은 symbol 은 400 으로 차단한다', async () => {
    await login()

    const market = await request('GET', '/api/trading-lab/market/SOLUSDT')
    expect(market.status).toBe(400)
    expect(market.json.field).toBe('symbol')

    const candles = await request('GET', '/api/trading-lab/market/SOLUSDT/candles?timeframe=1h')
    expect(candles.status).toBe(400)
    expect(candles.json.field).toBe('symbol')

    const list = await request('GET', '/api/trading-lab/analyses?symbol=SOLUSDT')
    expect(list.status).toBe(400)

    const created = await request(
      'POST',
      '/api/trading-lab/analyses',
      authed({ symbol: 'SOLUSDT', bias: 'LONG' }),
    )
    expect(created.status).toBe(400)
    expect(created.json.field).toBe('symbol')

    const cvd = await request('GET', '/api/trading-lab/cvd/SOLUSDT?window=15m')
    expect(cvd.status).toBe(400)
    expect(cvd.json.field).toBe('symbol')

    const marketState = await request('GET', '/api/trading-lab/market-state/SOLUSDT')
    expect(marketState.status).toBe(400)
    expect(marketState.json.field).toBe('symbol')
  })

  it('bias / confidence 검증 실패는 400', async () => {
    await login()

    const badBias = await request(
      'POST',
      '/api/trading-lab/analyses',
      authed({ symbol: 'BTCUSDT', bias: 'MOON' }),
    )
    expect(badBias.status).toBe(400)
    expect(badBias.json.field).toBe('bias')

    const badConfidence = await request(
      'POST',
      '/api/trading-lab/analyses',
      authed({ symbol: 'BTCUSDT', bias: 'LONG', confidence: 420 }),
    )
    expect(badConfidence.status).toBe(400)
    expect(badConfidence.json.field).toBe('confidence')
  })

  it('분석 생성 후 목록·상세에서 조회된다', async () => {
    await login()
    const analysis = await createAnalysis({
      symbol: 'ETHUSDT',
      bias: 'LONG',
      confidence: 63,
      referencePrice: 3200,
      reasoning: ['거래량 증가', 'OI 증가'],
      cautions: ['데이터 부족'],
      invalidationPrice: 3100,
    })

    const list = await request('GET', '/api/trading-lab/analyses?symbol=ETHUSDT')
    expect(list.status).toBe(200)
    expect(list.json.analyses.length).toBeGreaterThan(0)
    expect(list.json.analyses[0].outcome).toBeNull()

    const detail = await request('GET', `/api/trading-lab/analyses/${analysis.id}`)
    expect(detail.status).toBe(200)
    expect(detail.json.analysis.confidence).toBe(63)
    expect(detail.json.analysis.reasoning).toEqual(['거래량 증가', 'OI 증가'])
    expect(detail.json.outcome).toBeNull()
    expect(detail.json.screenshots).toEqual([])
  })

  it('시장 지표가 없어도 분석을 저장한다', async () => {
    await login()
    const analysis = await createAnalysis({ confidence: null })
    expect(analysis.confidence).toBeNull()
    for (const value of Object.values(analysis.marketSnapshot)) {
      expect(value).toBeNull()
    }
  })

  it('결과를 분석에 연결하고 갱신한다', async () => {
    await login()
    const analysis = await createAnalysis()

    const first = await request(
      'PUT',
      `/api/trading-lab/analyses/${analysis.id}/outcome`,
      authed({ result: 'UNRESOLVED', price1h: 65000 }),
    )
    expect(first.status).toBe(200)
    expect(first.json.action).toBe('inserted')

    const second = await request(
      'PUT',
      `/api/trading-lab/analyses/${analysis.id}/outcome`,
      authed({ result: 'SUCCESS', price24h: 67000 }),
    )
    expect(second.status).toBe(200)
    expect(second.json.action).toBe('updated')
    expect(second.json.outcome.result).toBe('SUCCESS')

    const badResult = await request(
      'PUT',
      `/api/trading-lab/analyses/${analysis.id}/outcome`,
      authed({ result: 'PROFIT' }),
    )
    expect(badResult.status).toBe(400)

    const missing = await request(
      'PUT',
      '/api/trading-lab/analyses/missing-id/outcome',
      authed({ result: 'SUCCESS' }),
    )
    expect(missing.status).toBe(404)
  })

  it('청산 snapshot 을 기록하고 추정치임을 표시한다', async () => {
    await login()
    const created = await request(
      'POST',
      '/api/trading-lab/liquidations',
      authed({
        symbol: 'BTCUSDT',
        side: 'LONG',
        priceLevel: 64000,
        sourceType: 'ESTIMATED',
      }),
    )
    expect(created.status).toBe(201)
    expect(created.json.snapshot.sourceType).toBe('ESTIMATED')

    const list = await request('GET', '/api/trading-lab/liquidations?symbol=BTCUSDT')
    expect(list.status).toBe(200)
    expect(list.json.estimated).toBe(true)
    expect(list.json.snapshots.length).toBeGreaterThan(0)

    const badSide = await request(
      'POST',
      '/api/trading-lab/liquidations',
      authed({ symbol: 'BTCUSDT', side: 'BOTH' }),
    )
    expect(badSide.status).toBe(400)
    expect(badSide.json.field).toBe('side')
  })

  it('차트 캡처 metadata 를 분석에 연결한다', async () => {
    await login()
    const analysis = await createAnalysis()

    const created = await request(
      'POST',
      `/api/trading-lab/analyses/${analysis.id}/screenshots`,
      authed({ symbol: 'BTCUSDT', timeframe: '4h', note: '레인지 상단' }),
    )
    expect(created.status).toBe(201)
    expect(created.json.screenshot.status).toBe('PENDING')

    const badTimeframe = await request(
      'POST',
      `/api/trading-lab/analyses/${analysis.id}/screenshots`,
      authed({ symbol: 'BTCUSDT', timeframe: '2h' }),
    )
    expect(badTimeframe.status).toBe(400)
    expect(badTimeframe.json.field).toBe('timeframe')

    const detail = await request('GET', `/api/trading-lab/analyses/${analysis.id}`)
    expect(detail.json.screenshots).toHaveLength(1)
  })

  it('분석 삭제 후에는 404', async () => {
    await login()
    const analysis = await createAnalysis()

    const removed = await request(
      'DELETE',
      `/api/trading-lab/analyses/${analysis.id}`,
      authed(),
    )
    expect(removed.status).toBe(200)

    const detail = await request('GET', `/api/trading-lab/analyses/${analysis.id}`)
    expect(detail.status).toBe(404)
  })

  it('SQLi 형태 id 는 400 으로 차단한다', async () => {
    await login()
    const res = await request(
      'GET',
      `/api/trading-lab/analyses/${encodeURIComponent("1'; DROP TABLE trade_analysis;--")}`,
    )
    expect(res.status).toBe(400)

    const stillWorks = await request('GET', '/api/trading-lab/stats')
    expect(stillWorks.status).toBe(200)
  })

  it('통계 endpoint 가 집계를 반환한다', async () => {
    await login()
    await createAnalysis({ bias: 'NEUTRAL' })

    const res = await request('GET', '/api/trading-lab/stats')
    expect(res.status).toBe(200)
    expect(res.json.stats.total).toBeGreaterThan(0)
    expect(res.json.stats.byBias).toHaveProperty('NEUTRAL')
  })

  it('주문/매매 관련 Trading Lab endpoint 는 존재하지 않는다', async () => {
    await login()
    for (const urlPath of [
      '/api/trading-lab/order',
      '/api/trading-lab/orders',
      '/api/trading-lab/buy',
      '/api/trading-lab/sell',
      '/api/trading-lab/positions',
      '/api/trading-lab/leverage',
    ]) {
      const res = await request('POST', urlPath, authed({}))
      expect([404, 403], urlPath).toContain(res.status)
    }
  })

  it('수동 shadow LONG/SHORT 를 만들고 잘못된 입력을 차단한다', async () => {
    await login()
    const long = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({
        symbol: 'ETHUSDT',
        direction: 'LONG',
        entryPrice: 2560,
        userTags: ['support', 'FVG'],
        userNote: '4H 흐름 관찰',
      }),
    )
    expect(long.status).toBe(201)
    expect(long.json.trade.direction).toBe('LONG')
    expect(long.json.trade.source).toBe('MANUAL_USER')
    expect(long.json.trade.userTags).toEqual(['support', 'fvg'])
    expect(long.json.disclaimer).toContain('가상 계산')

    const short = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({
        symbol: 'ETHUSDT',
        direction: 'SHORT',
        entryPrice: 2560,
        userTags: ['resistance OB'],
      }),
    )
    expect(short.status).toBe(201)
    expect(short.json.trade.direction).toBe('SHORT')
    expect(short.json.trade.warnings).toContain('진입 이유가 비어 있습니다')

    const badSymbol = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({ symbol: 'SOLUSDT', direction: 'LONG', entryPrice: 1 }),
    )
    expect(badSymbol.status).toBe(400)
    expect(badSymbol.json.field).toBe('symbol')

    const badDirection = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({ symbol: 'BTCUSDT', direction: 'BUY', entryPrice: 1 }),
    )
    expect(badDirection.status).toBe(400)
    expect(badDirection.json.field).toBe('direction')

    const badTag = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({ symbol: 'BTCUSDT', direction: 'LONG', entryPrice: 1, userTags: ['whale'] }),
    )
    expect(badTag.status).toBe(400)
    expect(badTag.json.field).toBe('userTags')

    const detail = await request(
      'GET',
      `/api/trading-lab/shadow-trades/${long.json.trade.id}`,
    )
    expect(detail.status).toBe(200)
    expect(detail.json.trade.id).toBe(long.json.trade.id)
  })

  it('자동 기록 설정과 FOMO 경고, stats 를 반환한다', async () => {
    await login()
    const off = await request('GET', '/api/trading-lab/shadow-trades/settings')
    expect(off.status).toBe(200)
    expect(off.json.settings.autoRecord).toBe(false)

    const autoOff = await request('POST', '/api/trading-lab/shadow-trades/auto', authed({}))
    expect(autoOff.status).toBe(200)
    expect(autoOff.json.results.every((item) => item.created === false)).toBe(true)

    const on = await request(
      'POST',
      '/api/trading-lab/shadow-trades/settings',
      authed({ autoRecord: true }),
    )
    expect(on.status).toBe(200)
    expect(on.json.settings.autoRecord).toBe(true)

    await request(
      'POST',
      '/api/trading-lab/shadow-trades/settings',
      authed({ autoRecord: false }),
    )

    const now = Date.now()
    for (let i = 0; i < 3; i += 1) {
      const trade = insertShadowTrade({
        symbol: 'BTCUSDT',
        direction: 'LONG',
        source: 'MANUAL_USER',
        status: 'CLOSED',
        createdAt: new Date(now - (3 - i) * 60_000).toISOString(),
        entryPrice: 65000,
        userNote: `loss-${i}`,
      })
      upsertShadowTradeOutcome(trade.id, {
        result: 'LOSS',
        feeAdjustedReturnPct: -1,
        assumedFeeBps: 5,
        assumedSlippageBps: 3,
      })
      updateShadowTradeStatus(trade.id, 'CLOSED')
    }

    const first = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({ symbol: 'BTCUSDT', direction: 'LONG', entryPrice: 65000, userNote: 'a' }),
    )
    const second = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({ symbol: 'BTCUSDT', direction: 'LONG', entryPrice: 65000, userNote: 'b' }),
    )
    const third = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({ symbol: 'BTCUSDT', direction: 'LONG', entryPrice: 65000, userNote: 'c' }),
    )
    expect(third.status).toBe(201)
    expect(third.json.trade.warnings).toContain('과도한 재진입 패턴 가능성')
    expect(third.json.trade.warnings).toContain(
      '연속 실패 구간입니다. 실전 진입 검토를 멈추고 복기하세요.',
    )
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)

    const stats = await request('GET', '/api/trading-lab/shadow-trades/stats?symbol=BTCUSDT')
    expect(stats.status).toBe(200)
    expect(stats.json.stats.total).toBeGreaterThanOrEqual(6)
    expect(stats.json.stats.long).toBeGreaterThanOrEqual(6)
    expect(stats.json.disclaimer).not.toMatch(/승률/)
  })

  it('quick shadow 기록과 60초 중복 방지, 메모/태그 보강을 지원한다', async () => {
    await login()
    const long = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({
        symbol: 'BTCUSDT',
        direction: 'LONG',
        quick: true,
        userTags: ['support', 'FOMO', '손절 기준 있음', '목표 기준 있음'],
      }),
    )
    expect(long.status).toBe(201)
    expect(long.json.trade.entryReason).toBe('quick_manual')
    expect(long.json.trade.source).toBe('MANUAL_USER')
    expect(long.json.trade.symbol).toBe('BTCUSDT')
    expect(long.json.trade.entryPrice).toBeGreaterThan(0)
    expect(long.json.trade.userTags).toEqual([
      'support',
      'fomo',
      'has_stop',
      'has_target',
    ])
    expect(long.json.trade.warnings || []).not.toContain('진입 이유가 비어 있습니다')

    const short = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({ symbol: 'BTCUSDT', direction: 'SHORT', quick: true }),
    )
    expect(short.status).toBe(201)
    expect(short.json.trade.direction).toBe('SHORT')
    expect(short.json.trade.userTags).toEqual([])

    const dup = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({ symbol: 'BTCUSDT', direction: 'LONG', quick: true }),
    )
    expect(dup.status).toBe(409)
    expect(dup.json.duplicate).toBe(true)
    expect(dup.json.message).toBe('방금 같은 방향을 기록했습니다')
    expect(dup.json.trade.id).toBe(long.json.trade.id)

    const patched = await request(
      'PATCH',
      `/api/trading-lab/shadow-trades/${long.json.trade.id}`,
      authed({ userNote: '4H 지지 관찰', userTags: ['support', 'fomo', 'trendline'] }),
    )
    expect(patched.status).toBe(200)
    expect(patched.json.trade.userNote).toBe('4H 지지 관찰')
    expect(patched.json.trade.userTags).toEqual(['support', 'fomo', 'trendline'])

    const detailed = await request(
      'POST',
      '/api/trading-lab/shadow-trades',
      authed({
        symbol: 'BTCUSDT',
        direction: 'LONG',
        entryPrice: 65000,
        userNote: '상세 모달 유지',
      }),
    )
    expect(detailed.status).toBe(201)
    expect(detailed.json.trade.entryReason).toBe('상세 모달 유지')
  })

  it('My Strategy v1 체크와 가상 기록을 저장한다', async () => {
    await login()
    const long = await request(
      'POST',
      '/api/trading-lab/strategy-checks',
      authed({
        symbol: 'BTCUSDT',
        direction: 'LONG',
        selectedTags: ['support', 'support_ob', 'has_stop', 'has_target'],
      }),
    )
    expect(long.status).toBe(201)
    expect(long.json.check.strategyVersion).toBe('my_strategy_v1')
    expect(long.json.check.direction).toBe('LONG')
    expect(long.json.check.selectedTags).toEqual([
      'support',
      'support_ob',
      'has_stop',
      'has_target',
    ])
    expect(['READY', 'NOT_READY', 'RISK_HIGH']).toContain(long.json.check.result)
    expect(long.json.check.scoreLabel).toBe('기준 충족도')
    expect(long.json.disclaimer).not.toMatch(/승률|매수 추천/)

    const listed = await request('GET', '/api/trading-lab/strategy-checks?symbol=BTCUSDT')
    expect(listed.status).toBe(200)
    expect(listed.json.checks[0].id).toBe(long.json.check.id)

    const recorded = await request(
      'POST',
      `/api/trading-lab/strategy-checks/${long.json.check.id}/shadow-trade`,
      authed({}),
    )
    expect(recorded.status).toBe(201)
    expect(recorded.json.trade.entryReason).toBe('my_strategy_v1')
    expect(recorded.json.trade.userTags).toEqual([
      'support',
      'support_ob',
      'has_stop',
      'has_target',
    ])
    expect(recorded.json.check.shadowTradeId).toBe(recorded.json.trade.id)
    expect(['STRATEGY', 'IMPULSE', 'OBSERVATION']).toContain(recorded.json.trade.recordType)

    const fomo = await request(
      'POST',
      '/api/trading-lab/strategy-checks',
      authed({
        symbol: 'ETHUSDT',
        direction: 'SHORT',
        selectedTags: ['resistance', 'has_stop', 'has_target', 'FOMO'],
      }),
    )
    expect(fomo.status).toBe(201)
    expect(fomo.json.check.result).toBe('RISK_HIGH')
    expect(fomo.json.check.selectedTags).toContain('fomo')

    const noStop = await request(
      'POST',
      '/api/trading-lab/strategy-checks',
      authed({
        symbol: 'ETHUSDT',
        direction: 'SHORT',
        selectedTags: ['resistance', 'has_target'],
      }),
    )
    expect(noStop.status).toBe(201)
    expect(noStop.json.check.result).toBe('RISK_HIGH')
    expect(noStop.json.check.missingItems).toContain('손절 기준이 없습니다.')
  })

  it('chart annotation 을 저장하고 잘못된 입력을 거부한다', async () => {
    await login()
    const created = await request(
      'POST',
      '/api/trading-lab/chart-annotations',
      authed({
        symbol: 'BTCUSDT',
        timeframe: '15m',
        annotationType: 'SUPPORT',
        price: 65000,
        memo: 'local support',
      }),
    )
    expect(created.status).toBe(201)
    expect(created.json.annotation.annotationType).toBe('SUPPORT')
    expect(created.json.annotation.price).toBe(65000)
    expect(created.json.disclaimer).not.toMatch(/매수하세요|자동매매/)

    const listed = await request(
      'GET',
      '/api/trading-lab/chart-annotations?symbol=BTCUSDT&timeframe=15m',
    )
    expect(listed.status).toBe(200)
    expect(listed.json.annotations).toHaveLength(1)
    expect(listed.json.annotations[0].id).toBe(created.json.annotation.id)

    const otherTf = await request(
      'GET',
      '/api/trading-lab/chart-annotations?symbol=BTCUSDT&timeframe=1h',
    )
    expect(otherTf.status).toBe(200)
    expect(otherTf.json.annotations).toHaveLength(0)

    const patched = await request(
      'PATCH',
      `/api/trading-lab/chart-annotations/${created.json.annotation.id}`,
      authed({ memo: 'updated memo' }),
    )
    expect(patched.status).toBe(200)
    expect(patched.json.annotation.memo).toBe('updated memo')

    const badSymbol = await request(
      'POST',
      '/api/trading-lab/chart-annotations',
      authed({
        symbol: 'SOLUSDT',
        timeframe: '15m',
        annotationType: 'SUPPORT',
        price: 100,
      }),
    )
    expect(badSymbol.status).toBe(400)
    expect(badSymbol.json.field).toBe('symbol')

    const badTf = await request(
      'GET',
      '/api/trading-lab/chart-annotations?symbol=BTCUSDT&timeframe=12h',
    )
    expect(badTf.status).toBe(400)
    expect(badTf.json.field).toBe('timeframe')

    const badType = await request(
      'POST',
      '/api/trading-lab/chart-annotations',
      authed({
        symbol: 'ETHUSDT',
        timeframe: '1h',
        annotationType: 'TRENDLINE',
        price: 2500,
      }),
    )
    expect(badType.status).toBe(400)
    expect(badType.json.field).toBe('annotationType')

    const negative = await request(
      'POST',
      '/api/trading-lab/chart-annotations',
      authed({
        symbol: 'ETHUSDT',
        timeframe: '4h',
        annotationType: 'RESISTANCE',
        price: -12,
      }),
    )
    expect(negative.status).toBe(400)
    expect(negative.json.field).toBe('price')

    const box = await request(
      'POST',
      '/api/trading-lab/chart-annotations',
      authed({
        symbol: 'ETHUSDT',
        timeframe: '4h',
        annotationType: 'LIQUIDITY_ZONE',
        topPrice: 2700,
        bottomPrice: 2500,
        startTime: '2026-09-12T00:00:00.000Z',
        endTime: '2026-09-12T04:00:00.000Z',
      }),
    )
    expect(box.status).toBe(201)
    const ethList = await request(
      'GET',
      '/api/trading-lab/chart-annotations?symbol=ETHUSDT&timeframe=4h',
    )
    expect(ethList.json.annotations).toHaveLength(1)

    const removed = await request(
      'DELETE',
      `/api/trading-lab/chart-annotations/${created.json.annotation.id}`,
      authed({}),
    )
    expect(removed.status).toBe(200)
    const afterDelete = await request(
      'GET',
      '/api/trading-lab/chart-annotations?symbol=BTCUSDT&timeframe=15m',
    )
    expect(afterDelete.json.annotations).toHaveLength(0)
  })

  it('오류 응답에 내부 경로·secret 을 노출하지 않는다', async () => {
    await login()
    const res = await request('GET', '/api/trading-lab/market/SOLUSDT')
    expect(res.text).not.toMatch(/sqlite|\/Users\/|secret|password|hash/i)
  })
})
