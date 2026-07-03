import { ASSET_TYPE_LABELS } from '../../constants/portfolioLabels.js'
import {
  formatCurrency,
  formatPercent,
  formatProfitLoss,
  getPnlClass,
} from '../../utils/formatters.js'

function HoldingsTable({ assetRows, allocation, onDeleteAsset }) {
  return (
    <div className="dashboard__table-section">
      <h3 className="dashboard__table-title">보유 자산</h3>
      <div className="dashboard__table-wrap">
        <table className="dashboard__table">
          <thead>
            <tr>
              <th>종목</th>
              <th>유형</th>
              <th>수량</th>
              <th>평가금액</th>
              <th>비중</th>
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
                  <td data-label="종목">
                    <span className="dashboard__asset-name">{row.name}</span>
                    <span className="dashboard__asset-symbol">{row.symbol}</span>
                    {row.hasPrice && row.profitRate !== null && (
                      <span
                        className={`dashboard__asset-pnl ${getPnlClass(row.profitRate)}`}
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
                    {currentWeight !== null ? `${currentWeight.toFixed(1)}%` : '—'}
                  </td>
                  <td data-label="손익" className={getPnlClass(row.profitLoss)}>
                    {formatProfitLoss(row.profitLoss)}
                  </td>
                  <td data-label="삭제">
                    <button
                      type="button"
                      className="dashboard__delete-btn"
                      onClick={() => onDeleteAsset(row.id)}
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
  )
}

export default HoldingsTable
