/** Upbit REST reconciliation + private MyOrder collector lifecycle. */

import { getDb } from '../db.js'
import { readUpbitCredentials } from './upbitAuth.js'
import { createUpbitRestClient } from './upbitClient.js'
import { createUpbitCollector } from './upbitCollector.js'
import { getUpbitSyncState, listUpbitEpisodes, getUpbitEpisodeCount } from './upbitRepository.js'
import { reconcileUpbitOrders } from './upbitSyncService.js'

let activeIntegration = null

export function getUpbitIntegration() {
  return activeIntegration
}

export function setUpbitIntegration(integration) {
  activeIntegration = integration
}

export function resetUpbitIntegration() {
  try { activeIntegration?.stop?.() } catch { /* best effort */ }
  activeIntegration = null
}

export function createUpbitIntegration(options = {}) {
  const credentials = Object.hasOwn(options, 'credentials')
    ? options.credentials
    : readUpbitCredentials(options.env)
  const db = options.db || getDb()
  if (!credentials) {
    const integration = {
      configured: false,
      start() {},
      stop() {},
      async sync() {
        const error = new Error('Upbit integration is not configured')
        error.code = 'NOT_CONFIGURED'
        throw error
      },
      getStatus() {
        return {
          configured: false,
          connected: false,
          lastMessageAt: null,
          lastExecutionAt: null,
          lastSyncAt: getUpbitSyncState('lastSyncAt', db),
          reconnectCount: 0,
          lastError: null,
        }
      },
      listTrades(filter) {
        return { trades: listUpbitEpisodes(filter, db), total: getUpbitEpisodeCount(filter, db) }
      },
    }
    activeIntegration = integration
    return integration
  }

  const client = options.client || createUpbitRestClient({
    ...credentials,
    fetchImpl: options.fetchImpl,
  })
  let syncPromise = null
  let lastError = null
  const redact = (value, fallback) => {
    let text = String(value || fallback)
    for (const credential of [credentials.accessKey, credentials.secretKey]) {
      if (credential) text = text.split(credential).join('[REDACTED]')
    }
    return text
  }
  async function sync(syncOptions = {}) {
    if (syncPromise) return syncPromise
    syncPromise = reconcileUpbitOrders({ client, db, ...syncOptions })
      .then((result) => { lastError = null; return result })
      .catch((error) => {
        lastError = {
          code: redact(error?.code, 'SYNC_ERROR').slice(0, 80),
          message: redact(error?.message, 'Upbit sync failed').slice(0, 160),
        }
        throw error
      })
      .finally(() => { syncPromise = null })
    return syncPromise
  }
  const collector = options.collector || createUpbitCollector({
    ...credentials,
    db,
    WebSocketImpl: options.WebSocketImpl,
    reconcile: () => sync(),
  })
  const integration = {
    configured: true,
    start() {
      // 서버 시작 시 WebSocket 연결과 별개로 최초 누락 구간을 즉시 보정한다.
      // collector의 open/reconnect 보정은 같은 syncPromise를 공유하므로 중복 실행되지 않는다.
      void sync().catch(() => {})
      collector.start()
    },
    stop() { collector.stop() },
    sync,
    getStatus() {
      return {
        ...collector.getStatus(),
        configured: true,
        lastSyncAt: getUpbitSyncState('lastSyncAt', db),
        lastError: collector.getStatus().lastError || lastError,
      }
    },
    listTrades(filter) {
      return { trades: listUpbitEpisodes(filter, db), total: getUpbitEpisodeCount(filter, db) }
    },
  }
  activeIntegration = integration
  if (options.autoStart !== false) integration.start()
  return integration
}
