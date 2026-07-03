/**
 * Report.jsx — 포트폴리오 리포트 화면
 */

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
import PortfolioChart from '../components/PortfolioChart.jsx'
import PortfolioLedger from '../components/PortfolioLedger.jsx'
import AllocationWeightChart from '../components/AllocationWeightChart.jsx'
import ContributionTable from '../components/ContributionTable.jsx'
import { formatCurrency, formatPercent, formatProfitLoss, getPnlClass } from '../utils/formatters.js'
import {
  calculateProfitContributions,
  calculatePeriodValueContributions,
  calculateRollingVolatility,
  calculateSharpeRatio,
} from '../utils/portfolioAnalytics.js'
import '../styles/WorkspacePages.css'
import '../styles/ReportAnalytics.css'

function buildSnapshotCsv(snapshots) {
  const enriched = enrichSnapshotsWithDailyChange(snapshots)
  const header = 'date,totalValuedAmount,dailyChangePercent,totalProfitLoss,recordedAt\n'
  const rows = enriched
    .map((row) =>
      [
        row.date,
        row.totalValuedAmount,
        row.dailyChangePercent ?? '',
        row.totalProfitLoss ?? '',
        row.recordedAt,
      ].join(','),
    )
    .join('\n')
  return header + rows
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function Report({ assets = [], prices = [], snapshots = [] }) {
  const assetRows = buildAssetRows(assets, prices)
  const summary = calculatePortfolioSummary(assetRows)
  const allocation = calculateAssetClassAllocation(assetRows)
  const crisisSimulation = simulateCrisisScenarios(allocation)
  const mdd = calculateMaxDrawdown(snapshots)
  const enriched = enrichSnapshotsWithDailyChange(snapshots)
  const latest = enriched[0]
  const oldest = enriched[enriched.length - 1]

  const periodReturn =
    oldest && latest && oldest.totalValuedAmount > 0
      ? ((latest.totalValuedAmount - oldest.totalValuedAmount) /
          oldest.totalValuedAmount) *
        100
      : null

  const worstScenario = crisisSimulation.scenarios.find(
    (scenario) => scenario.id === crisisSimulation.worstScenarioId,
  )

  const analyticsWindowDays = 30
  const rollingVol = calculateRollingVolatility(snapshots, analyticsWindowDays)
  const sharpe = calculateSharpeRatio(snapshots, analyticsWindowDays)
  const profitContributions = calculateProfitContributions(assetRows)
  const periodContributions = calculatePeriodValueContributions(
    snapshots,
    analyticsWindowDays,
  )

  function handleExportCsv() {
    if (snapshots.length === 0) return
    const csv = buildSnapshotCsv(snapshots)
    downloadTextFile(`aladdin-snapshots-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <div className="workspace-page">
      <header className="workspace-page__header workspace-page__header--row">
        <div>
          <h2 className="workspace-page__title">리포트</h2>
          <p className="workspace-page__desc">
            스냅샷·수익률·리스크 요약을 한곳에서 확인합니다.
          </p>
        </div>
        <button
          type="button"
          className="workspace-page__export-btn"
          onClick={handleExportCsv}
          disabled={snapshots.length === 0}
        >
          스냅샷 CSV보내기
        </button>
      </header>

      {assets.length === 0 ? (
        <div className="workspace-page__empty">자산을 등록하면 리포트가 생성됩니다.</div>
      ) : (
        <>
          <div className="workspace-page__summary workspace-page__summary--4">
            <article className="workspace-page__summary-card">
              <p className="workspace-page__summary-label">총 평가 자산</p>
              <p className="workspace-page__summary-value">
                {formatCurrency(summary.totalHoldingValue)}
              </p>
            </article>
            <article className="workspace-page__summary-card">
              <p className="workspace-page__summary-label">평가 손익</p>
              <p className={`workspace-page__summary-value ${getPnlClass(summary.totalProfitLoss)}`}>
                {formatProfitLoss(summary.totalProfitLoss)}
              </p>
            </article>
            <article className="workspace-page__summary-card">
              <p className="workspace-page__summary-label">기간 수익률</p>
              <p className={`workspace-page__summary-value ${getPnlClass(periodReturn)}`}>
                {periodReturn !== null ? formatPercent(periodReturn) : '—'}
              </p>
              <p className="workspace-page__summary-sub">
                {snapshots.length >= 2
                  ? `${formatSnapshotDate(oldest.date)} ~ ${formatSnapshotDate(latest.date)}`
                  : '스냅샷 2일 이상 필요'}
              </p>
            </article>
            <article className="workspace-page__summary-card">
              <p className="workspace-page__summary-label">최대 낙폭 (MDD)</p>
              <p className="workspace-page__summary-value dashboard__cell--loss">
                {mdd.mddPercent < 0 ? formatPercent(mdd.mddPercent) : '—'}
              </p>
            </article>
          </div>

          <section className="workspace-section">
            <h3 className="workspace-section__title">리스크 스냅샷</h3>
            <div className="workspace-page__summary workspace-page__summary--2">
              <article className="workspace-page__summary-card">
                <p className="workspace-page__summary-label">최악 위기 시나리오</p>
                <p className="workspace-page__summary-sub">
                  {worstScenario?.name ?? '—'}
                </p>
                <p className={`workspace-page__summary-value ${getPnlClass(worstScenario?.expectedLossAmount)}`}>
                  {worstScenario ? formatProfitLoss(worstScenario.expectedLossAmount) : '—'}
                </p>
              </article>
              <article className="workspace-page__summary-card">
                <p className="workspace-page__summary-label">스냅샷 기록</p>
                <p className="workspace-page__summary-value">{snapshots.length}일</p>
                <p className="workspace-page__summary-sub">
                  시세 갱신 시 자동 기록
                </p>
              </article>
            </div>
          </section>

          <section className="workspace-section report-analytics">
            <h3 className="workspace-section__title">Analytics</h3>
            <p className="workspace-section__desc">
              누적 스냅샷으로 비중 추이·변동성·종목 기여도를 분석합니다. (최근{' '}
              {analyticsWindowDays}일 기준)
            </p>

            <div className="report-analytics__kpi-grid">
              <article className="report-analytics__kpi">
                <span className="report-analytics__kpi-label">연율 변동성</span>
                <span className="report-analytics__kpi-value">
                  {rollingVol ? formatPercent(rollingVol.annualizedVolPercent) : '—'}
                </span>
                <span className="report-analytics__kpi-sub">
                  {rollingVol
                    ? `${rollingVol.sampleDays}일 수익률 표본`
                    : '스냅샷 3일 이상 필요'}
                </span>
              </article>
              <article className="report-analytics__kpi">
                <span className="report-analytics__kpi-label">샤프 비율</span>
                <span
                  className={`report-analytics__kpi-value ${
                    sharpe && sharpe.sharpeRatio >= 0
                      ? 'dashboard__cell--profit'
                      : sharpe
                        ? 'dashboard__cell--loss'
                        : ''
                  }`}
                >
                  {sharpe ? sharpe.sharpeRatio.toFixed(2) : '—'}
                </span>
                <span className="report-analytics__kpi-sub">
                  {sharpe
                    ? `무위험 ${sharpe.riskFreeRate}% · 연율 수익 ${sharpe.annualizedReturnPercent.toFixed(1)}%`
                    : '스냅샷 3일 이상 필요'}
                </span>
              </article>
              <article className="report-analytics__kpi">
                <span className="report-analytics__kpi-label">기간 평가 변화</span>
                <span
                  className={`report-analytics__kpi-value ${getPnlClass(periodContributions.totalChange)}`}
                >
                  {periodContributions.items.length > 0
                    ? formatProfitLoss(periodContributions.totalChange)
                    : '—'}
                </span>
                <span className="report-analytics__kpi-sub">
                  {periodContributions.periodLabel ?? '스냅샷 2일 이상 필요'}
                </span>
              </article>
            </div>

            <AllocationWeightChart snapshots={snapshots} days={analyticsWindowDays} />

            <ContributionTable
              profitContributions={profitContributions}
              periodContributions={periodContributions}
            />
          </section>

          <PortfolioChart snapshots={snapshots} />
          <PortfolioLedger snapshots={snapshots} />
        </>
      )}
    </div>
  )
}

export default Report
