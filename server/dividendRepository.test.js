import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from './db.js'
import {
  deleteDividendEventById,
  isLocalDividendMigrated,
  listDividendEvents,
  migrateLocalDividendsOnce,
  upsertDividendEvent,
  upsertDividendEvents,
} from './dividendRepository.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-db-'))
  const dbPath = path.join(dir, 'test.sqlite')
  closeDb()
  const db = getDb({ dbPath })
  return { db, dbPath, dir }
}

afterEach(() => {
  closeDb()
})

describe('dividendRepository SQLite', () => {
  it('dividend insert 후 조회된다', () => {
    const { db } = makeTempDb()
    const result = upsertDividendEvent(
      {
        id: 'd1',
        sourceKey: 'kiwoom:isa:20260804:1',
        accountType: 'isa',
        symbol: '133690',
        fundName: 'TIGER 미국나스닥100',
        paymentDate: '2026-08-04',
        confirmedAmount: 510,
        status: 'PAID',
        source: 'KIWOOM',
      },
      db,
    )

    expect(result.action).toBe('inserted')
    expect(listDividendEvents(db)).toHaveLength(1)
    expect(listDividendEvents(db)[0].confirmedAmount).toBe(510)
  })

  it('sourceKey duplicate 는 upsert 한다', () => {
    const { db } = makeTempDb()
    upsertDividendEvent(
      {
        id: 'd1',
        sourceKey: 'same-key',
        fundName: 'A',
        paymentDate: '2026-08-04',
        confirmedAmount: 100,
        status: 'PAID',
        source: 'KIWOOM',
      },
      db,
    )
    const second = upsertDividendEvent(
      {
        id: 'd2',
        sourceKey: 'same-key',
        fundName: 'A',
        paymentDate: '2026-08-04',
        confirmedAmount: 200,
        status: 'PAID',
        source: 'KIWOOM',
      },
      db,
    )

    expect(second.action).toBe('updated')
    expect(listDividendEvents(db)).toHaveLength(1)
    expect(listDividendEvents(db)[0].confirmedAmount).toBe(200)
  })

  it('서버 재시작(재연결) 후에도 dividend 가 유지된다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-db-'))
    const dbPath = path.join(dir, 'persist.sqlite')

    closeDb()
    const db1 = getDb({ dbPath })
    upsertDividendEvent(
      {
        id: 'persist-1',
        sourceKey: 'persist-key',
        fundName: 'KODEX',
        paymentDate: '2026-08-19',
        confirmedAmount: 1415,
        status: 'PAID',
        source: 'KIWOOM',
      },
      db1,
    )
    db1.close()

    const db2 = getDb({ dbPath })
    const events = listDividendEvents(db2)
    expect(events).toHaveLength(1)
    expect(events[0].confirmedAmount).toBe(1415)
    db2.close()
  })

  it('localStorage migration 은 1회만 실행된다', () => {
    const { db } = makeTempDb()
    const local = [
      {
        id: 'local-1',
        sourceKey: 'local:1',
        fundName: 'Manual',
        paymentDate: '2026-08-01',
        confirmedAmount: 100,
        status: 'PAID',
        source: 'MANUAL',
      },
    ]

    const first = migrateLocalDividendsOnce(local, db)
    expect(first.migrated).toBe(true)
    expect(isLocalDividendMigrated(db)).toBe(true)

    const second = migrateLocalDividendsOnce(
      [
        ...local,
        {
          id: 'local-2',
          sourceKey: 'local:2',
          fundName: 'Dup',
          paymentDate: '2026-08-02',
          confirmedAmount: 999,
          status: 'PAID',
          source: 'MANUAL',
        },
      ],
      db,
    )

    expect(second.migrated).toBe(false)
    expect(second.reason).toBe('already_migrated')
    expect(listDividendEvents(db)).toHaveLength(1)
  })

  it('KIWOOM 이벤트는 수동으로 덮어쓰지 않는다', () => {
    const { db } = makeTempDb()
    upsertDividendEvent(
      {
        id: 'k1',
        sourceKey: 'k-key',
        fundName: 'KIWOOM ETF',
        paymentDate: '2026-08-04',
        confirmedAmount: 500,
        status: 'PAID',
        source: 'KIWOOM',
      },
      db,
    )

    const result = upsertDividendEvent(
      {
        id: 'k1',
        sourceKey: 'k-key',
        fundName: 'Hacked',
        paymentDate: '2026-08-04',
        confirmedAmount: 1,
        status: 'PAID',
        source: 'MANUAL',
      },
      db,
    )

    expect(result.action).toBe('skipped_kiwoom_readonly')
    expect(listDividendEvents(db)[0].fundName).toBe('KIWOOM ETF')
    expect(listDividendEvents(db)[0].confirmedAmount).toBe(500)
  })

  it('KIWOOM 이벤트 삭제는 거부한다', () => {
    const { db } = makeTempDb()
    upsertDividendEvent(
      {
        id: 'k-del',
        sourceKey: 'k-del',
        fundName: 'KIWOOM ETF',
        paymentDate: '2026-08-04',
        confirmedAmount: 500,
        status: 'PAID',
        source: 'KIWOOM',
      },
      db,
    )

    expect(deleteDividendEventById('k-del', db)).toEqual({
      ok: false,
      reason: 'kiwoom_readonly',
    })
    expect(listDividendEvents(db)).toHaveLength(1)
  })

  it('수동 이벤트는 수정·삭제 가능하다', () => {
    const { db } = makeTempDb()
    upsertDividendEvent(
      {
        id: 'm1',
        sourceKey: 'm1',
        fundName: 'Manual ETF',
        paymentDate: '2026-08-10',
        confirmedAmount: 300,
        status: 'PAID',
        source: 'MANUAL',
      },
      db,
    )

    upsertDividendEvent(
      {
        id: 'm1',
        sourceKey: 'm1',
        fundName: 'Manual ETF Updated',
        paymentDate: '2026-08-10',
        confirmedAmount: 350,
        status: 'PAID',
        source: 'MANUAL',
      },
      db,
    )

    expect(listDividendEvents(db)[0].confirmedAmount).toBe(350)
    expect(deleteDividendEventById('m1', db).ok).toBe(true)
    expect(listDividendEvents(db)).toHaveLength(0)
  })

  it('upsertDividendEvents 배치가 동작한다', () => {
    const { db } = makeTempDb()
    const result = upsertDividendEvents(
      [
        {
          id: 'b1',
          sourceKey: 'b1',
          confirmedAmount: 100,
          paymentDate: '2026-08-01',
          status: 'PAID',
          source: 'KIWOOM',
        },
        {
          id: 'b2',
          sourceKey: 'b2',
          confirmedAmount: 200,
          paymentDate: '2026-08-02',
          status: 'PAID',
          source: 'KIWOOM',
        },
      ],
      db,
    )
    expect(result.inserted).toBe(2)
    expect(result.total).toBe(2)
  })
})
