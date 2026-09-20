import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb } from '../db.js'
import { createUpbitIntegration, resetUpbitIntegration } from './upbitIntegration.js'

function tempDb() {
  closeDb()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-upbit-integration-'))
  return getDb({ dbPath: path.join(dir, 'test.sqlite') })
}

afterEach(() => {
  resetUpbitIntegration()
  closeDb()
})

describe('Upbit integration lifecycle', () => {
  it('start 시 최근 REST reconciliation과 WebSocket collector를 함께 시작한다', async () => {
    const db = tempDb()
    const client = {
      listClosedOrders: vi.fn(async () => []),
      getOrder: vi.fn(),
    }
    const collector = { start: vi.fn(), stop: vi.fn(), getStatus: () => ({ connected: false, lastError: null }) }
    const integration = createUpbitIntegration({
      credentials: { accessKey: 'a', secretKey: 's' },
      client, collector, db, autoStart: false,
    })
    integration.start()
    await vi.waitFor(() => expect(client.listClosedOrders).toHaveBeenCalledTimes(1))
    expect(collector.start).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(integration.getStatus().lastSyncAt).toBeTruthy())
  })

  it('sync error status에서 credential 값을 제거한다', async () => {
    const db = tempDb()
    const integration = createUpbitIntegration({
      credentials: { accessKey: 'private-access', secretKey: 'private-secret' },
      client: {
        listClosedOrders: async () => {
          throw Object.assign(new Error('bad private-secret'), { code: 'private-access' })
        },
      },
      collector: { start() {}, stop() {}, getStatus: () => ({ connected: false, lastError: null }) },
      db, autoStart: false,
    })
    await expect(integration.sync()).rejects.toThrow()
    expect(JSON.stringify(integration.getStatus())).not.toMatch(/private-access|private-secret/)
  })
})
