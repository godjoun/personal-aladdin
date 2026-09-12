import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db.js'
import {
  getChartAnnotationById,
  insertChartAnnotation,
  listChartAnnotations,
  softDeleteChartAnnotation,
  updateChartAnnotation,
} from './chartAnnotationRepository.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-chart-ann-'))
  closeDb()
  return getDb({ dbPath: path.join(dir, 'lab.sqlite') })
}

afterEach(() => {
  closeDb()
})

describe('chartAnnotationRepository', () => {
  it('생성·조회·수정·soft delete 를 한다', () => {
    const db = makeTempDb()
    const created = insertChartAnnotation(
      {
        symbol: 'BTCUSDT',
        timeframe: '15m',
        annotationType: 'SUPPORT',
        price: 65000,
        memo: 'local support',
      },
      db,
    )
    expect(created.symbol).toBe('BTCUSDT')
    expect(created.annotationType).toBe('SUPPORT')
    expect(created.price).toBe(65000)
    expect(created.deletedAt).toBeNull()

    const listed = listChartAnnotations({ symbol: 'BTCUSDT', timeframe: '15m' }, db)
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(created.id)

    const updated = updateChartAnnotation(created.id, { memo: 'updated' }, db)
    expect(updated.memo).toBe('updated')
    expect(updated.price).toBe(65000)

    const deleted = softDeleteChartAnnotation(created.id, db)
    expect(deleted.deletedAt).toBeTruthy()
    expect(listChartAnnotations({ symbol: 'BTCUSDT', timeframe: '15m' }, db)).toHaveLength(0)
    expect(getChartAnnotationById(created.id, db).deletedAt).toBeTruthy()
  })

  it('BTCUSDT/ETHUSDT 와 15m/1h/4h 를 각각 필터한다', () => {
    const db = makeTempDb()
    insertChartAnnotation(
      { symbol: 'BTCUSDT', timeframe: '15m', annotationType: 'SUPPORT', price: 1 },
      db,
    )
    insertChartAnnotation(
      { symbol: 'BTCUSDT', timeframe: '1h', annotationType: 'RESISTANCE', price: 2 },
      db,
    )
    insertChartAnnotation(
      {
        symbol: 'ETHUSDT',
        timeframe: '15m',
        annotationType: 'FVG',
        topPrice: 2600,
        bottomPrice: 2500,
        startTime: '2026-09-12T00:00:00.000Z',
        endTime: '2026-09-12T01:00:00.000Z',
      },
      db,
    )

    expect(listChartAnnotations({ symbol: 'BTCUSDT' }, db)).toHaveLength(2)
    expect(listChartAnnotations({ symbol: 'ETHUSDT' }, db)).toHaveLength(1)
    expect(listChartAnnotations({ symbol: 'BTCUSDT', timeframe: '15m' }, db)).toHaveLength(1)
    expect(listChartAnnotations({ symbol: 'BTCUSDT', timeframe: '4h' }, db)).toHaveLength(0)
  })
})
