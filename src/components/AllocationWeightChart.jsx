/**
 * AllocationWeightChart.jsx — 자산군 비중 추이 (스냅샷 기반)
 */

import { buildAllocationTimeSeries } from '../utils/portfolioAnalytics.js'
import { formatSnapshotDate } from '../utils/snapshotAnalytics.js'
import '../styles/ReportAnalytics.css'

const SERIES_COLORS = [
  '#3498db',
  '#9b59b6',
  '#f39c12',
  '#2ecc71',
  '#e74c3c',
  '#1abc9c',
  '#95a5a6',
]

function formatDateKey(dateKey) {
  return formatSnapshotDate(dateKey)
}

function AllocationWeightChart({ snapshots = [], days = 30 }) {
  const { dates, series, snapshotCount } = buildAllocationTimeSeries(snapshots, days)

  if (snapshotCount === 0) {
    return (
      <section className="report-analytics__chart" aria-label="자산군 비중 추이">
        <h3 className="report-analytics__chart-title">Asset Class Weight Trend</h3>
        <p className="report-analytics__empty">
          시세 갱신으로 스냅샷이 쌓이면 최근 {days}일 비중 변화를 볼 수 있습니다.
        </p>
      </section>
    )
  }

  if (snapshotCount === 1) {
    return (
      <section className="report-analytics__chart" aria-label="자산군 비중 추이">
        <h3 className="report-analytics__chart-title">Asset Class Weight Trend</h3>
        <p className="report-analytics__empty">
          서로 다른 날짜에 2번 이상 기록되면 비중 추이 선이 표시됩니다.
        </p>
        <ul className="report-analytics__single-weights">
          {series.map((item, index) => (
            <li key={item.assetClass}>
              <span
                className="report-analytics__dot"
                style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
              />
              {item.assetClass} {item.weights[0].toFixed(1)}%
            </li>
          ))}
        </ul>
      </section>
    )
  }

  const width = 600
  const height = 180
  const padX = 24
  const padY = 16
  const chartWidth = width - padX * 2
  const chartHeight = height - padY * 2

  const lines = series.map((item, seriesIndex) => {
    const points = item.weights.map((weight, index) => {
      const x = padX + (index / (dates.length - 1)) * chartWidth
      const y = padY + (1 - weight / 100) * chartHeight
      return { x, y, weight }
    })

    return {
      assetClass: item.assetClass,
      color: SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
      points,
      polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
      latestWeight: item.weights[item.weights.length - 1],
    }
  })

  return (
    <section className="report-analytics__chart" aria-label="자산군 비중 추이">
      <div className="report-analytics__chart-header">
        <h3 className="report-analytics__chart-title">Asset Class Weight Trend</h3>
        <span className="report-analytics__chart-meta">최근 {days}일 · {snapshotCount}개 기록</span>
      </div>

      <div className="report-analytics__canvas-wrap">
        <svg
          className="report-analytics__svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
        >
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = padY + (1 - tick / 100) * chartHeight
            return (
              <g key={tick}>
                <line
                  x1={padX}
                  y1={y}
                  x2={width - padX}
                  y2={y}
                  className="report-analytics__grid-line"
                />
                <text x={4} y={y + 3} className="report-analytics__axis-label">
                  {tick}%
                </text>
              </g>
            )
          })}

          {lines.map((line) => (
            <polyline
              key={line.assetClass}
              className="report-analytics__line"
              points={line.polyline}
              stroke={line.color}
              fill="none"
            />
          ))}
        </svg>
      </div>

      <ul className="report-analytics__legend">
        {lines.map((line) => (
          <li key={line.assetClass} className="report-analytics__legend-item">
            <span
              className="report-analytics__dot"
              style={{ backgroundColor: line.color }}
            />
            <span>{line.assetClass}</span>
            <span className="report-analytics__legend-value">
              {line.latestWeight.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>

      <div className="report-analytics__range">
        <span>{formatDateKey(dates[0])}</span>
        <span>{formatDateKey(dates[dates.length - 1])}</span>
      </div>
    </section>
  )
}

export default AllocationWeightChart
