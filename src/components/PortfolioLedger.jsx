/**
 * PortfolioLedger.jsx — 일별 포트폴리오 원장 테이블
 */

import {
  calculateMaxDrawdown,
  enrichSnapshotsWithDailyChange,
  formatSnapshotDate,
} from '../utils/snapshotAnalytics.js'

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

function PortfolioLedger({ snapshots = [] }) {
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
          <span className="dashboard__ledger-stat">기록 {snapshots.length}일</span>
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

export default PortfolioLedger
