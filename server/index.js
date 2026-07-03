/**
 * server/index.js — ALADDIN Central Host
 * ─────────────────────────────────────────────────────────
 * 블랙록식 중앙 인프라 축소판:
 *   - 스테이션(클라이언트) 등록
 *   - 포트폴리오 데이터 업로드
 *   - 호스트(관리자) 조회
 *   - 시세 대조(Reconciliation)
 */

import crypto from 'crypto'
import cors from 'cors'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { requireAdminAuth, requireStationAuth, generateStationKey, hashStationKey } from './middleware.js'
import { reconcilePayload } from './reconcile.js'
import { buildHostReport } from './hostAnalytics.js'
import { loadStation, listStations, saveStation } from './storage.js'
import { proxyPublicData } from './marketProxy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env') })

const app = express()
const isProd = process.env.NODE_ENV === 'production'
const PORT = Number(process.env.PORT || process.env.CENTRAL_PORT) || 3001
const distPath = path.join(__dirname, '..', 'dist')

app.use(cors())
app.use(express.json({ limit: '5mb' }))
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')))

/** 공공데이터 API 프록시 — 배포 환경에서 브라우저가 API_KEY 없이 시세·종목 검색 */
app.get('/api/public-data', async (req, res) => {
  const service = req.query.service === 'stock' ? 'stock' : 'etf'
  const { service: _service, ...queryParams } = req.query

  try {
    const data = await proxyPublicData(service, queryParams)
    res.json(data)
  } catch (error) {
    console.error('[Central] public-data proxy 실패:', error.message)
    res.status(500).json({ error: error.message })
  }
})

/** 헬스 체크 */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ALADDIN Central Host',
    version: '1.0',
  })
})

/**
 * 스테이션 등록 — 클라이언트(친구 A 등)가 중앙에 연결할 때
 * stationKey 는 이 응답에서 한 번만 받을 수 있습니다.
 */
app.post('/api/stations/register', (req, res) => {
  const name = String(req.body?.name || 'SECURE_STATION').trim().slice(0, 64)
  const stationKey = generateStationKey()
  const stationId = crypto.randomUUID()

  const record = {
    id: stationId,
    name,
    keyHash: hashStationKey(stationKey),
    createdAt: new Date().toISOString(),
    lastSyncAt: null,
    latestPayload: null,
    reconciliation: null,
  }

  saveStation(record)

  res.status(201).json({
    stationId,
    stationKey,
    name,
    message: 'stationKey 를 안전한 곳에 보관하세요. 다시 표시되지 않습니다.',
  })
})

/** 스테이션 — 로컬 vault 업로드 */
app.post('/api/sync/push', requireStationAuth, async (req, res) => {
  const payload = req.body

  if (!payload || payload.version !== 1) {
    res.status(400).json({ error: '지원하지 않는 데이터 형식입니다. version: 1 필요' })
    return
  }

  if (!payload.consent?.hostMonitoring) {
    res.status(400).json({
      error: '호스트 모니터링 동의가 필요합니다. 업로드 전 동의 체크박스를 선택해 주세요.',
    })
    return
  }

  const reconciliation = await reconcilePayload(payload, process.env)

  const record = {
    ...req.station,
    lastSyncAt: new Date().toISOString(),
    latestPayload: payload,
    reconciliation,
  }

  saveStation(record)

  res.json({
    ok: true,
    stationId: record.id,
    syncedAt: record.lastSyncAt,
    reconciliation,
  })
})

/** 스테이션 — 본인 최신 데이터 조회 */
app.get('/api/sync/latest', requireStationAuth, (req, res) => {
  const station = loadStation(req.station.id)

  res.json({
    stationId: station.id,
    name: station.name,
    lastSyncAt: station.lastSyncAt,
    payload: station.latestPayload,
    reconciliation: station.reconciliation,
  })
})

/** 스테이션 — 네트워크 합산 비중 (리밸런싱 목표용) */
app.get('/api/network/benchmark', requireStationAuth, (_req, res) => {
  const report = buildHostReport(listStations())

  res.json({
    generatedAt: report.generatedAt,
    syncedStationCount: report.syncedStationCount,
    activeStationCount: report.activeStationCount,
    totalNetworkAum: report.totalNetworkAum,
    networkAllocation: report.networkAllocation,
  })
})

/** 관리자 — 전체 스테이션 목록 */
app.get('/api/admin/stations', requireAdminAuth, (_req, res) => {
  const stations = listStations().map((station) => ({
    id: station.id,
    name: station.name,
    createdAt: station.createdAt,
    lastSyncAt: station.lastSyncAt,
    assetCount: station.latestPayload?.assets?.length ?? 0,
    snapshotCount: station.latestPayload?.snapshots?.length ?? 0,
    tradeCount: station.latestPayload?.trades?.length ?? 0,
    totalValuedAmount:
      station.latestPayload?.snapshots?.[0]?.totalValuedAmount ?? null,
    reconciliationStatus: station.reconciliation?.status ?? null,
    mismatchCount: station.reconciliation?.mismatchCount ?? 0,
  }))

  res.json({ stations })
})

/** 관리자 — 호스트 전용 집계·벤치마크 리포트 (2층) */
app.get('/api/admin/report', requireAdminAuth, (_req, res) => {
  const report = buildHostReport(listStations())
  res.json(report)
})

/** 관리자 — 스테이션 상세 */
app.get('/api/admin/stations/:id', requireAdminAuth, (req, res) => {
  const station = loadStation(req.params.id)

  if (!station) {
    res.status(404).json({ error: '스테이션을 찾을 수 없습니다.' })
    return
  }

  res.json({
    id: station.id,
    name: station.name,
    createdAt: station.createdAt,
    lastSyncAt: station.lastSyncAt,
    payload: station.latestPayload,
    reconciliation: station.reconciliation,
  })
})

/** 배포 환경: React 빌드(dist)를 같은 서버에서 제공 */
if (isProd && fs.existsSync(distPath)) {
  app.use(express.static(distPath))

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/admin')) {
      next()
      return
    }
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`[Central] ALADDIN Host running on port ${PORT}`)
  console.log(`[Central] Admin console: /admin/`)
  if (isProd) {
    console.log('[Central] Production mode — serving dist/')
  }
})
