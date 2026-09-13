import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashPassword } from './auth/password.js'
import { closeDb, getDb } from './db.js'
import { CSRF_COOKIE, CSRF_HEADER } from './security/csrf.js'
import { upsertShadowTradeOutcome } from './tradingLab/shadowTradeRepository.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-journal-api-'))
process.env.NODE_ENV = 'test'
process.env.ALADDIN_DB_PATH = path.join(dir, 'test.sqlite')
process.env.ALADDIN_LOCAL_AUTH_BYPASS = 'false'
process.env.ALADDIN_ADMIN_USERNAME = 'journal-test'
process.env.ALADDIN_ADMIN_PASSWORD_HASH = hashPassword('LocalJournalTest-2026')
process.env.ALADDIN_SESSION_SECRET = 'test-only-journal-session-32-characters'
process.env.ALADDIN_ALLOWED_ORIGIN = 'http://localhost:5173'
const { createApp } = await import('./index.js')
const body = (overrides = {}) => ({ symbol: 'BTCUSDT', direction: 'LONG', recordType: 'OBSERVATION', timeframe: '1h', scenarioText: '4H 저항 구간 반응', reasonTags: ['resistance', 'FVG'], entryPrice: 100, revision: 0, requestId: randomUUID(), ...overrides })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+aD9sAAAAASUVORK5CYII=', 'base64')
let server, base, jar = {}, csrf
async function request(url, { method = 'GET', data, headers = {}, auth = true, token = true } = {}) {
  const response = await fetch(`${base}/api${url}`, {
    method, headers: {
      origin: 'http://localhost:5173',
      ...(auth ? { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      ...(token && csrf ? { [CSRF_HEADER]: csrf } : {}),
      ...(data !== undefined && !Buffer.isBuffer(data) ? { 'content-type': 'application/json' } : {}), ...headers,
    }, body: data === undefined ? undefined : Buffer.isBuffer(data) ? data : JSON.stringify(data),
  })
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0]; const equals = pair.indexOf('='); jar[pair.slice(0, equals)] = pair.slice(equals + 1)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  let json = null
  try { json = JSON.parse(bytes.toString()) } catch { /* image */ }
  return { status: response.status, headers: response.headers, json, bytes }
}
beforeAll(async () => {
  closeDb()
  const app = createApp({ marketDataProvider: null, liquidationCollector: false, tradeFlowCollector: false, marketStateRecorder: false, shadowTradeRuntime: false })
  server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  const token = await request('/auth/csrf')
  csrf = token.json.csrfToken
  expect(jar[CSRF_COOKIE]).toBeTruthy()
  const login = await request('/auth/login', { method: 'POST', data: { username: 'journal-test', password: 'LocalJournalTest-2026' } })
  expect(login.status).toBe(200)
  csrf = login.json.csrfToken
})
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); closeDb(); fs.rmSync(dir, { recursive: true, force: true }) })

describe('Trade Journal API', () => {
  it('requires authentication for list, details, writing and private images', async () => {
    for (const [url, method] of [['/trading-lab/journals?symbol=BTCUSDT', 'GET'], ['/trading-lab/journals', 'POST'], ['/trading-lab/shadow-trades/test/journal', 'GET'], ['/trading-lab/journals/test/images/test', 'GET'], ['/trading-lab/journals/test/images', 'POST']]) {
      expect((await request(url, { method, auth: false, data: method === 'POST' ? body() : undefined })).status).toBe(401)
    }
    expect((await request('/trading-lab/journals', { method: 'POST', token: false, data: body() })).status).toBe(403)
  })
  it.each([['symbol', 'SOLUSDT'], ['direction', 'BUY'], ['timeframe', '1m'], ['recordType', 'ORDER'], ['reasonTags', ['invalid']], ['hasStopPlan', 'yes'], ['scenarioText', ''], ['indicatorSnapshotJson', '{}']])('rejects bad %s without creating records', async (key, value) => {
    const response = await request('/trading-lab/journals', { method: 'POST', data: body({ [key]: value }) })
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.json)).not.toMatch(/sqlite|stack|\/Users\//)
  })
  it('creates nullable snapshots, preserves values after DB reopen and links outcome updates', async () => {
    const data = body()
    const created = await request('/trading-lab/journals', { method: 'POST', data })
    expect(created.status).toBe(201)
    const { trade, journal } = created.json
    expect(journal.indicatorSnapshot).toMatchObject({ kind: 'ENTRY_CAPTURE', marketStatus: 'NOT_CONFIGURED', indicators: { ema200: null } })
    const retry = await request('/trading-lab/journals', { method: 'POST', data })
    expect(retry.json.trade.id).toBe(trade.id)
    closeDb()
    const loaded = await request(`/trading-lab/shadow-trades/${trade.id}/journal`)
    expect(loaded.json.journal.id).toBe(journal.id)
    upsertShadowTradeOutcome(trade.id, { price4h: 105, return4hPct: 5 }, getDb())
    const results = await request('/trading-lab/journals?symbol=BTCUSDT&filter=review')
    expect(results.json.trades.find((t) => t.id === trade.id).outcome.return4hPct).toBe(5)
    expect(results.json.summary.needsReview).toBeGreaterThan(0)
    expect(loaded.headers.get('cache-control')).toBe('no-store')
  })
  it('saves review text with optimistic revision and freezes entry snapshot', async () => {
    const created = (await request('/trading-lab/journals', { method: 'POST', data: body({ direction: 'SHORT', symbol: 'ETHUSDT', takeProfitPrice: 90, stopLossPrice: 110 }) })).json
    expect(created.journal).toMatchObject({ entryPrice: 100, takeProfitPrice: 90, stopLossPrice: 110 })
    const patch = { timeframe: '1h', reasonTags: ['CVD'], scenarioText: 'updated', reviewText: '확인한 근거 부족', lessonText: '봉 마감 확인', reviewed: true, revision: 1, entryPrice: 100, takeProfitPrice: 88, stopLossPrice: 112 }
    const saved = await request(`/trading-lab/shadow-trades/${created.trade.id}/journal`, { method: 'PUT', data: patch })
    expect(saved.status).toBe(200)
    expect(saved.json.journal).toMatchObject({ takeProfitPrice: 88, stopLossPrice: 112, reviewedAt: expect.any(String) })
    expect(saved.json.journal.entryPlanSnapshot).toMatchObject({ takeProfitPrice: 90, stopLossPrice: 110 })
    expect(saved.json.journal.indicatorSnapshot).toEqual(created.journal.indicatorSnapshot)
    expect((await request(`/trading-lab/shadow-trades/${created.trade.id}/journal`, { method: 'PUT', data: patch })).status).toBe(409)
    const listed = await request('/trading-lab/journals?symbol=ETHUSDT&filter=reviewed')
    expect(listed.json.trades.find((t) => t.id === created.trade.id).journal).toMatchObject({ takeProfitPrice: 88, stopLossPrice: 112 })
  })
  it('uploads and privately retrieves images, rejects spoofing, limits size/count and deletes only selected attachment', async () => {
    const created = (await request('/trading-lab/journals', { method: 'POST', data: body() })).json
    const url = `/trading-lab/journals/${created.journal.id}/images`
    const uploadId = randomUUID()
    const headers = { 'content-type': 'image/png', 'X-File-Name': 'chart.png', 'X-Upload-Id': uploadId }
    const saved = await request(url, { method: 'POST', data: png, headers })
    expect(saved.status).toBe(201)
    expect(saved.json.images).toHaveLength(1)
    expect(saved.json.images[0]).not.toHaveProperty('storageName')
    expect((await request(url, { method: 'POST', data: png, headers })).json.images).toHaveLength(1)
    const imageUrl = saved.json.images[0].url.replace(/^\/api/, '')
    const fetched = await request(imageUrl)
    expect(fetched.bytes.equals(png)).toBe(true)
    expect(fetched.headers.get('content-type')).toContain('image/png')
    expect(fetched.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await request(imageUrl, { auth: false })).status).toBe(401)
    expect((await request(url, { method: 'POST', data: Buffer.from('<svg><script>alert(1)</script></svg>'), headers })).status).toBe(400)
    expect((await request(url, { method: 'POST', data: Buffer.alloc(5 * 1024 * 1024 + 1), headers })).status).toBe(413)
    for (let i = 0; i < 3; i++) expect((await request(url, { method: 'POST', data: png, headers: { ...headers, 'X-Upload-Id': randomUUID() } })).status).toBe(201)
    expect((await request(url, { method: 'POST', data: png, headers: { ...headers, 'X-Upload-Id': randomUUID() } })).status).toBe(409)
    const listed = await request('/trading-lab/journals?symbol=BTCUSDT')
    expect(listed.json.trades.find((item) => item.id === created.trade.id).journal.coverImageUrl).toContain('/images/')
    const deleted = await request(imageUrl, { method: 'DELETE' })
    expect(deleted.json.images).toHaveLength(3)
    expect((await request(imageUrl)).status).toBe(404)
    expect((await request(`/trading-lab/shadow-trades/${created.trade.id}/journal`)).status).toBe(200)
  })
})
