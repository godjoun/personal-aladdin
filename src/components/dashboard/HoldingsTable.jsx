import {
  formatCurrency,
  formatPercent,
  formatProfitLoss,
  getPnlClass,
} from '../../utils/formatters.js'

function HoldingsTable({ assetRows, onDeleteAsset }) {
  return (
    <div className="simple-dash__table-section">
      <h2 className="simple-dash__section-title">보유 종목</h2>
      <div className="simple-dash__table-wrap">
        <table className="simple-dash__table">
          <thead>
            <tr>
              <th>종목명</th>
              <th>종목코드</th>
              <th>보유수량</th>
              <th>평균매수가</th>
              <th>현재가</th>
              <th>평가금액</th>
              <th>평가손익</th>
              <th>수익률</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assetRows.map((row) => (
              <tr key={row.id}>
                <td data-label="종목명">
                  <span className="simple-dash__asset-name">{row.name}</span>
                </td>
                <td data-label="종목코드" className="simple-dash__mono">
                  {row.symbol}
                </td>
                <td data-label="보유수량" className="simple-dash__mono">
                  {row.quantity}
                </td>
                <td data-label="평균매수가" className="simple-dash__mono">
                  {formatCurrency(row.averageBuyPrice)}
                </td>
                <td data-label="현재가" className="simple-dash__mono">
                  {row.hasPrice ? formatCurrency(row.latestPrice) : '—'}
                </td>
                <td data-label="평가금액" className="simple-dash__mono">
                  {row.hasPrice ? formatCurrency(row.holdingValue) : '—'}
                </td>
                <td
                  data-label="평가손익"
                  className={`simple-dash__mono ${getPnlClass(row.profitLoss)}`}
                >
                  {row.hasPrice ? formatProfitLoss(row.profitLoss) : '—'}
                </td>
                <td
                  data-label="수익률"
                  className={`simple-dash__mono ${getPnlClass(row.profitRate)}`}
                >
                  {row.hasPrice ? formatPercent(row.profitRate) : '—'}
                </td>
                <td data-label="삭제">
                  <button
                    type="button"
                    className="simple-dash__delete-btn"
                    onClick={() => onDeleteAsset(row.id)}
                    aria-label={`${row.name} 삭제`}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default HoldingsTable
