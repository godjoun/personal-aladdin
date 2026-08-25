/**
 * App.jsx — ALADDIN 단일 투자 대시보드 셸
 * ─────────────────────────────────────────────────────────
 * 1차 UI 통합: 화면에는 Dashboard 만 렌더링합니다.
 * Crisis / Rebalancing / Report / Station / Network 파일은 유지하되
 * 네비게이션·CRT·블랙스크린 UI 는 노출하지 않습니다.
 */

import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import { getAssets } from './services/assetStorage.js'
import { fetchPricesForAssets } from './services/marketSync.js'
import {
  getMarketPrices,
  upsertMarketPrices,
  getPortfolioSnapshots,
  recordPortfolioSnapshot,
  getTrades,
  migrateLegacyAssetsToTrades,
} from './services'
import { useMarketSchedule } from './hooks/useMarketSchedule.js'
import {
  getAutoMarketRefreshEnabled,
  markPassedSlotsCompleted,
} from './services/marketScheduleSettings.js'
import { maybeAutoPushToCentral, rememberHomeAppUrl } from './services/stationClient.js'
import './styles/App.css'

function App() {
  const [marketPrices, setMarketPrices] = useState([])
  const [assets, setAssets] = useState([])
  const [autoMarketRefresh] = useState(getAutoMarketRefreshEnabled)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)

  function refreshData() {
    refreshAssets()
  }

  async function handleAssetsChange() {
    refreshAssets()

    const currentAssets = getAssets()
    if (currentAssets.length === 0) {
      return
    }

    try {
      await refreshMarketPrices()
    } catch (error) {
      console.warn('[App] 자산 변경 후 시세 갱신 실패:', error.message)
    }
  }

  function tryRecordSnapshot(currentAssets, currentPrices) {
    const result = recordPortfolioSnapshot(currentAssets, currentPrices)

    if (result.recorded) {
      console.log(
        `[App] 포트폴리오 스냅샷 기록 — ${result.snapshot.date} (총 ${result.total}일)`,
      )
    }

    return result
  }

  function refreshAssets() {
    const currentAssets = getAssets()
    setAssets(currentAssets)

    const currentPrices = getMarketPrices()
    if (currentPrices.length > 0) {
      tryRecordSnapshot(currentAssets, currentPrices)
    }
  }

  useEffect(() => {
    rememberHomeAppUrl()

    const migrated = migrateLegacyAssetsToTrades()
    if (migrated > 0) {
      console.log(`[App] 기존 자산 ${migrated}건 → 거래 원장 마이그레이션`)
    }
    refreshAssets()

    // 스냅샷·거래 원장은 내부 기록용으로 유지 (화면 비노출)
    getPortfolioSnapshots()
    getTrades()

    const storedPrices = getMarketPrices()
    setMarketPrices(storedPrices)
    if (storedPrices.length > 0) {
      setLastUpdatedAt(new Date())
    }
  }, [])

  async function handleAssetAdded() {
    await handleAssetsChange()
  }

  function handleTradeRecorded() {
    // 네트워크 참여 유도 UI 는 1차에서 비노출
  }

  async function refreshMarketPrices() {
    const currentAssets = getAssets()
    const allPrices = await fetchPricesForAssets(currentAssets)

    if (allPrices.length === 0) {
      throw new Error(
        '가져온 시세가 없습니다. 자산 종목코드·API_KEY·활용신청을 확인해 주세요.',
      )
    }

    const { total, inserted, updated } = upsertMarketPrices(allPrices)

    console.log(
      `[App] localStorage 저장 완료 — 총 ${total}건 (신규 ${inserted}건, 갱신 ${updated}건)`,
    )

    const storedPrices = getMarketPrices()
    setMarketPrices(storedPrices)
    setLastUpdatedAt(new Date())
    tryRecordSnapshot(currentAssets, storedPrices)

    markPassedSlotsCompleted()

    const autoPush = await maybeAutoPushToCentral()
    if (autoPush) {
      console.log('[App] 자동 업로드 완료 —', autoPush.reconciliation?.status ?? 'ok')
    }

    return storedPrices
  }

  useMarketSchedule({
    enabled: autoMarketRefresh,
    hasAssets: assets.length > 0,
    onRefresh: refreshMarketPrices,
  })

  return (
    <div className="app">
      <main className="app-main">
        <Dashboard
          prices={marketPrices}
          assets={assets}
          lastUpdatedAt={lastUpdatedAt}
          onRefreshPrices={refreshMarketPrices}
          onAssetsChange={handleAssetsChange}
          onAssetAdded={handleAssetAdded}
          onTradeRecorded={handleTradeRecorded}
          onTradesChange={refreshData}
        />
      </main>
    </div>
  )
}

export default App
