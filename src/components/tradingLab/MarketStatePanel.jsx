import {
  NOT_COLLECTED_LABEL,
  NOT_CONNECTED_LABEL,
  NO_DATA_LABEL,
  formatFundingClock,
  formatFundingMetric,
  formatMetric,
  formatRelativeUpdatedAt,
  formatSignedValue,
  formatVolumeRatio,
  getMarketStatusLabel,
  getStructureLabel,
  isMarketDataConnected,
} from '../../utils/tradingLabView.js'

const STRUCTURE_ORDER = ['15m', '1h', '4h']

/**
 * @param {{ changePct?: number | null, volumeRatio?: number | null, timeframe: string }} item
 */
function formatStructureDetail(item) {
  const parts = []
  if (typeof item.changePct === 'number' && Number.isFinite(item.changePct)) {
    parts.push(formatSignedValue(item.changePct, { digits: 2, suffix: '%' }))
  }
  if (item.timeframe === '15m') {
    const volumeLabel = formatVolumeRatio(item.volumeRatio)
    if (volumeLabel) parts.push(volumeLabel)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * 시장 상태 + Market Data.
 * Bybit 공개 시세를 표시하고, 없는 지표는 가짜 값 없이 상태를 명시한다.
 */
export default function MarketStatePanel({ market, loading }) {
  const connected = isMarketDataConnected(market)
  const metrics = market?.metrics || {}
  const funding = market?.funding || {}
  const openInterest = market?.openInterest || {}

  const structureByTimeframe = new Map(
    (market?.structure || []).map((item) => [item.timeframe, item]),
  )

  const oiChangeLabel =
    typeof openInterest.changePct === 'number' && Number.isFinite(openInterest.changePct)
      ? formatSignedValue(openInterest.changePct, { digits: 1, suffix: '%' })
      : null

  const volumeRatioLabel = formatVolumeRatio(metrics.volumeRatio?.value)
  const oiValueMetric =
    metrics.openInterestValue?.value != null
      ? metrics.openInterestValue
      : metrics.openInterest
  const volume24hMetric =
    metrics.turnover?.value != null ? metrics.turnover : metrics.volume

  const marketDataRows = [
    {
      id: 'mark',
      label: 'Mark',
      value: formatMetric(metrics.markPrice, { usd: true }),
    },
    {
      id: 'volume24h',
      label: '24H 거래대금',
      value: formatMetric(volume24hMetric, {
        usd: metrics.turnover?.value != null,
      }),
    },
    {
      id: 'volumeStatus',
      label: '거래량',
      value: volumeRatioLabel
        ? volumeRatioLabel
        : connected
          ? NO_DATA_LABEL
          : NOT_CONNECTED_LABEL,
    },
    {
      id: 'openInterest',
      label: 'Open Interest',
      value: formatMetric(oiValueMetric, {
        usd: metrics.openInterestValue?.value != null,
      }),
      hint: oiChangeLabel
        ? `${openInterest.timeframe || '15m'} ${oiChangeLabel}`
        : undefined,
    },
    {
      id: 'funding',
      label: 'Funding',
      value: formatFundingMetric(metrics.fundingRate),
      hint: funding.nextFundingTime
        ? `Next ${formatFundingClock(funding.nextFundingTime)}`
        : undefined,
    },
    {
      id: 'liquidation',
      label: 'Liquidation',
      value: NOT_COLLECTED_LABEL,
      hint: '추정 구간',
    },
    {
      id: 'cvd',
      label: 'CVD',
      value: NOT_COLLECTED_LABEL,
    },
  ]

  const providerLabel =
    market?.providerDisplayName ||
    (market?.provider === 'BYBIT' ? 'Bybit' : market?.provider) ||
    (connected ? 'Bybit' : null)
  const updatedLabel = formatRelativeUpdatedAt(market?.fetchedAt)

  return (
    <>
      <section className="trading-lab__section" aria-label="시장 상태">
        <header className="trading-lab__section-head">
          <h2 className="trading-lab__section-title">시장 상태</h2>
          <span
            className={`trading-lab__badge${
              connected && !market?.stale ? ' trading-lab__badge--ok' : ''
            }${market?.stale ? ' trading-lab__badge--stale' : ''}`}
          >
            {loading ? '조회 중…' : getMarketStatusLabel(market)}
          </span>
        </header>

        <div className="trading-lab__metrics">
          <article className="trading-lab__metric trading-lab__metric--wide">
            <p className="trading-lab__metric-label">현재가</p>
            <p className="trading-lab__metric-value">
              {formatMetric(metrics.price, { usd: true })}
            </p>
          </article>

          {STRUCTURE_ORDER.map((timeframe) => {
            const item = structureByTimeframe.get(timeframe)
            const detail = item ? formatStructureDetail(item) : null
            return (
              <article key={timeframe} className="trading-lab__metric">
                <p className="trading-lab__metric-label">{timeframe}</p>
                <p className="trading-lab__metric-value trading-lab__metric-value--sm">
                  {getStructureLabel(item?.state)}
                </p>
                {detail ? (
                  <p className="trading-lab__metric-sub">{detail}</p>
                ) : null}
              </article>
            )
          })}
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

        {connected ? (
          <p className="trading-lab__provider-meta">
            Data: {providerLabel}
            {' · '}
            Updated: {updatedLabel}
            {market?.stale ? ' · 지연된 캐시' : ''}
          </p>
        ) : (
          <p className="trading-lab__notice">
            거래소 시장 데이터 provider가 아직 연결되지 않았습니다. 지표는{' '}
            {NOT_CONNECTED_LABEL} 상태로 표시되며, 분석은 직접 기록할 수 있습니다.
          </p>
        )}

        {market?.stale ? (
          <p className="trading-lab__notice trading-lab__notice--stale">
            시장 데이터 일시 지연 — 최근 캐시 값을 표시 중일 수 있습니다.
          </p>
        ) : null}
      </section>
    </>
  )
}
