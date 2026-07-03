/**
 * Rebalancing.jsx — 리밸런싱 전용 화면
 */

import { useState } from 'react'
import { calculateAssetClassAllocation } from '../utils/calculator.js'
import { buildAssetRows } from '../utils/portfolioRows.js'
import {
  analyzeRebalancing,
  getTargetWeightSum,
  REBALANCE_THRESHOLD,
} from '../utils/rebalanceEngine.js'
import {
  applyStrategyPreset,
  getActivePresetId,
  getPresetById,
  STRATEGY_PRESETS,
} from '../data/strategyPresets.js'
import { useNetworkRebalance } from '../hooks/useNetworkRebalance.js'
import { formatCurrency, formatPercent, getPnlClass } from '../utils/formatters.js'
import '../styles/WorkspacePages.css'

function Rebalancing({ assets = [], prices = [] }) {
  const [activePresetId, setActivePresetId] = useState(getActivePresetId)
  const [presetMessage, setPresetMessage] = useState('')
  const {
    participating,
    networkLoading,
    networkError,
    getActiveTargets,
    formatNetworkHint,
    targetSource,
  } = useNetworkRebalance()

  const assetRows = buildAssetRows(assets, prices)
  const allocation = calculateAssetClassAllocation(assetRows)

  const activeTargets = getActiveTargets()

  const rebalanceCheck = analyzeRebalancing(allocation, activeTargets)
  const targetSum = getTargetWeightSum(activeTargets)
  const targetSumValid =
    targetSource === 'fixed' ? Math.abs(targetSum - 100) < 0.01 : targetSum > 0
  const activePreset = getPresetById(activePresetId)

  function handleLoadPreset(presetId) {
    if (applyStrategyPreset(presetId)) {
      setActivePresetId(presetId)
      setPresetMessage(
        `${getPresetById(presetId)?.name} 전략을 적용했습니다. 네트워크 참여는 꺼집니다.`,
      )
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
        <span
          className={`workspace-page__status-badge${
            participating ? ' workspace-page__status-badge--network' : ''
          }`}
        >
          {participating ? '네트워크 참여 · 그룹 목표' : '개인 고정 전략'}
        </span>
        <span className="workspace-page__toolbar-meta">
          총 평가 {formatCurrency(allocation.totalValuedAmount)}
        </span>
      </div>

      {participating ? (
        <section className="workspace-section">
          <h3 className="workspace-section__title">그룹 목표</h3>
          <p className="workspace-section__desc">
            Network 패널에서 <strong>참여하기</strong>를 켜면 비중이 자동 업로드되고,
            아래 그룹 평균이 목표로 적용됩니다. 목표 방식(최신 / N일 평균)은 Data Pool 패널에서
            변경할 수 있습니다.
          </p>
          <p className="dashboard__rebalance-hint workspace-section__desc">
            {networkLoading
              ? '그룹 비중 불러오는 중…'
              : networkError
                ? networkError
                : formatNetworkHint()}
          </p>
        </section>
      ) : (
        <section className="workspace-section">
          <h3 className="workspace-section__title">전략 프리셋</h3>
          <p className="workspace-section__desc">
            프리셋을 불러오면 개인 고정 전략 목표 비중이 바뀝니다.
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

      <section className="workspace-section">
        <h3 className="workspace-section__title">
          {participating ? '그룹 목표 비중' : '목표 비중'}
        </h3>
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
