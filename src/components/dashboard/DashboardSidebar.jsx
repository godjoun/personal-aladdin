import TradeLog from '../TradeLog.jsx'
import AllocationBar from './AllocationBar.jsx'

function DashboardSidebar({
  allocation,
  trades,
  participating,
  networkLoading,
  networkError,
  formatNetworkHint,
  rebalanceCheck,
  onNavigate,
}) {
  const hasValuation = allocation.totalValuedAmount > 0

  return (
    <aside className="dashboard__sidebar">
      <section className="dashboard__sidebar-panel">
        <h3 className="dashboard__sidebar-title">자산군 비중</h3>
        <AllocationBar allocation={allocation} />
      </section>

      <section className="dashboard__sidebar-panel">
        <h3 className="dashboard__sidebar-title">리밸런싱</h3>
        <p className="dashboard__rebalance-hint">
          {participating
            ? networkLoading
              ? '그룹 목표 불러오는 중…'
              : networkError || formatNetworkHint()
            : '개인 고정 전략 · 헤더 네트워크 패널에서 참여하기를 켤 수 있습니다.'}
        </p>

        {hasValuation ? (
          <>
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
                      item.needsReview ? 'dashboard__cell--loss' : 'dashboard__cell--profit'
                    }
                  >
                    {item.needsReview ? '점검' : '적정'}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="dashboard__sidebar-link"
              onClick={() => onNavigate?.('rebalance')}
            >
              리밸런싱 상세 →
            </button>
          </>
        ) : (
          <p className="dashboard__sidebar-empty">시세 데이터가 필요합니다.</p>
        )}
      </section>

      <section className="dashboard__sidebar-panel">
        <TradeLog trades={trades} />
      </section>
    </aside>
  )
}

export default DashboardSidebar
