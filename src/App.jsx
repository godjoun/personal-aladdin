/**
 * App.jsx — ALADDIN 1988 PERSONAL 최상위 셸
 */

import { useEffect, useState } from 'react'
import AssetForm from './components/AssetForm.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CrisisSimulator from './pages/CrisisSimulator.jsx'
import Rebalancing from './pages/Rebalancing.jsx'
import Report from './pages/Report.jsx'
import StationPanel from './components/StationPanel.jsx'
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
import {
  calculateHoldingValue,
  calculateProfitLoss,
  calculateProfitRate,
  getLatestPriceBySymbol,
  getPriceHistoryBySymbol,
} from './utils/calculator.js'
import './styles/App.css'

const APP_VIEWS = {
  dashboard: 'dashboard',
  crisis: 'crisis',
  rebalance: 'rebalance',
  report: 'report',
}

const NAV_TABS = [
  { id: APP_VIEWS.dashboard, label: '자산배분 엔진' },
  { id: APP_VIEWS.crisis, label: '위기 시뮬레이터' },
  { id: APP_VIEWS.rebalance, label: '리밸런싱' },
  { id: APP_VIEWS.report, label: '리포트' },
]

function runCalculatorTests(prices) {
  if (prices.length === 0) {
    console.log('[App] 계산 테스트 건너뜀 — 저장된 시세가 없습니다.')
    return
  }

  const testSymbol = prices[0].symbol
  const latest = getLatestPriceBySymbol(prices, testSymbol)
  const history = getPriceHistoryBySymbol(prices, testSymbol)
  const latestPrice = Number(latest?.closePrice) || 0
  const testQuantity = 10
  const testAverageBuyPrice = latestPrice * 0.9

  const holdingValue = calculateHoldingValue(testQuantity, latestPrice)
  const profitLoss = calculateProfitLoss(
    testQuantity,
    testAverageBuyPrice,
    latestPrice,
  )
  const profitRate = calculateProfitRate(testAverageBuyPrice, latestPrice)

  console.log('[App] ── calculator 테스트 ──')
  console.log(`  종목 코드: ${testSymbol}`)
  console.log('  최신 시세:', latest)
  console.log(`  가격 이력: ${history.length}건`, history)
  console.log(`  보유 평가금액 (${testQuantity}주 × ${latestPrice}원):`, holdingValue)
  console.log(
    `  평가 손익 (평균매수가 ${testAverageBuyPrice}원 기준):`,
    profitLoss,
  )
  console.log('  수익률(%):', profitRate.toFixed(2))
}

/** ALADDIN 램프 아이콘 (SVG) */
function LampIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C8.5 2 6 4.5 6 8c0 2.2 1.2 4.1 3 5.2V16h6v-2.8c1.8-1.1 3-3 3-5.2 0-3.5-2.5-6-6-6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 18h6M10 21h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function App() {
  const [marketPrices, setMarketPrices] = useState([])
  const [assets, setAssets] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [trades, setTrades] = useState([])
  const [crtEnabled, setCrtEnabled] = useState(true)
  const [blackScreen, setBlackScreen] = useState(false)
  const [autoMarketRefresh, setAutoMarketRefresh] = useState(
    getAutoMarketRefreshEnabled,
  )
  const [activeView, setActiveView] = useState(APP_VIEWS.dashboard)

  function reloadSnapshots() {
    setSnapshots(getPortfolioSnapshots())
  }

  function reloadTrades() {
    setTrades(getTrades())
  }

  function refreshData() {
    refreshAssets()
    reloadTrades()
  }

  /** 자산 저장·삭제 후 시세 갱신 → 총 평가 자산 반영 */
  async function handleAssetsChange() {
    refreshAssets()
    reloadTrades()

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

  /**
   * 블랙록 Daily Marking — 오늘 포트폴리오 상태를 원장에 기록
   */
  function tryRecordSnapshot(currentAssets, currentPrices) {
    const result = recordPortfolioSnapshot(currentAssets, currentPrices)

    if (result.recorded) {
      console.log(
        `[App] 포트폴리오 스냅샷 기록 — ${result.snapshot.date} (총 ${result.total}일)`,
      )
      reloadSnapshots()
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
    reloadSnapshots()
    reloadTrades()
    setMarketPrices(getMarketPrices())
  }, [])

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
    runCalculatorTests(storedPrices)
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

  // 블랙 스크린 중 ESC 키로 해제
  useEffect(() => {
    if (!blackScreen) return

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setBlackScreen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [blackScreen])

  return (
    <div className={`app${crtEnabled ? ' app--crt' : ''}${blackScreen ? ' app--black-screen' : ''}`}>
      {blackScreen && (
        <div
          className="app__black-screen"
          onClick={() => setBlackScreen(false)}
          aria-label="블랙 스크린 해제"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setBlackScreen(false)
            }
          }}
        >
          <p className="app__black-screen-hint">
            프라이버시 모드
            <span>화면 아무 곳이나 클릭 · ESC · 우측 상단 체크 해제</span>
          </p>
          <button
            type="button"
            className="app__black-screen-exit"
            onClick={(e) => {
              e.stopPropagation()
              setBlackScreen(false)
            }}
          >
            해제
          </button>
        </div>
      )}

      <div
        className={`crt-overlay${crtEnabled ? ' crt-overlay--on' : ''}`}
        aria-hidden="true"
      />

      <header className="aladdin-header">
        <div className="aladdin-header__brand">
          <div className="aladdin-header__logo">
            <LampIcon />
          </div>
          <div className="aladdin-header__titles">
            <h1 className="aladdin-header__title">ALADDIN 1988 PERSONAL v1.88</h1>
            <p className="aladdin-header__subtitle">
              CLOSED LOCAL RISK SYSTEM / HOST: SECURE_STATION
            </p>
          </div>
        </div>

        <nav className="aladdin-nav" aria-label="메인 메뉴">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`aladdin-nav__tab${
                activeView === tab.id ? ' aladdin-nav__tab--active' : ''
              }`}
              onClick={() => setActiveView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="aladdin-header__controls">
          <label className="aladdin-control">
            <input
              type="checkbox"
              checked={blackScreen}
              onChange={(e) => setBlackScreen(e.target.checked)}
            />
            블랙 스크린
          </label>
          <label className="aladdin-control">
            <input
              type="checkbox"
              checked={crtEnabled}
              onChange={(e) => setCrtEnabled(e.target.checked)}
            />
            CRT 효과
          </label>
          <div className="aladdin-status">
            <span className="aladdin-status__dot" />
            LOCAL_MODE
          </div>
        </div>
      </header>

      <main className="app-main">
        <StationPanel />
        {activeView === APP_VIEWS.dashboard && (
          <Dashboard
            prices={marketPrices}
            assets={assets}
            snapshots={snapshots}
            trades={trades}
            onRefreshPrices={refreshMarketPrices}
            autoMarketRefresh={autoMarketRefresh}
            onAutoMarketRefreshChange={setAutoMarketRefresh}
            onAssetsChange={handleAssetsChange}
            onTradesChange={refreshData}
            onNavigate={setActiveView}
            assetFormSlot={
              <AssetForm
                assets={assets}
                onAssetsChange={handleAssetsChange}
                hideList
              />
            }
          />
        )}
        {activeView === APP_VIEWS.crisis && (
          <CrisisSimulator assets={assets} prices={marketPrices} />
        )}
        {activeView === APP_VIEWS.rebalance && (
          <Rebalancing assets={assets} prices={marketPrices} />
        )}
        {activeView === APP_VIEWS.report && (
          <Report
            assets={assets}
            prices={marketPrices}
            snapshots={snapshots}
          />
        )}
      </main>
    </div>
  )
}

export default App
