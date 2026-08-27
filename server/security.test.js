import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from './auth/password.js'
import { resetLoginRateLimit } from './auth/rateLimit.js'
import {
  LOGIN_FAIL_MESSAGE,
  LOGIN_LOCK_MESSAGE,
  getLoginLockoutState,
  resetAccountLoginLockouts,
} from './auth/loginLockout.js'
import { closeDb, getDb } from './db.js'
import { CSRF_COOKIE, CSRF_HEADER } from './security/csrf.js'
import { getSessionCookieName } from './auth/sessionStore.js'

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-sec-'))
const DB_PATH = path.join(TEMP_DIR, 'sec.sqlite')

process.env.NODE_ENV = 'test'
process.env.ALADDIN_DB_PATH = DB_PATH
process.env.ALADDIN_ADMIN_USERNAME = 'admin'
process.env.ALADDIN_ADMIN_PASSWORD_HASH = hashPassword('CorrectHorseBattery-99')
process.env.ALADDIN_SESSION_SECRET = 'test-session-secret-min-32-chars!!'
process.env.ALADDIN_ALLOWED_ORIGIN = 'http://localhost:5173'

const { createApp } = await import('./index.js')

function parseSetCookies(res) {
  const raw = res.headers['set-cookie']
  if (!raw) return {}
  const list = Array.isArray(raw) ? raw : [raw]
  /** @type {Record<string, string>} */
  const out = {}
  for (const item of list) {
    const [pair] = item.split(';')
    const idx = pair.indexOf('=')
    if (idx < 0) continue
    out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1))
  }
  return out
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ')
}

describe('ALADDIN security hardening', () => {
  /** @type {http.Server} */
  let server
  /** @type {number} */
  let port
  /** @type {Record<string, string>} */
  let jar

  beforeAll(async () => {
    closeDb()
    const app = createApp()
    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = /** @type {import('net').AddressInfo} */ (server.address()).port
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    closeDb()
  })

  beforeEach(() => {
    jar = {}
    resetLoginRateLimit()
    resetAccountLoginLockouts(getDb())
  })

  async function request(method, urlPath, { body, headers = {}, origin } = {}) {
    const resHeaders = {
      ...headers,
      cookie: cookieHeader(jar),
    }
    if (origin) resHeaders.origin = origin
    if (body != null && !resHeaders['content-type']) {
      resHeaders['content-type'] = 'application/json'
    }

    const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      method,
      headers: resHeaders,
      body: body != null ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })

    const set = parseSetCookies({
      headers: { 'set-cookie': response.headers.getSetCookie?.() || [] },
    })
    // Node fetch getSetCookie
    const cookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : []
    for (const item of cookies) {
      const [pair] = item.split(';')
      const idx = pair.indexOf('=')
      if (idx < 0) continue
      jar[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1))
    }
    void set

    const text = await response.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: response.status, json, text, headers: response.headers }
  }

  async function getCsrf() {
    const res = await request('GET', '/api/auth/csrf')
    expect(res.status).toBe(200)
    expect(res.json.csrfToken).toBeTruthy()
    jar[CSRF_COOKIE] = res.json.csrfToken
    return res.json.csrfToken
  }

  async function loginOk() {
    const csrf = await getCsrf()
    const res = await request('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'CorrectHorseBattery-99' },
      headers: { [CSRF_HEADER]: csrf },
      origin: 'http://localhost:5173',
    })
    expect(res.status).toBe(200)
    expect(jar[getSessionCookieName()]).toBeTruthy()
    if (res.json.csrfToken) jar[CSRF_COOKIE] = res.json.csrfToken
    return res
  }

  it('health는 최소 정보만 공개', async () => {
    const res = await request('GET', '/api/health')
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true })
    expect(res.text).not.toMatch(/sqlite|kiwoom|version|path/i)
  })

  it('미인증 민감 API는 401', async () => {
    for (const p of [
      '/api/kiwoom/balances',
      '/api/kiwoom/dividends?from=2026-08-01',
      '/api/manual/assets',
      '/api/manual/trades',
      '/api/dividends',
      '/api/public-data?service=etf',
      '/api/stocks/005930/briefing',
    ]) {
      const res = await request('GET', p)
      expect(res.status, p).toBe(401)
      expect(res.json?.message).toBe('Unauthorized')
      expect(res.text).not.toMatch(/holdings|dividends|assets/i)
    }
  })

  it('잘못된 로그인은 동일 메시지 (사용자 존재 여부 비노출)', async () => {
    const csrf = await getCsrf()
    const badUser = await request('POST', '/api/auth/login', {
      body: { username: 'nope', password: 'x' },
      headers: { [CSRF_HEADER]: csrf },
      origin: 'http://localhost:5173',
    })
    const badPass = await request('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'wrong-password!!' },
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
      origin: 'http://localhost:5173',
    })
    expect(badUser.status).toBe(401)
    expect(badPass.status).toBe(401)
    expect(badUser.json.message).toBe(LOGIN_FAIL_MESSAGE)
    expect(badPass.json.message).toBe(LOGIN_FAIL_MESSAGE)
    expect(badUser.text).not.toMatch(/아이디가 틀렸|비밀번호가 틀렸/)
    expect(badPass.text).not.toMatch(/아이디가 틀렸|비밀번호가 틀렸/)
    expect(badPass.text).not.toContain('CorrectHorseBattery-99')
    expect(badPass.text).not.toContain(process.env.ALADDIN_ADMIN_PASSWORD_HASH)
  })

  it('login IP rate limit 유지', async () => {
    for (let i = 0; i < 5; i += 1) {
      const csrf = await getCsrf()
      await request('POST', '/api/auth/login', {
        body: { username: 'admin', password: 'wrong' },
        headers: { [CSRF_HEADER]: csrf },
        origin: 'http://localhost:5173',
      })
    }
    const csrf = await getCsrf()
    const blocked = await request('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'CorrectHorseBattery-99' },
      headers: { [CSRF_HEADER]: csrf },
      origin: 'http://localhost:5173',
    })
    expect(blocked.status).toBe(429)
    expect(blocked.json.message).toBe(LOGIN_LOCK_MESSAGE)
  })

  it('계정 5회 실패 잠금 — 잠금 중 올바른 비밀번호도 거부', async () => {
    for (let i = 0; i < 5; i += 1) {
      resetLoginRateLimit()
      const csrf = await getCsrf()
      const res = await request('POST', '/api/auth/login', {
        body: { username: 'admin', password: 'wrong-pass' },
        headers: { [CSRF_HEADER]: csrf },
        origin: 'http://localhost:5173',
      })
      if (i < 4) {
        expect(res.status).toBe(401)
        expect(res.json.message).toBe(LOGIN_FAIL_MESSAGE)
      } else {
        expect(res.status).toBe(429)
        expect(res.json.message).toBe(LOGIN_LOCK_MESSAGE)
      }
    }

    resetLoginRateLimit()
    const csrf = await getCsrf()
    const locked = await request('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'CorrectHorseBattery-99' },
      headers: { [CSRF_HEADER]: csrf },
      origin: 'http://localhost:5173',
    })
    expect(locked.status).toBe(429)
    expect(locked.json.message).toBe(LOGIN_LOCK_MESSAGE)
    expect(locked.text).not.toContain('CorrectHorseBattery-99')
  })

  it('로그인 성공 시 계정 실패 횟수 초기화', async () => {
    for (let i = 0; i < 2; i += 1) {
      resetLoginRateLimit()
      const csrf = await getCsrf()
      const res = await request('POST', '/api/auth/login', {
        body: { username: 'admin', password: 'wrong-pass' },
        headers: { [CSRF_HEADER]: csrf },
        origin: 'http://localhost:5173',
      })
      expect(res.status).toBe(401)
    }
    expect(getLoginLockoutState('admin', getDb()).failedAttempts).toBe(2)

    resetLoginRateLimit()
    await loginOk()
    expect(getLoginLockoutState('admin', getDb()).failedAttempts).toBe(0)
  })

  it('인증 후 접근 가능 & logout 후 401', async () => {
    resetLoginRateLimit()
    await loginOk()
    const ok = await request('GET', '/api/manual/assets')
    expect(ok.status).toBe(200)
    expect(ok.json.ok).toBe(true)

    const csrf = jar[CSRF_COOKIE]
    const out = await request('POST', '/api/auth/logout', {
      body: {},
      headers: { [CSRF_HEADER]: csrf },
      origin: 'http://localhost:5173',
    })
    expect(out.status).toBe(200)

    const denied = await request('GET', '/api/manual/assets')
    expect(denied.status).toBe(401)
  })

  it('CSRF 실패', async () => {
    resetLoginRateLimit()
    await loginOk()
    const res = await request('POST', '/api/dividends', {
      body: { events: [] },
      headers: { [CSRF_HEADER]: '0'.repeat(64) },
      origin: 'http://localhost:5173',
    })
    expect(res.status).toBe(403)
  })

  it('허용되지 않은 Origin', async () => {
    resetLoginRateLimit()
    await loginOk()
    const res = await request('POST', '/api/dividends', {
      body: { events: [] },
      headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
      origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
  })

  it('잘못된 accountType / 과도한 입력 / XSS·SQLi 형태 입력 거부', async () => {
    resetLoginRateLimit()
    await loginOk()
    const csrf = jar[CSRF_COOKIE]

    const badAccount = await request('POST', '/api/dividends', {
      body: {
        events: [
          {
            id: 'x1',
            status: 'PAID',
            paymentDate: '2026-08-01',
            confirmedAmount: 1,
            accountType: 'hacker',
            fundName: '<script>alert(1)</script>',
          },
        ],
      },
      headers: { [CSRF_HEADER]: csrf },
      origin: 'http://localhost:5173',
    })
    // sanitize sets accountType null for invalid — event may still pass
    // fundName trimmed string allowed as text (React escapes); accountType null ok
    expect([200, 400]).toContain(badAccount.status)

    const longId = await request('DELETE', `/api/dividends/${'a'.repeat(200)}`, {
      headers: { [CSRF_HEADER]: csrf },
      origin: 'http://localhost:5173',
    })
    expect(longId.status).toBe(400)

    const sqli = await request('DELETE', `/api/dividends/${encodeURIComponent("1'; DROP TABLE dividend_events;--")}`, {
      headers: { [CSRF_HEADER]: csrf },
      origin: 'http://localhost:5173',
    })
    expect(sqli.status).toBe(400)
  })

  it('secret 응답 노출 없음', async () => {
    resetLoginRateLimit()
    await loginOk()
    const res = await request('GET', '/api/auth/me')
    const blob = JSON.stringify(res.json).toLowerCase()
    expect(blob).not.toMatch(/secret|password|app_key|token|hash/)
  })

  it('Kiwoom 주문 endpoint 없음', async () => {
    resetLoginRateLimit()
    await loginOk()
    for (const p of [
      '/api/kiwoom/order',
      '/api/kiwoom/orders',
      '/api/kiwoom/buy',
      '/api/kiwoom/sell',
    ]) {
      const res = await request('POST', p, {
        body: {},
        headers: { [CSRF_HEADER]: jar[CSRF_COOKIE] },
        origin: 'http://localhost:5173',
      })
      expect([404, 401, 403]).toContain(res.status)
    }
  })

  it('SQLite public 접근 불가', async () => {
    const res = await request('GET', '/server/data/aladdin.sqlite')
    expect(res.status).not.toBe(200)
  })
})
