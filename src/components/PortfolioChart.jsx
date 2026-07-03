/**
 * PortfolioChart.jsx — 스냅샷 기반 총 평가액 추이 차트 (SVG)
 */

import '../styles/PortfolioChart.css'

function formatCurrencyShort(value) {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(1)}억`
  }
  if (value >= 10_000) {
    return `${Math.round(value / 10_000)}만`
  }
  return String(value)
}

function formatCurrencyFull(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateKey(dateKey) {
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`
}

/**
 * @param {Object} props
 * @param {Array<Object>} props.snapshots - 포트폴리오 스냅샷 (date, totalValuedAmount)
 */
function PortfolioChart({ snapshots = [] }) {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))

  if (sorted.length === 0) {
    return (
      <section className="portfolio-chart" aria-label="평가액 추이">
        <h3 className="portfolio-chart__title">Portfolio Value Trend</h3>
        <p className="portfolio-chart__empty">
          매매할 때마다가 아니라, <strong>시세 갱신</strong>할 때 오늘 평가액이 기록됩니다.
          <br />
          자산 등록 후 「시세 데이터 갱신」을 눌러 보세요.
        </p>
      </section>
    )
  }

  if (sorted.length === 1) {
    const today = sorted[0]
    return (
      <section className="portfolio-chart" aria-label="평가액 추이">
        <h3 className="portfolio-chart__title">Portfolio Value Trend</h3>
        <div className="portfolio-chart__single">
          <p className="portfolio-chart__single-value">
            {formatCurrencyFull(today.totalValuedAmount)}
          </p>
          <p className="portfolio-chart__single-date">{formatDateKey(today.date)} 기록</p>
        </div>
        <p className="portfolio-chart__empty">
          선 그래프는 <strong>서로 다른 날짜</strong>에 2번 이상 갱신하면 시작됩니다.
          매일 매매할 필요 없어요 — <strong>일주일에 한 번</strong>만 열어도 추이가 쌓입니다.
        </p>
      </section>
    )
  }

  const values = sorted.map((s) => s.totalValuedAmount)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1

  const width = 600
  const height = 160
  const padX = 8
  const padY = 12

  const points = sorted.map((snapshot, index) => {
    const x =
      padX + (index / (sorted.length - 1)) * (width - padX * 2)
    const y =
      padY +
      (1 - (snapshot.totalValuedAmount - minValue) / range) *
        (height - padY * 2)

    return { x, y, snapshot }
  })

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPoints = [
    `${points[0].x},${height - padY}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${height - padY}`,
  ].join(' ')

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const changeAmount = last.totalValuedAmount - first.totalValuedAmount
  const changePercent =
    first.totalValuedAmount > 0
      ? (changeAmount / first.totalValuedAmount) * 100
      : 0
  const isUp = changeAmount >= 0

  return (
    <section className="portfolio-chart" aria-label="평가액 추이">
      <div className="portfolio-chart__header">
        <h3 className="portfolio-chart__title">Portfolio Value Trend</h3>
        <span
          className={`portfolio-chart__change${
            isUp ? ' portfolio-chart__change--up' : ' portfolio-chart__change--down'
          }`}
        >
          {isUp ? '+' : ''}
          {changePercent.toFixed(1)}% ({sorted.length}일)
        </span>
      </div>

      <div className="portfolio-chart__canvas-wrap">
        <svg
          className="portfolio-chart__svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`총 평가액 ${formatCurrencyShort(last.totalValuedAmount)}`}
        >
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(243, 156, 18, 0.25)" />
              <stop offset="100%" stopColor="rgba(243, 156, 18, 0)" />
            </linearGradient>
          </defs>

          <polygon className="portfolio-chart__area" points={areaPoints} fill="url(#chartFill)" />

          <polyline
            className="portfolio-chart__line"
            points={polylinePoints}
            fill="none"
          />

          {points.map((point) => (
            <circle
              key={point.snapshot.date}
              className="portfolio-chart__dot"
              cx={point.x}
              cy={point.y}
              r="3"
            />
          ))}
        </svg>

        <div className="portfolio-chart__labels">
          <span>{formatCurrencyShort(minValue)}</span>
          <span>{formatCurrencyShort(maxValue)}</span>
        </div>
      </div>

      <div className="portfolio-chart__range">
        <span>{formatDateKey(first.date)}</span>
        <span className="portfolio-chart__current">
          {formatCurrencyShort(last.totalValuedAmount)}
        </span>
        <span>{formatDateKey(last.date)}</span>
      </div>
    </section>
  )
}

export default PortfolioChart
