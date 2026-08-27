/**
 * App.jsx — ALADDIN 단일 투자 대시보드 셸 (인증 게이트)
 */

import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import LoginForm from './components/LoginForm.jsx'
import { getAssets } from './services/assetStorage.js'
import { clearFinanceMemory } from './services/memoryFinanceStore.js'
import { migrateLegacyFinanceFromLocalStorage } from './services/financeLocalMigration.js'
import { fetchPricesForAssets } from './services/marketSync.js'
import {
  getMarketPrices,
  upsertMarketPrices,
  recordPortfolioSnapshot,
  migrateLegacyAssetsToTrades,
} from './services'
import { hydrateManualLedgerFromServer } from './services/manualPersistence.js'
import { hydrateDividendsFromServer } from './services/dividendPersistence.js'
import { fetchAuthMe, logout } from './services/authApi.js'
import { ensureCsrf, setCsrfToken } from './services/apiClient.js'
import { useMarketSchedule } from './hooks/useMarketSchedule.js'
import {
  getAutoMarketRefreshEnabled,
  markPassedSlotsCompleted,
} from './services/marketScheduleSettings.js'
import './styles/App.css'

function clearSensitiveClientState() {
  clearFinanceMemory()
}

function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [marketPrices, setMarketPrices] = useState([])
  const [assets, setAssets] = useState([])
  const [autoMarketRefresh] = useState(getAutoMarketRefreshEnabled)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const [persistenceReady, setPersistenceReady] = useState(false)

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

  function resetWorkspace() {
    clearSensitiveClientState()
    setAssets([])
    setMarketPrices([])
    setLastUpdatedAt(null)
    setPersistenceReady(false)
    setCsrfToken('')
  }

  useEffect(() => {
    function onUnauthorized() {
      resetWorkspace()
      setAuthenticated(false)
    }
    window.addEventListener('aladdin:unauthorized', onUnauthorized)
    return () => window.removeEventListener('aladdin:unauthorized', onUnauthorized)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function checkAuth() {
      try {
        await ensureCsrf()
        const me = await fetchAuthMe()
        if (cancelled) return
        setAuthenticated(Boolean(me.authenticated))
      } catch {
        if (!cancelled) setAuthenticated(false)
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    }

    checkAuth()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authenticated) return undefined

    let cancelled = false

    async function hydratePersistence() {
      // 1) legacy LS → SQLite (성공 시에만 LS 삭제)
      await migrateLegacyFinanceFromLocalStorage()
      if (cancelled) return

      const migrated = migrateLegacyAssetsToTrades()
      if (migrated > 0) {
        console.log(`[App] 기존 자산 ${migrated}건 → 거래 원장 마이그레이션`)
      }

      // 2) 서버 → 메모리 hydrate
      await hydrateManualLedgerFromServer()
      if (cancelled) return
      refreshAssets()

      await hydrateDividendsFromServer()
      if (cancelled) return

      const storedPrices = getMarketPrices()
      setMarketPrices(storedPrices)
      if (storedPrices.length > 0) {
        setLastUpdatedAt(new Date())
      }

      setPersistenceReady(true)
    }

    hydratePersistence()

    return () => {
      cancelled = true
    }
  }, [authenticated])

  async function handleLoginSuccess() {
    setAuthenticated(true)
  }

  async function handleLogout() {
    try {
      await logout()
    } catch {
      // ignore
    }
    resetWorkspace()
    setAuthenticated(false)
  }

  async function handleAssetAdded() {
    await handleAssetsChange()
  }

  async function refreshMarketPrices() {
    const currentAssets = getAssets()

    if (currentAssets.length === 0) {
      return getMarketPrices()
    }

    const allPrices = await fetchPricesForAssets(currentAssets)

    if (allPrices.length === 0) {
      throw new Error(
        '가져온 시세가 없습니다. API 서버 실행·종목코드·공공데이터 활용신청을 확인해 주세요.',
      )
    }

    const { total, inserted, updated } = upsertMarketPrices(allPrices)

    console.log(
      `[App] 시세 메모리 갱신 — 총 ${total}건 (신규 ${inserted}건, 갱신 ${updated}건)`,
    )

    const nextPrices = getMarketPrices()
    setMarketPrices(nextPrices)
    setLastUpdatedAt(new Date())
    tryRecordSnapshot(currentAssets, nextPrices)

    markPassedSlotsCompleted()

    return nextPrices
  }

  useMarketSchedule({
    enabled: autoMarketRefresh && authenticated,
    hasAssets: assets.length > 0,
    onRefresh: refreshMarketPrices,
  })

  if (!authChecked) {
    return (
      <div className="app">
        <p className="app-loading">확인 중…</p>
      </div>
    )
  }

  if (!authenticated) {
    return <LoginForm onSuccess={handleLoginSuccess} />
  }

  return (
    <div className="app">
      <main className="app-main">
        <Dashboard
          prices={marketPrices}
          assets={assets}
          lastUpdatedAt={lastUpdatedAt}
          persistenceReady={persistenceReady}
          onRefreshPrices={refreshMarketPrices}
          onAssetsChange={handleAssetsChange}
          onAssetAdded={handleAssetAdded}
          onTradesChange={refreshData}
          onKiwoomSynced={(date) => setLastUpdatedAt(date)}
          onLogout={handleLogout}
        />
      </main>
    </div>
  )
}

export default App
