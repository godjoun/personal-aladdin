/**
 * tradingLabApi.test.js — Trading Lab API 인증/검증/기록 흐름
 */

import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
import { upsertTradeFlowBucket } from './tradingLab/tradeFlowRepository.js'
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
  })

  beforeEach(() => {
    jar = {}
    resetLoginRateLimit()
    resetAccountLoginLockouts(getDb())
    resetMarketDataProvider()
    resetLiquidationCollector()
    resetTradeFlowCollector()
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
      '/api/trading-lab/analyses',
      '/api/trading-lab/liquidations',
      '/api/trading-lab/liquidations/status',
      '/api/trading-lab/liquidations/BTCUSDT',
      '/api/trading-lab/cvd/status',
      '/api/trading-lab/cvd/BTCUSDT',
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
    expect(res.json.marketDataConfigured).toBe(true)
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

  it('provider 미설정이면 NOT_CONFIGURED 로 정상 응답한다', async () => {
    resetMarketDataProvider()
    await login()
    const res = await request('GET', '/api/trading-lab/market/BTCUSDT')
    expect(res.status).toBe(200)
    expect(res.json.market.status).toBe('NOT_CONFIGURED')
    expect(res.json.market.configured).toBe(false)
    expect(res.json.market.metrics.price.value).toBeNull()
  })

  it('허용되지 않은 symbol 은 400 으로 차단한다', async () => {
    await login()

    const market = await request('GET', '/api/trading-lab/market/SOLUSDT')
    expect(market.status).toBe(400)
    expect(market.json.field).toBe('symbol')

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

  it('오류 응답에 내부 경로·secret 을 노출하지 않는다', async () => {
    await login()
    const res = await request('GET', '/api/trading-lab/market/SOLUSDT')
    expect(res.text).not.toMatch(/sqlite|\/Users\/|secret|password|hash/i)
  })
})
