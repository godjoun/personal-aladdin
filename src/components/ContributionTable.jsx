/**
 * ContributionTable.jsx — 종목별 손익·기간 기여도
 */

import { formatCurrency, formatPercent, formatProfitLoss, getPnlClass } from '../utils/formatters.js'
import '../styles/ReportAnalytics.css'

function ContributionTable({
  profitContributions = [],
  periodContributions = null,
}) {
  const hasProfit = profitContributions.length > 0
  const hasPeriod = periodContributions?.items?.length > 0

  if (!hasProfit && !hasPeriod) {
    return (
      <section className="report-analytics__table-section">
        <h3 className="report-analytics__chart-title">Contribution Analysis</h3>
        <p className="report-analytics__empty">
          평가 가능한 자산과 스냅샷 2일 이상이 있으면 기여도 분석이 표시됩니다.
        </p>
      </section>
    )
  }

  return (
    <section className="report-analytics__table-section">
      <h3 className="report-analytics__chart-title">Contribution Analysis</h3>

      {hasProfit && (
        <div className="report-analytics__table-block">
          <h4 className="report-analytics__table-subtitle">평가 손익 기여 (현재)</h4>
          <p className="report-analytics__table-hint">
            각 종목 손익이 전체 평가손익에서 차지하는 비중입니다.
          </p>
          <div className="dashboard__table-wrap">
            <table className="dashboard__table report-analytics__table">
              <thead>
                <tr>
                  <th>종목</th>
                  <th>유형</th>
                  <th>비중</th>
                  <th>평가손익</th>
                  <th>수익률</th>
                  <th>기여도</th>
                </tr>
              </thead>
              <tbody>
                {profitContributions.map((row) => (
                  <tr key={row.symbol}>
                    <td data-label="종목">
                      <span className="dashboard__asset-name">{row.name}</span>
                      <span className="dashboard__asset-symbol">{row.symbol}</span>
                    </td>
                    <td data-label="유형">{row.assetType}</td>
                    <td data-label="비중" className="dashboard__cell--mono">
                      {row.portfolioWeight.toFixed(1)}%
                    </td>
                    <td
                      data-label="평가손익"
                      className={getPnlClass(row.profitLoss)}
                    >
                      {formatProfitLoss(row.profitLoss)}
                    </td>
                    <td data-label="수익률" className={getPnlClass(row.profitRate)}>
                      {formatPercent(row.profitRate)}
                    </td>
                    <td data-label="기여도" className="dashboard__cell--mono">
                      {row.contributionPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasPeriod && (
        <div className="report-analytics__table-block">
          <h4 className="report-analytics__table-subtitle">
            기간 평가액 변화 기여 (스냅샷)
          </h4>
          <p className="report-analytics__table-hint">
            {periodContributions.periodLabel} · 합계{' '}
            <span className={getPnlClass(periodContributions.totalChange)}>
              {formatProfitLoss(periodContributions.totalChange)}
            </span>
          </p>
          <div className="dashboard__table-wrap">
            <table className="dashboard__table report-analytics__table">
              <thead>
                <tr>
                  <th>종목</th>
                  <th>시작</th>
                  <th>종료</th>
                  <th>변화액</th>
                  <th>기여도</th>
                </tr>
              </thead>
              <tbody>
                {periodContributions.items.map((row) => (
                  <tr key={`${row.symbol}-${row.exited ? 'exit' : 'hold'}`}>
                    <td data-label="종목">
                      <span className="dashboard__asset-name">{row.name}</span>
                      <span className="dashboard__asset-symbol">{row.symbol}</span>
                      {row.isNew && (
                        <span className="report-analytics__tag">신규</span>
                      )}
                      {row.exited && (
                        <span className="report-analytics__tag report-analytics__tag--muted">
                          청산
                        </span>
                      )}
                    </td>
                    <td data-label="시작" className="dashboard__cell--value">
                      {formatCurrency(row.startValue)}
                    </td>
                    <td data-label="종료" className="dashboard__cell--value">
                      {formatCurrency(row.endValue)}
                    </td>
                    <td
                      data-label="변화액"
                      className={getPnlClass(row.valueChange)}
                    >
                      {formatProfitLoss(row.valueChange)}
                    </td>
                    <td data-label="기여도" className="dashboard__cell--mono">
                      {row.contributionPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

export default ContributionTable
