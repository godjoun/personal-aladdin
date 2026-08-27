import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from './db.js'
import {
  listManualAssets,
  listManualTrades,
  mergeManualAssets,
  mergeManualTrades,
  replaceManualAssets,
  replaceManualTrades,
} from './manualRepository.js'

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-manual-'))
  const dbPath = path.join(dir, 'test.sqlite')
  closeDb()
  return getDb({ dbPath })
}

afterEach(() => {
  closeDb()
})

describe('manualRepository merge', () => {
  it('없는 asset만 insert 하고 기존은 덮어쓰지 않는다', () => {
    const db = makeTempDb()
    replaceManualAssets(
      [{ id: 'a1', name: '원본', symbol: '1' }],
      db,
    )

    const result = mergeManualAssets(
      [
        { id: 'a1', name: '덮어쓰기시도', symbol: '1' },
        { id: 'a2', name: '신규', symbol: '2' },
      ],
      db,
    )

    expect(result.inserted).toBe(1)
    expect(result.skipped).toBe(1)
    const assets = listManualAssets(db)
    expect(assets).toHaveLength(2)
    expect(assets.find((a) => a.id === 'a1').name).toBe('원본')
  })

  it('없는 trade만 insert 한다', () => {
    const db = makeTempDb()
    replaceManualTrades(
      [{ id: 't1', assetId: 'a1', side: 'buy', quantity: 1, price: 10 }],
      db,
    )
    const result = mergeManualTrades(
      [
        { id: 't1', assetId: 'a1', side: 'buy', quantity: 99, price: 10 },
        { id: 't2', assetId: 'a1', side: 'sell', quantity: 1, price: 12 },
      ],
      db,
    )
    expect(result.inserted).toBe(1)
    expect(listManualTrades(db).find((t) => t.id === 't1').quantity).toBe(1)
  })
})
