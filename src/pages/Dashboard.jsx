/**
 * Dashboard.jsx — ALADDIN 1988 메인 워크스페이스
 */

import { useEffect, useState } from 'react'
import { removeAssetWithTrades } from '../services/tradeService.js'
import { calculateAssetClassAllocation } from '../utils/calculator.js'
import {
  buildAssetRows,
  calculatePortfolioSummary,
} from '../utils/portfolioRows.js'
import {
  calculateMaxDrawdown,
  enrichSnapshotsWithDailyChange,
  formatSnapshotDate,
} from '../utils/snapshotAnalytics.js'
import { simulateCrisisScenarios } from '../utils/riskEngine.js'
import {
  analyzeRebalancing,
  DEFAULT_TARGET_ALLOCATION,
  getTargetWeightSum,
  networkAllocationToTargets,
} from '../utils/rebalanceEngine.js'
import {
  fetchNetworkBenchmark,
  getCachedNetworkBenchmark,
} from '../services/networkBenchmark.js'
import {
  getRebalanceMode,
  setRebalanceMode,
} from '../services/rebalanceSettings.js'
import { setAutoMarketRefreshEnabled } from '../services/marketScheduleSettings.js'
import PortfolioChart from '../components/PortfolioChart.jsx'
import TradeForm from '../components/TradeForm.jsx'
import TradeLog from '../components/TradeLog.jsx'
import '../styles/Dashboard.css'

const REFRESH_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
}

const REFRESH_BUTTON_LABELS = {
  [REFRESH_STATUS.IDLE]: '시세 데이터 갱신',
  [REFRESH_STATUS.LOADING]: '갱신 중...',
  [REFRESH_STATUS.SUCCESS]: '갱신 완료',
  [REFRESH_STATUS.ERROR]: '갱신 실패',
}

const ASSET_TYPE_LABELS = {
  주식: '주식 (Equity)',
  채권: '채권 (Bond)',
  부동산: '부동산 (RE)',
  현금: '현금 (Cash)',
  암호화폐: '암호화폐 (Crypto)',
  기타: '기타 (Other)',
}

const LAYER_COLORS = ['#3498db', '#9b59b6', '#f39c12', '#2ecc71', '#e74c3c', '#1abc9c', '#95a5a6']

const STRATEGY_PRESETS = [
  {
    id: 'dalio',
    name: 'Ray Dalio Classic',
    desc: 'All-Weather · 4자산 방어형',
    accent: 'gold',
  },
  {
    id: 'defense',
    name: '3-Asset Defense',
    desc: '주식·채권·현금 3축 방어',
    accent: 'orange',
  },
  {
    id: 'classic',
    name: 'Classic 60/40',
    desc: '주식 60% · 채권 40%',
    accent: 'gray',
    active: true,
  },
]

function formatCurrency(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(rate) {
  if (rate === null || rate === undefined) return '—'
  const sign = rate > 0 ? '+' : ''
  return `${sign}${rate.toFixed(2)}%`
}

function formatProfitLoss(amount) {
  if (amount === null || amount === undefined) return '—'
  const sign = amount > 0 ? '+' : ''
  return `${sign}${formatCurrency(amount)}`
}

function getCellPnlClass(value) {
  if (value === null || value === undefined) return ''
  return value >= 0 ? 'dashboard__cell--profit' : 'dashboard__cell--loss'
}

function getCardPnlClass(value) {
  if (value === null || value === undefined) return ''
  return value >= 0 ? 'dashboard__metric-value--profit' : 'dashboard__metric-value--loss'
}

function getMaxWeightDeviation(rebalance) {
  if (!rebalance.items.length) return 0
  return Math.max(...rebalance.items.map((item) => Math.abs(item.difference)))
}

/**
 * Daily Ledger — 블랙록식 일별 포트폴리오 원장
 */
function PortfolioLedger({ snapshots }) {
  const enriched = enrichSnapshotsWithDailyChange(snapshots)
  const mdd = calculateMaxDrawdown(snapshots)

  if (snapshots.length === 0) {
    return (
      <section className="dashboard__ledger">
        <h3 className="dashboard__ledger-title">Daily Portfolio Ledger</h3>
        <p className="dashboard__ledger-empty">
          매매와 무관하게 <strong>시세 갱신</strong> 시 오늘 평가액이 기록됩니다.
          일주일에 한 번만 갱신해도 추이가 쌓입니다.
        </p>
      </section>
    )
  }

  return (
    <section className="dashboard__ledger">
      <div className="dashboard__ledger-header">
        <h3 className="dashboard__ledger-title">Daily Portfolio Ledger</h3>
        <div className="dashboard__ledger-stats">
          <span className="dashboard__ledger-stat">
            기록 {snapshots.length}일
          </span>
          {mdd.mddPercent < 0 && (
            <span className="dashboard__ledger-stat dashboard__ledger-stat--danger">
              MDD {mdd.mddPercent.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      <div className="dashboard__table-wrap">
        <table className="dashboard__table dashboard__table--ledger">
          <thead>
            <tr>
              <th>기준일</th>
              <th>총 평가액</th>
              <th>전일 대비</th>
              <th>평가손익</th>
              <th>위기 예상 손실</th>
              <th>기록 시각</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((row) => (
              <tr key={row.date}>
                <td data-label="기준일" className="dashboard__cell--mono">
                  {formatSnapshotDate(row.date)}
                </td>
                <td data-label="총 평가액" className="dashboard__cell--value">
                  {formatCurrency(row.totalValuedAmount)}
                </td>
                <td
                  data-label="전일 대비"
                  className={getCellPnlClass(row.dailyChangePercent)}
                >
                  {row.dailyChangePercent !== null
                    ? formatPercent(row.dailyChangePercent)
                    : '—'}
                </td>
                <td
                  data-label="평가손익"
                  className={getCellPnlClass(row.totalProfitLoss)}
                >
                  {formatProfitLoss(row.totalProfitLoss)}
                </td>
                <td data-label="위기 예상 손실" className="dashboard__cell--loss">
                  {row.risk?.expectedLossAmount != null
                    ? formatProfitLoss(row.risk.expectedLossAmount)
                    : '—'}
                </td>
                <td data-label="기록 시각" className="dashboard__cell--mono">
                  {new Date(row.recordedAt).toLocaleString('ko-KR', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PortfolioLayers({ allocation }) {
  const { groups, totalValuedAmount } = allocation

  if (groups.length === 0) {
    return (
      <p className="dashboard__sidebar-empty">
        시세가 있는 자산이 없습니다.
      </p>
    )
  }

  return (
    <>
      <div className="dashboard__structural-bar" role="img" aria-label="자산군 비중 막대">
        {groups.map((group, index) => (
          <div
            key={group.assetClass}
            className="dashboard__structural-segment"
            style={{
              width: `${group.weight}%`,
              backgroundColor: LAYER_COLORS[index % LAYER_COLORS.length],
            }}
            title={`${group.assetClass} ${group.weight.toFixed(1)}%`}
          />
        ))}
      </div>

      <ul className="dashboard__layer-legend">
        {groups.map((group, index) => (
          <li key={group.assetClass} className="dashboard__layer-item">
            <span
              className="dashboard__layer-dot"
              style={{ backgroundColor: LAYER_COLORS[index % LAYER_COLORS.length] }}
            />
            <span className="dashboard__layer-name">{group.assetClass}</span>
            <span className="dashboard__layer-weight">{group.weight.toFixed(1)}%</span>
            <span className="dashboard__layer-value">
              {formatCurrency(group.totalValue)}
            </span>
          </li>
        ))}
      </ul>

      <p className="dashboard__layer-total">
        합계 {formatCurrency(totalValuedAmount)}
      </p>
    </>
  )
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
  assetFormSlot,
}) {
  const [refreshStatus, setRefreshStatus] = useState(REFRESH_STATUS.IDLE)
  const [rebalanceMode, setRebalanceModeState] = useState(getRebalanceMode)
  const [networkBenchmark, setNetworkBenchmark] = useState(getCachedNetworkBenchmark)
  const [networkLoading, setNetworkLoading] = useState(false)
  const [networkError, setNetworkError] = useState('')

  useEffect(() => {
    if (
      refreshStatus === REFRESH_STATUS.SUCCESS ||
      refreshStatus === REFRESH_STATUS.ERROR
    ) {
      const timer = setTimeout(() => setRefreshStatus(REFRESH_STATUS.IDLE), 3000)
      return () => clearTimeout(timer)
    }
  }, [refreshStatus])

  async function refreshNetworkBenchmark() {
    if (rebalanceMode !== 'network') return

    setNetworkLoading(true)
    setNetworkError('')

    try {
      const data = await fetchNetworkBenchmark()
      setNetworkBenchmark(data)
    } catch (error) {
      setNetworkError(error.message)
    } finally {
      setNetworkLoading(false)
    }
  }

  useEffect(() => {
    refreshNetworkBenchmark()
  }, [rebalanceMode])

  function handleRebalanceModeChange(mode) {
    setRebalanceMode(mode)
    setRebalanceModeState(mode)
  }

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

  const activeTargets =
    rebalanceMode === 'network' && networkBenchmark?.networkAllocation?.length
      ? networkAllocationToTargets(networkBenchmark.networkAllocation)
      : DEFAULT_TARGET_ALLOCATION

  const rebalanceCheck = analyzeRebalancing(allocation, activeTargets)

  const targetSum = getTargetWeightSum(activeTargets)
  const targetSumValid =
    rebalanceMode === 'fixed' ? Math.abs(targetSum - 100) < 0.01 : targetSum > 0
  const maxDeviation = getMaxWeightDeviation(rebalanceCheck)
  const worstScenario = crisisSimulation.scenarios.find(
    (s) => s.id === crisisSimulation.worstScenarioId,
  )

  const rebalanceStatus =
    !targetSumValid
      ? '설정 오류'
      : rebalanceCheck.reviewCount > 0
        ? '위험'
        : '정상'

  const rebalanceStatusClass =
    !targetSumValid || rebalanceCheck.reviewCount > 0
      ? 'system-monitor__value--danger'
      : ''

  return (
    <div className="dashboard" aria-label="자산 대시보드">
      {/* ── 시스템 배너 + 모니터 ── */}
      <div className="system-banners">
        <div className="system-banner">
          <p className="system-banner__title">100% Independent Asset Defense Architecture</p>
          <p className="system-banner__text">
            모든 데이터는 로컬 브라우저에 저장됩니다. 외부 서버로 자산 정보가
            전송되지 않습니다.
          </p>
        </div>
        <div className="system-banner">
          <p className="system-banner__title">All-Weather Risk Control Principles</p>
          <p className="system-banner__text">
            자산군 비중·위기 시나리오·리밸런싱 점검을 통해 포트폴리오 리스크를
            한눈에 파악합니다.
          </p>
        </div>
        <div className="system-monitor">
          <p className="system-monitor__title">System State Monitor</p>
          <div className="system-monitor__row">
            <span className="system-monitor__label">총 평가 자산</span>
            <span className="system-monitor__value">
              {formatCurrency(summary.totalHoldingValue)}
            </span>
          </div>
          <div className="system-monitor__row">
            <span className="system-monitor__label">보유 종목</span>
            <span className="system-monitor__value">{assets.length} EA</span>
          </div>
          <div className="system-monitor__row">
            <span className="system-monitor__label">리밸런싱 상태</span>
            <span className={`system-monitor__value ${rebalanceStatusClass}`}>
              {rebalanceStatus}
            </span>
          </div>
        </div>
      </div>

      {/* ── 핵심 지표 4카드 ── */}
      <div className="dashboard__metrics">
        <article className="dashboard__metric-card dashboard__metric-card--gold">
          <p className="dashboard__metric-label">총 평가 자산</p>
          <p className="dashboard__metric-value dashboard__metric-value--gold">
            {formatCurrency(summary.totalHoldingValue)}
          </p>
        </article>
        <article className="dashboard__metric-card">
          <p className="dashboard__metric-label">위기 시 예상 손실</p>
          <p className={`dashboard__metric-value ${getCardPnlClass(worstScenario?.expectedLossAmount ?? 0)}`}>
            {worstScenario
              ? formatProfitLoss(worstScenario.expectedLossAmount)
              : '—'}
          </p>
          {worstScenario && (
            <p className="dashboard__metric-sub">{worstScenario.name}</p>
          )}
        </article>
        <article className="dashboard__metric-card">
          <p className="dashboard__metric-label">최대 비중 괴리</p>
          <p className="dashboard__metric-value dashboard__metric-value--danger">
            {maxDeviation.toFixed(1)}%p
          </p>
        </article>
        <article
          className={`dashboard__metric-card${
            !targetSumValid ? ' dashboard__metric-card--alert' : ''
          }`}
        >
          <p className="dashboard__metric-label">현재 리스크 상태</p>
          <p className="dashboard__metric-value dashboard__metric-value--danger">
            {rebalanceStatus}
          </p>
          {!targetSumValid && (
            <p className="dashboard__metric-sub">
              목표 비중 합계가 100%가 아닙니다 ({targetSum}%)
            </p>
          )}
        </article>
      </div>

      {/* ── 갱신 버튼 ── */}
      <div className="dashboard__toolbar">
        <span className="dashboard__badge">
          보유 {assets.length}건 · 시세 {prices.length}건
        </span>
        <div className="dashboard__toolbar-actions">
          <label className="dashboard__auto-refresh">
            <input
              type="checkbox"
              checked={autoMarketRefresh}
              onChange={(e) => {
                const checked = e.target.checked
                setAutoMarketRefreshEnabled(checked)
                onAutoMarketRefreshChange?.(checked)
              }}
            />
            <span>
              자동 시세 갱신
              <small>평일 09:05 · 15:35 KST</small>
            </span>
          </label>
          <button
            type="button"
            className={`dashboard__refresh-btn dashboard__refresh-btn--${refreshStatus}`}
            onClick={handleRefreshPrices}
            disabled={refreshStatus === REFRESH_STATUS.LOADING}
          >
            {REFRESH_BUTTON_LABELS[refreshStatus]}
          </button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="dashboard__empty">
          <p>
            등록된 보유 자산이 없습니다.
            <br />
            아래 <strong>자산 등록 터미널</strong>에서 자산을 추가해 주세요.
          </p>
        </div>
      ) : (
        <div className="dashboard__workspace">
          {/* ── 좌측: 프리셋 + 등록 + 테이블 ── */}
          <div className="dashboard__main-panel">
            <div className="dashboard__panel-header">
              <h2 className="dashboard__panel-title">Asset Allocation Manager</h2>
              <span className="dashboard__panel-tag">LOCAL</span>
            </div>

            <div className="dashboard__presets">
              {STRATEGY_PRESETS.map((preset) => (
                <article
                  key={preset.id}
                  className={`dashboard__preset dashboard__preset--${preset.accent}${
                    preset.active ? ' dashboard__preset--active' : ''
                  }`}
                >
                  <h3 className="dashboard__preset-name">{preset.name}</h3>
                  <p className="dashboard__preset-desc">{preset.desc}</p>
                  {preset.active ? (
                    <span className="dashboard__preset-badge">In Use</span>
                  ) : (
                    <span className="dashboard__preset-badge dashboard__preset-badge--muted">
                      Load
                    </span>
                  )}
                </article>
              ))}
            </div>

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

            <div className="dashboard__table-section">
              <h3 className="dashboard__table-title">Portfolio Holdings</h3>
              <div className="dashboard__table-wrap">
                <table className="dashboard__table">
                  <thead>
                    <tr>
                      <th>자산 / 티커</th>
                      <th>유형</th>
                      <th>수량</th>
                      <th>평가금액</th>
                      <th>현재 비중</th>
                      <th>손익</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {assetRows.map((row) => {
                      const currentWeight =
                        row.hasPrice && allocation.totalValuedAmount > 0
                          ? (row.holdingValue / allocation.totalValuedAmount) * 100
                          : null

                      return (
                        <tr key={row.id}>
                          <td data-label="자산">
                            <span className="dashboard__asset-name">{row.name}</span>
                            <span className="dashboard__asset-symbol">{row.symbol}</span>
                            {row.hasPrice && row.profitRate !== null && (
                              <span
                                className={`dashboard__asset-pnl ${getCellPnlClass(row.profitRate)}`}
                              >
                                {formatPercent(row.profitRate)}
                              </span>
                            )}
                          </td>
                          <td data-label="유형">
                            <span className="dashboard__type-badge">
                              {ASSET_TYPE_LABELS[row.assetType] || row.assetType}
                            </span>
                          </td>
                          <td data-label="수량" className="dashboard__cell--mono">
                            {row.quantity}
                          </td>
                          <td data-label="평가금액" className="dashboard__cell--value">
                            {row.hasPrice ? (
                              formatCurrency(row.holdingValue)
                            ) : (
                              <span className="dashboard__no-price">시세 없음</span>
                            )}
                          </td>
                          <td data-label="비중" className="dashboard__cell--mono">
                            {currentWeight !== null
                              ? `${currentWeight.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td
                            data-label="손익"
                            className={getCellPnlClass(row.profitLoss)}
                          >
                            {formatProfitLoss(row.profitLoss)}
                          </td>
                          <td data-label="삭제">
                            <button
                              type="button"
                              className="dashboard__delete-btn"
                              onClick={() => handleDeleteAsset(row.id)}
                              aria-label={`${row.name} 삭제`}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── 우측: 구조 레이어 + 위기 + 리밸런싱 ── */}
          <aside className="dashboard__sidebar">
            <section className="dashboard__sidebar-panel">
              <h3 className="dashboard__sidebar-title">Portfolio Structural Layers</h3>
              <PortfolioLayers allocation={allocation} />
            </section>

            <section className="dashboard__sidebar-panel">
              <TradeLog trades={trades} />
            </section>

            <section className="dashboard__sidebar-panel">
              <h3 className="dashboard__sidebar-title">위기 시뮬레이션</h3>
              {allocation.totalValuedAmount > 0 ? (
                <div className="dashboard__crisis-list">
                  {crisisSimulation.scenarios.map((scenario) => {
                    const isWorst = scenario.id === crisisSimulation.worstScenarioId
                    return (
                      <div
                        key={scenario.id}
                        className={`dashboard__crisis-item${
                          isWorst ? ' dashboard__crisis-item--worst' : ''
                        }`}
                      >
                        <span className="dashboard__crisis-name">{scenario.name}</span>
                        <span
                          className={`dashboard__crisis-rate ${
                            scenario.expectedLossRate < 0
                              ? 'dashboard__cell--loss'
                              : ''
                          }`}
                        >
                          {formatPercent(scenario.expectedLossRate)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="dashboard__sidebar-empty">시세 데이터 필요</p>
              )}
            </section>

            <section className="dashboard__sidebar-panel">
              <h3 className="dashboard__sidebar-title">리밸런싱 점검</h3>

              <div className="dashboard__rebalance-mode" role="group" aria-label="리밸런싱 목표">
                <button
                  type="button"
                  className={`dashboard__rebalance-mode-btn${
                    rebalanceMode === 'fixed' ? ' dashboard__rebalance-mode-btn--active' : ''
                  }`}
                  onClick={() => handleRebalanceModeChange('fixed')}
                >
                  고정 전략
                </button>
                <button
                  type="button"
                  className={`dashboard__rebalance-mode-btn${
                    rebalanceMode === 'network' ? ' dashboard__rebalance-mode-btn--active' : ''
                  }`}
                  onClick={() => handleRebalanceModeChange('network')}
                >
                  네트워크
                </button>
              </div>

              {rebalanceMode === 'network' && (
                <p className="dashboard__rebalance-hint">
                  {networkLoading
                    ? '네트워크 비중 불러오는 중…'
                    : networkError
                      ? networkError
                      : networkBenchmark
                        ? `목표 = 업로드된 ${networkBenchmark.syncedStationCount}개 스테이션 합산 비중 · ${new Date(networkBenchmark.generatedAt).toLocaleString('ko-KR')}`
                        : '스테이션 등록·업로드 후 네트워크 비중이 목표로 적용됩니다.'}
                </p>
              )}

              {allocation.totalValuedAmount > 0 ? (
                <div className="dashboard__rebalance-list">
                  {rebalanceCheck.items.map((item) => (
                    <div
                      key={item.assetClass}
                      className={`dashboard__rebalance-item${
                        item.needsReview ? ' dashboard__rebalance-item--alert' : ''
                      }`}
                    >
                      <span className="dashboard__rebalance-class">{item.assetClass}</span>
                      <span className="dashboard__rebalance-weights">
                        {item.currentWeight.toFixed(0)}% / {item.targetWeight.toFixed(0)}%
                      </span>
                      <span
                        className={
                          item.needsReview
                            ? 'dashboard__cell--loss'
                            : 'dashboard__cell--profit'
                        }
                      >
                        {item.needsReview ? '점검' : '적정'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dashboard__sidebar-empty">시세 데이터 필요</p>
              )}
            </section>
          </aside>
        </div>
      )}

      {assets.length === 0 && assetFormSlot}

      {assets.length > 0 && prices.length === 0 && (
        <div className="dashboard__empty dashboard__empty--spaced">
          <p>
            시세 데이터가 없습니다. <strong>.env</strong> API 설정 후 갱신 버튼을
            눌러 주세요.
          </p>
        </div>
      )}

      <PortfolioChart snapshots={snapshots} />
      <PortfolioLedger snapshots={snapshots} />
    </div>
  )
}

export default Dashboard
