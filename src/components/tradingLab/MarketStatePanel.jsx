import {
  NOT_CONNECTED_LABEL,
  formatMetric,
  getMarketStatusLabel,
  getStructureLabel,
  isMarketDataConnected,
} from '../../utils/tradingLabView.js'

const STRUCTURE_ORDER = ['15m', '1h', '4h']

/**
 * 시장 상태 + Market Data.
 * provider 미연결이 정상 상태이므로 값 대신 "데이터 연결 전"을 표시한다.
 */
export default function MarketStatePanel({ market, loading }) {
  const connected = isMarketDataConnected(market)
  const metrics = market?.metrics || {}

  const structureByTimeframe = new Map(
    (market?.structure || []).map((item) => [item.timeframe, item]),
  )

  const marketDataRows = [
    { id: 'volume', label: 'Volume', value: formatMetric(metrics.volume) },
    {
      id: 'openInterest',
      label: 'Open Interest',
      value: formatMetric(metrics.openInterest),
    },
    {
      id: 'funding',
      label: 'Funding',
      value: formatMetric(metrics.fundingRate, { signed: true, digits: 4 }),
    },
    {
      id: 'liquidation',
      label: 'Liquidation',
      value: formatMetric(metrics.liquidationAbove),
      hint: '추정 구간',
    },
    { id: 'cvd', label: 'CVD', value: formatMetric(metrics.cvd, { signed: true }) },
  ]

  return (
    <>
      <section className="trading-lab__section" aria-label="시장 상태">
        <header className="trading-lab__section-head">
          <h2 className="trading-lab__section-title">시장 상태</h2>
          <span
            className={`trading-lab__badge${
              connected ? ' trading-lab__badge--ok' : ''
            }`}
          >
            {loading ? '조회 중…' : getMarketStatusLabel(market)}
          </span>
        </header>

        <div className="trading-lab__metrics">
          <article className="trading-lab__metric trading-lab__metric--wide">
            <p className="trading-lab__metric-label">현재가</p>
            <p className="trading-lab__metric-value">
              {formatMetric(metrics.price)}
            </p>
          </article>

          {STRUCTURE_ORDER.map((timeframe) => (
            <article key={timeframe} className="trading-lab__metric">
              <p className="trading-lab__metric-label">{timeframe}</p>
              <p className="trading-lab__metric-value trading-lab__metric-value--sm">
                {getStructureLabel(structureByTimeframe.get(timeframe)?.state)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="trading-lab__section" aria-label="Market Data">
        <header className="trading-lab__section-head">
          <h2 className="trading-lab__section-title">Market Data</h2>
        </header>

        <dl className="trading-lab__data-grid">
          {marketDataRows.map((row) => (
            <div key={row.id} className="trading-lab__data-item">
              <dt>
                {row.label}
                {row.hint ? (
                  <span className="trading-lab__data-hint"> {row.hint}</span>
                ) : null}
              </dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        {!connected ? (
          <p className="trading-lab__notice">
            거래소 시장 데이터 provider가 아직 연결되지 않았습니다. 지표는{' '}
            {NOT_CONNECTED_LABEL} 상태로 표시되며, 분석은 직접 기록할 수 있습니다.
          </p>
        ) : null}
      </section>
    </>
  )
}
