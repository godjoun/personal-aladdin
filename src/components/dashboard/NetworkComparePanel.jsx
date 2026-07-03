function NetworkComparePanel({
  participating,
  networkLoading,
  networkError,
  formatNetworkHint,
  rebalanceCheck,
  hasValuation,
}) {
  if (!participating || !hasValuation) {
    return null
  }

  return (
    <section className="dashboard__network-compare" aria-label="그룹 목표 대비">
      <h3 className="dashboard__network-compare-title">그룹 목표 대비</h3>
      <p className="dashboard__network-compare-hint">
        {networkLoading
          ? '그룹 비중 불러오는 중…'
          : networkError
            ? networkError
            : formatNetworkHint()}
      </p>
      <div className="dashboard__network-compare-grid">
        {rebalanceCheck.items.map((item) => (
          <div
            key={item.assetClass}
            className={`dashboard__network-compare-row${
              item.needsReview ? ' dashboard__network-compare-row--alert' : ''
            }`}
          >
            <span className="dashboard__network-compare-class">{item.assetClass}</span>
            <span className="dashboard__network-compare-meta">
              현재 {item.currentWeight.toFixed(1)}%
            </span>
            <span className="dashboard__network-compare-target">
              목표 {item.targetWeight.toFixed(1)}%
            </span>
            <span
              className={item.needsReview ? 'dashboard__cell--loss' : 'dashboard__cell--profit'}
            >
              {item.needsReview ? '점검' : '적정'}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default NetworkComparePanel
