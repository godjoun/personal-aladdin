import { LAYER_COLORS } from '../../constants/portfolioLabels.js'
import { formatCurrency } from '../../utils/formatters.js'

function AllocationBar({ allocation }) {
  const { groups, totalValuedAmount } = allocation

  if (groups.length === 0) {
    return <p className="dashboard__sidebar-empty">시세가 있는 자산이 없습니다.</p>
  }

  return (
    <>
      <div className="dashboard__structural-bar" role="img" aria-label="자산군 비중">
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
            <span className="dashboard__layer-value">{formatCurrency(group.totalValue)}</span>
          </li>
        ))}
      </ul>

      <p className="dashboard__layer-total">합계 {formatCurrency(totalValuedAmount)}</p>
    </>
  )
}

export default AllocationBar
