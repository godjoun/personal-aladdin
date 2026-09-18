import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateTradingLab } from './schema.js'
import { TRADE_JOURNAL_COLUMNS, TRADE_JOURNAL_IMAGE_COLUMNS } from './journalSchema.js'
import { validateJournal } from './journalValidation.js'
import { calculateIndicators, historicalIndicatorSnapshot } from './indicatorSnapshot.js'
import { createTradeJournal, saveTradeJournal } from './journalService.js'
import { getJournalDetail, listJournalTrades } from './journalRepository.js'
import { insertShadowTrade, upsertShadowTradeOutcome } from './shadowTradeRepository.js'
import { evaluateJournalOutcome } from './journalOutcome.js'
import { validateJournalImage } from './journalImages.js'

const input = (overrides = {}) => validateJournal({ symbol: 'BTCUSDT', direction: 'LONG', recordType: 'OBSERVATION', timeframe: '1h', reasonTags: ['FVG'], scenarioText: '저항 구간 반응 관찰', entryPrice: 100, revision: 0, requestId: randomUUID(), ...overrides }, { create: true }).value
const snapshot = { version: 1, kind: 'ENTRY_CAPTURE', marketStatus: 'NOT_CONFIGURED', referencePrice: null, indicators: { ema20: null }, annotations: [{ id: 'at-entry', price: 100 }] }
let db
beforeEach(() => { db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateTradingLab(db) })
afterEach(() => db.close())

describe('Trade Journal persistence', () => {
  it('migrates additively and idempotently without modifying existing records', () => {
    const trade = insertShadowTrade({ symbol: 'BTCUSDT', direction: 'SHORT', source: 'MANUAL_USER', entryPrice: 100 }, db)
    migrateTradingLab(db)
    expect(getJournalDetail(trade.id, db).trade).toMatchObject({ direction: 'SHORT', entryPrice: 100 })
    expect(getJournalDetail(trade.id, db).journal).toBeNull()
  })
  it('adds missing journal columns to an older table without dropping data', async () => {
    const trade = insertShadowTrade({ symbol: 'BTCUSDT', direction: 'LONG', source: 'MANUAL_USER', entryPrice: 100 }, db)
    db.exec('DROP TABLE trade_journal_image')
    db.exec('DROP TABLE trade_journal')
    db.exec(`
      CREATE TABLE trade_journal (
        id TEXT PRIMARY KEY,
        shadowTradeId TEXT NOT NULL UNIQUE REFERENCES shadow_trade(id),
        timeframe TEXT NOT NULL,
        indicatorSnapshotJson TEXT NOT NULL,
        entryPlanSnapshotJson TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)
    db.exec(`
      CREATE TABLE trade_journal_image (
        id TEXT PRIMARY KEY,
        journalId TEXT NOT NULL REFERENCES trade_journal(id)
      )
    `)
    migrateTradingLab(db)
    const journalCols = db.prepare('PRAGMA table_info(trade_journal)').all().map((row) => row.name)
    const imageCols = db.prepare('PRAGMA table_info(trade_journal_image)').all().map((row) => row.name)
    expect(TRADE_JOURNAL_COLUMNS.map(([name]) => name).every((name) => journalCols.includes(name))).toBe(true)
    expect(TRADE_JOURNAL_IMAGE_COLUMNS.map(([name]) => name).every((name) => imageCols.includes(name))).toBe(true)
    expect(journalCols).not.toContain('recordedAt')
    const saved = await createTradeJournal(input({ emotionTag: '차분함' }), { db, capture: async () => snapshot })
    expect(saved.journal).toMatchObject({ emotionTag: '차분함', entryPlanSnapshot: { emotionTag: '차분함' } })
    expect(saved.journal.entryPlanSnapshot.recordedAt).toBeTruthy()
    expect(getJournalDetail(trade.id, db).trade.entryPrice).toBe(100)
  })
  it('atomically creates a shadow trade, journal, initial outcome and immutable snapshots', async () => {
    const form = input()
    const created = await createTradeJournal(form, { db, capture: async () => snapshot })
    expect(created.trade).toMatchObject({ symbol: 'BTCUSDT', direction: 'LONG', entryPrice: 100, strategyVersion: 'journal-v1', outcome: { result: 'UNRESOLVED' } })
    expect(created.journal.indicatorSnapshot).toMatchObject(snapshot)
    const saved = saveTradeJournal(created.trade.id, { ...form, scenarioText: '수정된 메모', reasonTags: ['OI'], revision: 1, reviewText: '다음 봉 확인', reviewed: true }, { db })
    expect(saved.journal).toMatchObject({ revision: 2, scenarioText: '수정된 메모', reasonTags: ['OI'] })
    expect(saved.journal.indicatorSnapshot).toEqual(created.journal.indicatorSnapshot)
    expect(saved.journal.entryPlanSnapshot.scenarioText).toBe(form.scenarioText)
    expect(saved.journal.reviewedAt).toBeTruthy()
    expect(saveTradeJournal(created.trade.id, { ...form, revision: 1 }, { db })).toEqual({ conflict: true })
  })
  it('persists entryPrice / takeProfitPrice / stopLossPrice and leverage plan fields', async () => {
    const form = input({
      entryPrice: 77250, takeProfitPrice: 78100, stopLossPrice: 76900,
      leverage: 10, marginMode: 'ISOLATED', marginAmount: 100, positionSize: 1000, liquidationPrice: 69800,
    })
    const created = await createTradeJournal(form, { db, capture: async () => snapshot })
    expect(created.journal).toMatchObject({
      entryPrice: 77250, takeProfitPrice: 78100, stopLossPrice: 76900,
      leverage: 10, marginMode: 'ISOLATED', marginAmount: 100, positionSize: 1000, liquidationPrice: 69800,
    })
    const listed = listJournalTrades({ symbol: 'BTCUSDT' }, db)
    expect(listed.trades[0].journal).toMatchObject({
      entryPrice: 77250, takeProfitPrice: 78100, stopLossPrice: 76900,
      leverage: 10, marginMode: 'ISOLATED', marginAmount: 100, positionSize: 1000, liquidationPrice: 69800,
    })
    const saved = saveTradeJournal(created.trade.id, {
      ...form, takeProfitPrice: 79000, stopLossPrice: 76000, leverage: 8, marginMode: 'CROSS', revision: 1,
    }, { db })
    expect(saved.journal).toMatchObject({ takeProfitPrice: 79000, stopLossPrice: 76000, leverage: 8, marginMode: 'CROSS' })
    expect(saved.journal.entryPlanSnapshot).toMatchObject({
      takeProfitPrice: 78100, stopLossPrice: 76900, leverage: 10, marginMode: 'ISOLATED', marginAmount: 100, positionSize: 1000, liquidationPrice: 69800,
    })
    expect(getJournalDetail(created.trade.id, db).journal).toMatchObject({
      entryPrice: 77250, takeProfitPrice: 79000, stopLossPrice: 76000,
      leverage: 8, marginMode: 'CROSS', marginAmount: 100, positionSize: 1000, liquidationPrice: 69800,
    })
    expect(listJournalTrades({ symbol: 'BTCUSDT' }, db).trades[0].journal).toMatchObject({
      leverage: 8, marginMode: 'CROSS', marginAmount: 100, positionSize: 1000, liquidationPrice: 69800,
    })
  })
  it('retries and concurrent double submissions create one record', async () => {
    const form = input()
    const results = await Promise.all([1, 2].map(() => createTradeJournal(form, { db, capture: async () => snapshot })))
    expect(results[0].trade.id).toBe(results[1].trade.id)
    expect(db.prepare('SELECT COUNT(*) AS count FROM shadow_trade').get().count).toBe(1)
  })
  it('rolls back the shadow record if journal insertion fails', async () => {
    db.exec("CREATE TRIGGER fail_journal BEFORE INSERT ON trade_journal BEGIN SELECT RAISE(ABORT, 'test failure'); END")
    await expect(createTradeJournal(input(), { db, capture: async () => snapshot })).rejects.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS count FROM shadow_trade').get().count).toBe(0)
  })
  it('does not silently use missing or stale market prices; allows explicitly entered reference prices', async () => {
    expect(await createTradeJournal(input({ entryPrice: null }), { db, capture: async () => snapshot })).toMatchObject({ ok: false, field: 'entryPrice' })
    expect(await createTradeJournal(input({ entryPrice: null }), { db, capture: async () => ({ ...snapshot, marketStatus: 'OK', referencePrice: 100, marketStale: true }) })).toMatchObject({ ok: false })
    expect((await createTradeJournal(input(), { db, capture: async () => snapshot })).journal.indicatorSnapshot.indicators.ema20).toBeNull()
  })
  it('old trades get only historically saved metrics and never live backfilled indicators', () => {
    const trade = insertShadowTrade({ symbol: 'ETHUSDT', direction: 'SHORT', source: 'MANUAL_USER', entryPrice: 100, cvdNotional: 500 }, db)
    const saved = saveTradeJournal(trade.id, input({ symbol: 'ETHUSDT' }), { db })
    expect(saved.journal.indicatorSnapshot).toMatchObject({ kind: 'HISTORICAL_PARTIAL', indicators: null, orderFlow: { cvdNotional: 500 }, annotations: [] })
    expect(historicalIndicatorSnapshot(trade, { autoEvidence: { linkedAnnotations: [{ id: 'saved-annotation' }] } }).annotations).toEqual([{ id: 'saved-annotation' }])
  })
  it('includes old trades, filters reviews by available outcomes, paginates, and joins future results', async () => {
    const saved = await createTradeJournal(input(), { db, capture: async () => snapshot })
    expect(listJournalTrades({ symbol: 'BTCUSDT', filter: 'review' }, db).trades).toHaveLength(0)
    upsertShadowTradeOutcome(saved.trade.id, { price4h: 105, return4hPct: 5 }, db)
    const review = listJournalTrades({ symbol: 'BTCUSDT', filter: 'review' }, db)
    expect(review.summary.needsReview).toBe(1)
    expect(review.trades[0].outcome.return4hPct).toBe(5)
    expect(review.trades[0].journal).toMatchObject({ scenarioText: '저항 구간 반응 관찰', coverImageUrl: null, reviewText: null })
    expect(listJournalTrades({ symbol: 'ETHUSDT' }, db).trades).toHaveLength(0)
    expect(listJournalTrades({ symbol: 'BTCUSDT', offset: 1 }, db).trades).toHaveLength(0)
  })
  it.each([
    ['symbol', 'SOLUSDT'], ['direction', 'BUY'], ['timeframe', '1m'], ['recordType', 'ORDER'],
    ['reasonTags', ['untrusted']], ['entryPrice', -1], ['invalidationPrice', Infinity], ['hasStopPlan', 'true'],
    ['emotionTag', 'untrusted'], ['marginMode', 'INVALID'], ['leverage', 0], ['marginAmount', -1], ['reviewed', 'true'], ['revision', -1], ['scenarioText', 'x'.repeat(4001)], ['indicatorSnapshot', {}],
  ])('rejects invalid %s', (key, value) => {
    const body = { symbol: 'BTCUSDT', direction: 'LONG', recordType: 'OBSERVATION', timeframe: '1h', reasonTags: [], scenarioText: '관찰', revision: 0, requestId: randomUUID(), [key]: value }
    expect(validateJournal(body, { create: true }).ok).toBe(false)
  })
})

describe('Indicator snapshot math', () => {
  const interval = 3600000
  const candles = Array.from({ length: 250 }, (_, i) => ({ timestamp: i * interval, close: 100 + i, volume: 10 }))
  it('calculates EMA 20/50/200, RSI 14, and volume ratio from closed candles only', () => {
    const result = calculateIndicators([...candles, { timestamp: 250 * interval, close: 999999, volume: 999999 }], '1h', 250 * interval + 1000)
    expect(result.candleCount).toBe(250)
    expect(result.ema20).toBeCloseTo(339.5)
    expect(result.ema50).toBeCloseTo(324.5)
    expect(result.ema200).toBeCloseTo(249.5)
    expect(result.rsi14).toBe(100)
    expect(result.volumeMa20).toBe(10)
    expect(result.volumeRatio).toBe(1)
  })
  it('does not bridge gaps, invent insufficient metrics or divide by zero', () => {
    expect(calculateIndicators([], '1h', 0)).toMatchObject({ ema20: null, ema200: null, rsi14: null, volumeRatio: null })
    expect(calculateIndicators(candles.filter((_, i) => i !== 245), '1h', 250 * interval).candleCount).toBe(4)
    const flat = candles.map((c) => ({ ...c, close: 100, volume: 0 }))
    expect(calculateIndicators(flat, '1h', 250 * interval)).toMatchObject({ rsi14: 50, volumeRatio: null, volumeMa20: 0 })
  })
})

describe('Journal horizon tracking', () => {
  const base = { direction: 'LONG', entryPrice: 100, createdAt: new Date(0).toISOString() }
  it('never substitutes current prices for missing historical data', () => {
    const result = evaluateJournalOutcome({ ...base, nowMs: 86400000, currentPrice: 999, candles: [] })
    expect(result).toMatchObject({ price1h: null, price24h: null, result: 'UNRESOLVED', status: 'EVALUATING' })
  })
  it('uses closed candle timing, preserves observed outcomes and respects LONG/SHORT sign', () => {
    const candle = { timestamp: 2700000, close: 105, high: 106, low: 98 }
    expect(evaluateJournalOutcome({ ...base, nowMs: 3599999, candles: [candle] }).price1h).toBeNull()
    expect(evaluateJournalOutcome({ ...base, nowMs: 3600000, candles: [candle] }).return1hPct).toBe(5)
    expect(evaluateJournalOutcome({ ...base, direction: 'SHORT', nowMs: 3600000, candles: [candle] }).return1hPct).toBe(-5)
    expect(evaluateJournalOutcome({ ...base, nowMs: 8000000, candles: [], previous: { price1h: 105, maxFavorableMovePct: 6 } })).toMatchObject({ price1h: 105, maxFavorableMovePct: 6 })
  })
  it('excludes pre-entry and post-24h excursions and closes only when all horizons exist', () => {
    const candles = [1, 4, 12, 24].map((h) => ({ timestamp: h * 3600000 - 900000, close: 101, high: 102, low: 99 }))
    candles.push({ timestamp: -900000, close: 100, high: 999, low: 1 }, { timestamp: 86400000, close: 101, high: 999, low: 1 })
    expect(evaluateJournalOutcome({ ...base, nowMs: 90000000, candles })).toMatchObject({ status: 'CLOSED', price24h: 101, maxFavorableMovePct: 2, maxAdverseMovePct: -1 })
  })
})

describe('Journal image verification', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+aD9sAAAAASUVORK5CYII=', 'base64')
  it('accepts real PNG bytes and rejects spoofed format, SVG, oversized and traversal names', () => {
    expect(validateJournalImage(png, 'image/png', 'chart.png')).toMatchObject({ mime: 'image/png' })
    expect(validateJournalImage(png, 'image/jpeg', 'chart.jpg')).toBeNull()
    expect(validateJournalImage(png, 'image/png', '../chart.png')).toBeNull()
    expect(validateJournalImage(png, 'image/png', 'chart.html')).toBeNull()
    expect(validateJournalImage(Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png', 'chart.png')).toBeNull()
    expect(validateJournalImage(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 'chart.png')).toBeNull()
    expect(validateJournalImage(Buffer.concat([png, Buffer.from('<script>')]), 'image/png', 'chart.png')).toBeNull()
  })
})
