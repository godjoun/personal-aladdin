import { formatCurrency, formatProfitLoss, getPnlClass } from '../../utils/formatters.js'

function DashboardMetrics({
  totalHoldingValue,
  worstScenario,
  maxDeviation,
  rebalanceStatus,
  targetSumValid,
  targetSum,
}) {
  return (
    <div className="dashboard__metrics">
      <article className="dashboard__metric-card dashboard__metric-card--gold">
        <p className="dashboard__metric-label">총 평가 자산</p>
        <p className="dashboard__metric-value dashboard__metric-value--gold">
          {formatCurrency(totalHoldingValue)}
        </p>
      </article>
      <article className="dashboard__metric-card">
        <p className="dashboard__metric-label">위기 시 예상 손실</p>
        <p
          className={`dashboard__metric-value ${getPnlClass(worstScenario?.expectedLossAmount ?? 0)}`}
        >
          {worstScenario ? formatProfitLoss(worstScenario.expectedLossAmount) : '—'}
        </p>
        {worstScenario && <p className="dashboard__metric-sub">{worstScenario.name}</p>}
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
        <p className="dashboard__metric-label">리밸런싱</p>
        <p className="dashboard__metric-value dashboard__metric-value--danger">
          {rebalanceStatus}
        </p>
        {!targetSumValid && (
          <p className="dashboard__metric-sub">
            목표 비중 합계 {targetSum}% (100% 필요)
          </p>
        )}
      </article>
    </div>
  )
}

export default DashboardMetrics
