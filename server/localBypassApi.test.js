/**
 * localBypassApi.test.js — 로컬 bypass 켜진 서버의 실제 동작
 *
 * 로그인 없이 protected API(Trading Lab 포함)에 접근되는지,
 * 기존 로그인 기능이 그대로 남아 있는지 검증한다.
 */

import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashPassword } from './auth/password.js'
import { closeDb } from './db.js'
import { CSRF_COOKIE, CSRF_HEADER } from './security/csrf.js'
import { getSessionCookieName } from './auth/sessionStore.js'
import { LOCAL_BYPASS_USER } from './auth/localBypass.js'
import {
  registerMarketDataProvider,
  resetMarketDataProvider,
} from './tradingLab/marketDataProvider.js'
import { createBybitMarketDataProvider } from './tradingLab/bybitMarketDataProvider.js'

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-bypass-'))

process.env.NODE_ENV = 'test'
process.env.ALADDIN_DB_PATH = path.join(TEMP_DIR, 'bypass.sqlite')
process.env.ALADDIN_ADMIN_USERNAME = 'admin'
process.env.ALADDIN_ADMIN_PASSWORD_HASH = hashPassword('CorrectHorseBattery-99')
process.env.ALADDIN_SESSION_SECRET = 'test-session-secret-min-32-chars!!'
process.env.ALADDIN_ALLOWED_ORIGIN = 'http://localhost:5173'
process.env.ALADDIN_LISTEN_HOST = '127.0.0.1'
process.env.ALADDIN_LOCAL_AUTH_BYPASS = 'true'

const ORIGIN = 'http://localhost:5173'
const { createApp } = await import('./index.js')

describe('로컬 bypass 활성 서버', () => {
  /** @type {http.Server} */
  let server
  /** @type {number} */
  let port
  /** @type {Record<string, string>} */
  const jar = {}

  beforeAll(async () => {
    closeDb()
    server = http.createServer(createApp())
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = /** @type {import('net').AddressInfo} */ (server.address()).port

    resetMarketDataProvider()
    registerMarketDataProvider(
      createBybitMarketDataProvider({
        fetchImpl: async (url) => {
          const href = String(url)
          if (href.includes('/tickers')) {
            return {
              ok: true,
              status: 200,
              async json() {
                return {
                  retCode: 0,
                  result: {
                    list: [
                      {
                        symbol: 'BTCUSDT',
                        lastPrice: '65000',
                        markPrice: '65010',
                        indexPrice: '64990',
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
                }
              },
            }
          }
          if (href.includes('/kline')) {
            return {
              ok: true,
              status: 200,
              async json() {
                return {
                  retCode: 0,
                  result: {
                    list: [
                      ['1700000900000', '3', '4', '2', '3.5', '30', '300'],
                      ['1700000000000', '1', '2', '0.5', '1.5', '10', '100'],
                    ],
                  },
                }
              },
            }
          }
          if (href.includes('/open-interest')) {
            return {
              ok: true,
              status: 200,
              async json() {
                return {
                  retCode: 0,
                  result: {
                    list: [
                      { openInterest: '110', timestamp: '2' },
                      { openInterest: '100', timestamp: '1' },
                    ],
                  },
                }
              },
            }
          }
          return { ok: false, status: 500, async json() { return {} } }
        },
        now: () => 1_700_001_000_000,
      }),
    )
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    closeDb()
    resetMarketDataProvider()
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

  it('세션 쿠키 없이도 인증된 상태로 보고한다', async () => {
    const res = await request('GET', '/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.json.authenticated).toBe(true)
    expect(res.json.localBypass).toBe(true)
    expect(res.json.username).toBe(LOCAL_BYPASS_USER.username)
    expect(jar[getSessionCookieName()]).toBeUndefined()
  })

  it('로그인 없이 기존 protected API 를 호출할 수 있다', async () => {
    for (const urlPath of ['/api/manual/assets', '/api/manual/trades', '/api/dividends']) {
      const res = await request('GET', urlPath)
      expect(res.status, urlPath).toBe(200)
      expect(res.json.ok, urlPath).toBe(true)
    }
  })

  it('로그인 없이 Trading Lab API 를 호출할 수 있다', async () => {
    const config = await request('GET', '/api/trading-lab/config')
    expect(config.status).toBe(200)
    expect(config.json.symbols).toEqual(['BTCUSDT', 'ETHUSDT'])
    expect(config.json.marketDataConfigured).toBe(true)

    const market = await request('GET', '/api/trading-lab/market/BTCUSDT')
    expect(market.status).toBe(200)
    expect(market.json.market.configured).toBe(true)
    expect(market.json.market.provider).toBe('BYBIT')
    expect(market.json.market.metrics.price.value).toBe(65000)

    const stats = await request('GET', '/api/trading-lab/stats')
    expect(stats.status).toBe(200)

    const status = await request('GET', '/api/trading-lab/liquidations/status')
    expect(status.status).toBe(200)
    expect(status.json.collector.provider).toBe('BYBIT')

    const liquidations = await request('GET', '/api/trading-lab/liquidations/BTCUSDT?window=15m')
    expect(liquidations.status).toBe(200)
    expect(liquidations.json.symbol).toBe('BTCUSDT')
    expect(liquidations.json.window).toBe('15m')
  })

  it('bypass 상태에서도 CSRF 는 계속 요구한다', async () => {
    const noToken = await request('POST', '/api/trading-lab/analyses', {
      body: { symbol: 'BTCUSDT', bias: 'LONG' },
      origin: ORIGIN,
    })
    expect(noToken.status).toBe(403)

    const badOrigin = await request('POST', '/api/trading-lab/analyses', {
      body: { symbol: 'BTCUSDT', bias: 'LONG' },
      headers: { [CSRF_HEADER]: '0'.repeat(64) },
      origin: 'https://evil.example',
    })
    expect(badOrigin.status).toBe(403)
  })

  it('CSRF 토큰이 있으면 쓰기도 동작한다', async () => {
    const csrf = await request('GET', '/api/auth/csrf')
    jar[CSRF_COOKIE] = csrf.json.csrfToken

    const created = await request('POST', '/api/trading-lab/analyses', {
      body: { symbol: 'BTCUSDT', bias: 'LONG', confidence: 60 },
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
      origin: ORIGIN,
    })
    expect(created.status).toBe(201)
    expect(created.json.analysis.bias).toBe('LONG')
  })

  it('bypass 상태에서도 입력 검증은 그대로 적용된다', async () => {
    const bad = await request('POST', '/api/trading-lab/analyses', {
      body: { symbol: 'SOLUSDT', bias: 'LONG' },
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
      origin: ORIGIN,
    })
    expect(bad.status).toBe(400)
  })

  it('기존 로그인 endpoint 는 그대로 살아 있다', async () => {
    const csrf = await request('GET', '/api/auth/csrf')
    jar[CSRF_COOKIE] = csrf.json.csrfToken

    const login = await request('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'CorrectHorseBattery-99' },
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
      origin: ORIGIN,
    })
    expect(login.status).toBe(200)
    expect(login.json.username).toBe('admin')

    const wrong = await request('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'wrong-password' },
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
      origin: ORIGIN,
    })
    expect(wrong.status).toBe(401)
  })

  it('주문 관련 endpoint 는 여전히 존재하지 않는다', async () => {
    for (const urlPath of [
      '/api/kiwoom/order',
      '/api/trading-lab/order',
      '/api/trading-lab/buy',
    ]) {
      const res = await request('POST', urlPath, {
        body: {},
        headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
        origin: ORIGIN,
      })
      expect([404, 403], urlPath).toContain(res.status)
    }
  })

  it('SQLite 파일은 여전히 노출되지 않는다', async () => {
    const res = await request('GET', '/server/data/aladdin.sqlite')
    expect(res.status).not.toBe(200)
  })
})

describe('위험한 bypass 설정', () => {
  it('0.0.0.0 bind 면 서버를 기동하지 않는다', () => {
    const previous = process.env.ALADDIN_LISTEN_HOST
    process.env.ALADDIN_LISTEN_HOST = '0.0.0.0'
    try {
      expect(() => createApp()).toThrow(/loopback/)
    } finally {
      process.env.ALADDIN_LISTEN_HOST = previous
    }
  })

  it('reverse proxy 뒤면 서버를 기동하지 않는다', () => {
    process.env.ALADDIN_TRUST_PROXY = '1'
    try {
      expect(() => createApp()).toThrow(/loopback/)
    } finally {
      delete process.env.ALADDIN_TRUST_PROXY
    }
  })

  it('호스팅 배포 환경이면 서버를 기동하지 않는다', () => {
    process.env.RENDER = 'true'
    try {
      expect(() => createApp()).toThrow(/loopback/)
    } finally {
      delete process.env.RENDER
    }
  })
})
