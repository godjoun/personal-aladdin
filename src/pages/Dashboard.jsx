/**
 * Dashboard.jsx — 포트폴리오 메인 화면
 */

import { useEffect, useState } from 'react'
import { removeAssetWithTrades } from '../services/tradeService.js'
import { calculateAssetClassAllocation } from '../utils/calculator.js'
import {
  buildAssetRows,
  calculatePortfolioSummary,
} from '../utils/portfolioRows.js'
import { simulateCrisisScenarios } from '../utils/riskEngine.js'
import {
  analyzeRebalancing,
  getTargetWeightSum,
} from '../utils/rebalanceEngine.js'
import { useNetworkRebalance } from '../hooks/useNetworkRebalance.js'
import DashboardMetrics from '../components/dashboard/DashboardMetrics.jsx'
import DashboardToolbar, { REFRESH_STATUS } from '../components/dashboard/DashboardToolbar.jsx'
import HoldingsTable from '../components/dashboard/HoldingsTable.jsx'
import DashboardSidebar from '../components/dashboard/DashboardSidebar.jsx'
import NetworkComparePanel from '../components/dashboard/NetworkComparePanel.jsx'
import PortfolioChart from '../components/PortfolioChart.jsx'
import PortfolioLedger from '../components/PortfolioLedger.jsx'
import TradeForm from '../components/TradeForm.jsx'
import '../styles/Dashboard.css'

function getMaxWeightDeviation(rebalance) {
  if (!rebalance.items.length) return 0
  return Math.max(...rebalance.items.map((item) => Math.abs(item.difference)))
}

function Dashboard({
  prices = [],
  assets = [],
  snapshots = [],
  trades = [],
  onRefreshPrices,
  autoMarketRefresh = true,
  onAutoMarketRefreshChange,
  onAssetsChange,
  onTradesChange,
  onNavigate,
  assetFormSlot,
}) {
  const [refreshStatus, setRefreshStatus] = useState(REFRESH_STATUS.IDLE)
  const {
    participating,
    networkLoading,
    networkError,
    refreshNetworkBenchmark,
    getActiveTargets,
    formatNetworkHint,
    targetSource,
  } = useNetworkRebalance()

  useEffect(() => {
    if (
      refreshStatus === REFRESH_STATUS.SUCCESS ||
      refreshStatus === REFRESH_STATUS.ERROR
    ) {
      const timer = setTimeout(() => setRefreshStatus(REFRESH_STATUS.IDLE), 3000)
      return () => clearTimeout(timer)
    }
  }, [refreshStatus])

  async function handleRefreshPrices() {
    if (refreshStatus === REFRESH_STATUS.LOADING) return

    setRefreshStatus(REFRESH_STATUS.LOADING)

    try {
      await onRefreshPrices()
      await refreshNetworkBenchmark()
      setRefreshStatus(REFRESH_STATUS.SUCCESS)
    } catch (error) {
      console.error('[Dashboard] 시세 갱신 실패:', error)
      setRefreshStatus(REFRESH_STATUS.ERROR)
    }
  }

  function handleDeleteAsset(id) {
    removeAssetWithTrades(id)
    onAssetsChange?.()
    onTradesChange?.()
  }

  const assetRows = buildAssetRows(assets, prices)
  const summary = calculatePortfolioSummary(assetRows)
  const allocation = calculateAssetClassAllocation(assetRows)
  const crisisSimulation = simulateCrisisScenarios(allocation)
  const activeTargets = getActiveTargets()
  const rebalanceCheck = analyzeRebalancing(allocation, activeTargets)
  const targetSum = getTargetWeightSum(activeTargets)
  const targetSumValid =
    targetSource === 'fixed' ? Math.abs(targetSum - 100) < 0.01 : targetSum > 0
  const maxDeviation = getMaxWeightDeviation(rebalanceCheck)
  const worstScenario = crisisSimulation.scenarios.find(
    (s) => s.id === crisisSimulation.worstScenarioId,
  )
  const rebalanceStatus = !targetSumValid
    ? '설정 오류'
    : rebalanceCheck.reviewCount > 0
      ? '점검 필요'
      : '적정'
  const hasValuation = allocation.totalValuedAmount > 0

  return (
    <div className="dashboard" aria-label="포트폴리오">
      <DashboardMetrics
        totalHoldingValue={summary.totalHoldingValue}
        worstScenario={worstScenario}
        maxDeviation={maxDeviation}
        rebalanceStatus={rebalanceStatus}
        targetSumValid={targetSumValid}
        targetSum={targetSum}
      />

      <NetworkComparePanel
        participating={participating}
        networkLoading={networkLoading}
        networkError={networkError}
        formatNetworkHint={formatNetworkHint}
        rebalanceCheck={rebalanceCheck}
        hasValuation={hasValuation}
      />

      <DashboardToolbar
        assetCount={assets.length}
        priceCount={prices.length}
        autoMarketRefresh={autoMarketRefresh}
        onAutoMarketRefreshChange={onAutoMarketRefreshChange}
        refreshStatus={refreshStatus}
        onRefresh={handleRefreshPrices}
      />

      {assets.length === 0 ? (
        <div className="dashboard__empty">
          <p>
            등록된 자산이 없습니다.
            <br />
            아래 폼에서 <strong>자산을 추가</strong>해 주세요.
          </p>
        </div>
      ) : (
        <div className="dashboard__workspace">
          <div className="dashboard__main-panel">
            {assetFormSlot}

            <TradeForm
              assets={assets}
              onTradesChange={() => {
                onTradesChange?.()
                onAssetsChange?.()
              }}
            />

            {summary.valuedCount < assets.length && (
              <p className="dashboard__notice">
                {assets.length - summary.valuedCount}건은 시세 없음 — 평가에서 제외
              </p>
            )}

            <HoldingsTable
              assetRows={assetRows}
              allocation={allocation}
              onDeleteAsset={handleDeleteAsset}
            />
          </div>

          <DashboardSidebar
            allocation={allocation}
            trades={trades}
            participating={participating}
            networkLoading={networkLoading}
            networkError={networkError}
            formatNetworkHint={formatNetworkHint}
            rebalanceCheck={rebalanceCheck}
            onNavigate={onNavigate}
          />
        </div>
      )}

      {assets.length === 0 && assetFormSlot}

      {assets.length > 0 && prices.length === 0 && (
        <div className="dashboard__empty dashboard__empty--spaced">
          <p>시세 데이터가 없습니다. API 설정 후 <strong>시세 갱신</strong>을 눌러 주세요.</p>
        </div>
      )}

      <PortfolioChart snapshots={snapshots} />
      <PortfolioLedger snapshots={snapshots} />
    </div>
  )
}

export default Dashboard
