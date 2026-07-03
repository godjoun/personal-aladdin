/**
 * Rebalancing.jsx — 리밸런싱 전용 화면
 */

import { useEffect, useState } from 'react'
import { calculateAssetClassAllocation } from '../utils/calculator.js'
import { buildAssetRows } from '../utils/portfolioRows.js'
import {
  analyzeRebalancing,
  getTargetWeightSum,
  networkAllocationToTargets,
  REBALANCE_THRESHOLD,
} from '../utils/rebalanceEngine.js'
import {
  applyStrategyPreset,
  getActivePresetId,
  getFixedTargetAllocation,
  getPresetById,
  STRATEGY_PRESETS,
} from '../data/strategyPresets.js'
import {
  fetchNetworkBenchmark,
  getCachedNetworkBenchmark,
} from '../services/networkBenchmark.js'
import {
  getRebalanceMode,
  setRebalanceMode,
  getNetworkTargetMode,
  setNetworkTargetMode,
  getNetworkWindowDays,
  setNetworkWindowDays,
} from '../services/rebalanceSettings.js'
import NetworkTargetControls from '../components/NetworkTargetControls.jsx'
import { formatCurrency, formatPercent, getPnlClass } from '../utils/formatters.js'
import '../styles/WorkspacePages.css'

function Rebalancing({ assets = [], prices = [] }) {
  const [rebalanceMode, setRebalanceModeState] = useState(getRebalanceMode)
  const [activePresetId, setActivePresetId] = useState(getActivePresetId)
  const [networkBenchmark, setNetworkBenchmark] = useState(getCachedNetworkBenchmark)
  const [networkLoading, setNetworkLoading] = useState(false)
  const [networkError, setNetworkError] = useState('')
  const [networkTargetMode, setNetworkTargetModeState] = useState(getNetworkTargetMode)
  const [networkWindowDays, setNetworkWindowDaysState] = useState(getNetworkWindowDays)
  const [presetMessage, setPresetMessage] = useState('')

  const assetRows = buildAssetRows(assets, prices)
  const allocation = calculateAssetClassAllocation(assetRows)

  const activeTargets =
    rebalanceMode === 'network' && networkBenchmark?.networkAllocation?.length
      ? networkAllocationToTargets(networkBenchmark.networkAllocation)
      : getFixedTargetAllocation()

  const rebalanceCheck = analyzeRebalancing(allocation, activeTargets)
  const targetSum = getTargetWeightSum(activeTargets)
  const targetSumValid =
    rebalanceMode === 'fixed' ? Math.abs(targetSum - 100) < 0.01 : targetSum > 0
  const activePreset = getPresetById(activePresetId)

  async function refreshNetworkBenchmark() {
    if (rebalanceMode !== 'network') return

    setNetworkLoading(true)
    setNetworkError('')

    try {
      const data = await fetchNetworkBenchmark({
        targetMode: networkTargetMode,
        windowDays: networkWindowDays,
      })
      setNetworkBenchmark(data)
    } catch (error) {
      setNetworkError(error.message)
    } finally {
      setNetworkLoading(false)
    }
  }

  useEffect(() => {
    refreshNetworkBenchmark()
  }, [rebalanceMode, networkTargetMode, networkWindowDays])

  function handleNetworkTargetModeChange(mode) {
    setNetworkTargetMode(mode)
    setNetworkTargetModeState(mode)
  }

  function handleNetworkWindowDaysChange(days) {
    setNetworkWindowDays(days)
    setNetworkWindowDaysState(days)
  }

  function formatNetworkBenchmarkHint() {
    if (!networkBenchmark) {
      return '스테이션 등록·데이터 업로드 후 네트워크 비중이 목표로 적용됩니다.'
    }

    const modeLabel =
      networkBenchmark.targetMode === 'average'
        ? `최근 ${networkBenchmark.windowDays}일 평균 (${networkBenchmark.sampleDays ?? 0}일 표본)`
        : '최신 업로드 기준'

    return `목표 = ${networkBenchmark.syncedStationCount}개 스테이션 합산 · ${modeLabel}`
  }

  function handleModeChange(mode) {
    setRebalanceMode(mode)
    setRebalanceModeState(mode)
    setPresetMessage('')
  }

  function handleLoadPreset(presetId) {
    if (applyStrategyPreset(presetId)) {
      setActivePresetId(presetId)
      setRebalanceModeState('fixed')
      setPresetMessage(`${getPresetById(presetId)?.name} 전략을 목표 비중으로 적용했습니다.`)
    }
  }

  if (assets.length === 0) {
    return (
      <div className="workspace-page">
        <header className="workspace-page__header">
          <h2 className="workspace-page__title">리밸런싱</h2>
        </header>
        <div className="workspace-page__empty">자산을 등록한 뒤 리밸런싱 점검을 이용할 수 있습니다.</div>
      </div>
    )
  }

  return (
    <div className="workspace-page">
      <header className="workspace-page__header">
        <h2 className="workspace-page__title">리밸런싱</h2>
        <p className="workspace-page__desc">
          현재 자산군 비중과 목표 비중을 비교합니다. 차이가 {REBALANCE_THRESHOLD}%p 이상이면
          점검이 필요합니다. (매매 주문은 실행하지 않습니다)
        </p>
      </header>

      <div className="workspace-page__toolbar">
        <div className="dashboard__rebalance-mode" role="group" aria-label="리밸런싱 목표">
          <button
            type="button"
            className={`dashboard__rebalance-mode-btn${
              rebalanceMode === 'fixed' ? ' dashboard__rebalance-mode-btn--active' : ''
            }`}
            onClick={() => handleModeChange('fixed')}
          >
            고정 전략
          </button>
          <button
            type="button"
            className={`dashboard__rebalance-mode-btn${
              rebalanceMode === 'network' ? ' dashboard__rebalance-mode-btn--active' : ''
            }`}
            onClick={() => handleModeChange('network')}
          >
            네트워크
          </button>
        </div>
        <span className="workspace-page__toolbar-meta">
          총 평가 {formatCurrency(allocation.totalValuedAmount)}
        </span>
      </div>

      {rebalanceMode === 'fixed' && (
        <section className="workspace-section">
          <h3 className="workspace-section__title">전략 프리셋</h3>
          <p className="workspace-section__desc">
            프리셋을 불러오면 <strong>고정 전략</strong> 목표 비중이 바뀝니다.
            {activePreset && (
              <>
                {' '}
                현재: <strong>{activePreset.name}</strong>
              </>
            )}
          </p>
          <div className="dashboard__presets">
            {STRATEGY_PRESETS.map((preset) => (
              <article
                key={preset.id}
                className={`dashboard__preset dashboard__preset--${preset.accent}${
                  activePresetId === preset.id ? ' dashboard__preset--active' : ''
                }`}
              >
                <h4 className="dashboard__preset-name">{preset.name}</h4>
                <p className="dashboard__preset-desc">{preset.desc}</p>
                {activePresetId === preset.id ? (
                  <span className="dashboard__preset-badge">In Use</span>
                ) : (
                  <button
                    type="button"
                    className="workspace-preset__load-btn"
                    onClick={() => handleLoadPreset(preset.id)}
                  >
                    Load
                  </button>
                )}
              </article>
            ))}
          </div>
          {presetMessage && <p className="workspace-page__message">{presetMessage}</p>}
        </section>
      )}

      {rebalanceMode === 'network' && (
        <section className="workspace-section">
          <h3 className="workspace-section__title">네트워크 목표</h3>
          <NetworkTargetControls
            targetMode={networkTargetMode}
            windowDays={networkWindowDays}
            onTargetModeChange={handleNetworkTargetModeChange}
            onWindowDaysChange={handleNetworkWindowDaysChange}
          />
          <p className="dashboard__rebalance-hint workspace-section__desc">
            {networkLoading
              ? '네트워크 비중 불러오는 중…'
              : networkError
                ? networkError
                : formatNetworkBenchmarkHint()}
          </p>
        </section>
      )}

      <section className="workspace-section">
        <h3 className="workspace-section__title">목표 비중</h3>
        {!targetSumValid && (
          <p className="workspace-page__warn">
            목표 비중 합계가 100%가 아닙니다 ({targetSum.toFixed(1)}%)
          </p>
        )}
        <div className="workspace-target-grid">
          {Object.entries(activeTargets).map(([assetClass, weight]) => (
            <div key={assetClass} className="workspace-target-item">
              <span className="workspace-target-item__label">{assetClass}</span>
              <span className="workspace-target-item__value">{weight}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-section">
        <h3 className="workspace-section__title">점검 결과</h3>
        {allocation.totalValuedAmount <= 0 ? (
          <p className="workspace-page__empty">시세 데이터가 필요합니다.</p>
        ) : (
          <div className="workspace-rebalance-table">
            {rebalanceCheck.items.map((item) => (
              <div
                key={item.assetClass}
                className={`workspace-rebalance-row${
                  item.needsReview ? ' workspace-rebalance-row--alert' : ''
                }`}
              >
                <span className="workspace-rebalance-row__class">{item.assetClass}</span>
                <span className="workspace-rebalance-row__weights">
                  현재 {item.currentWeight.toFixed(1)}% → 목표 {item.targetWeight.toFixed(1)}%
                </span>
                <span className={`workspace-rebalance-row__diff ${getPnlClass(item.difference)}`}>
                  {item.difference > 0 ? '+' : ''}
                  {item.difference.toFixed(1)}%p
                </span>
                <span
                  className={
                    item.needsReview ? 'dashboard__cell--loss' : 'dashboard__cell--profit'
                  }
                >
                  {item.needsReview ? '점검 필요' : '적정'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Rebalancing
