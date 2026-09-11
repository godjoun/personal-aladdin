import {
  CVD_COLLECTING_LABEL,
  CVD_OK_LABEL,
  CVD_RECONNECTING_LABEL,
  CVD_SOURCE_LABEL,
  LIQUIDATION_COLLECTING_LABEL,
  LIQUIDATION_RECONNECTING_LABEL,
  NOT_CONNECTED_LABEL,
  NO_DATA_LABEL,
  formatFundingClock,
  formatFundingMetric,
  formatMetric,
  formatObservedLiquidationSide,
  formatRelativeUpdatedAt,
  formatSharePct,
  formatSignedCompactUsd,
  formatSignedValue,
  formatUsdValue,
  formatVolumeRatio,
  getCvdCollectorStatus,
  getCvdInterpretation,
  getMarketStatusLabel,
  getObservedLiquidationStatus,
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
export default function MarketStatePanel({
  market,
  loading,
  observedLiquidations,
  liquidationCollector,
  cvdSummary,
  tradeFlowCollector,
}) {
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
  ]

  const liqStatus = getObservedLiquidationStatus(
    liquidationCollector,
    observedLiquidations,
  )
  const cvdStatus = getCvdCollectorStatus(tradeFlowCollector, cvdSummary)
  const cvdWindow = cvdSummary?.window || '15m'
  const priceChange15m = structureByTimeframe.get('15m')?.changePct
  const cvdInterpretation =
    cvdStatus === 'HAS_DATA'
      ? getCvdInterpretation({
          cvd: cvdSummary?.cvdNotional,
          priceChange: typeof priceChange15m === 'number' ? priceChange15m : null,
        })
      : null
  const largestLong = observedLiquidations?.long?.largestEvent
  const largestShort = observedLiquidations?.short?.largestEvent
  const largest =
    (largestLong?.estimatedNotional || 0) >= (largestShort?.estimatedNotional || 0)
      ? largestLong
      : largestShort
  const largestSide =
    largest && largest === largestLong
      ? 'LONG'
      : largest && largest === largestShort
        ? 'SHORT'
        : null

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

        <div className="trading-lab__liq" aria-label="CVD">
          <p className="trading-lab__liq-title">CVD ({cvdWindow})</p>
          {cvdStatus === 'RECONNECTING' ? (
            <p className="trading-lab__notice">{CVD_RECONNECTING_LABEL}</p>
          ) : null}
          {cvdStatus === 'COLLECTING' ? (
            <p className="trading-lab__notice">{CVD_COLLECTING_LABEL}</p>
          ) : null}
          {cvdStatus === 'HAS_DATA' ? (
            <>
              <p className="trading-lab__metric-value">
                {formatSignedCompactUsd(cvdSummary?.cvdNotional)}
              </p>
              <div className="trading-lab__liq-sides">
                <p>
                  <span className="trading-lab__liq-side">Buy</span>
                  {formatSharePct(cvdSummary?.buySharePct)}
                </p>
                <p>
                  <span className="trading-lab__liq-side">Sell</span>
                  {formatSharePct(cvdSummary?.sellSharePct)}
                </p>
              </div>
              {cvdInterpretation ? (
                <p className="trading-lab__liq-large">{cvdInterpretation.label}</p>
              ) : null}
              <p className="trading-lab__data-hint">{CVD_SOURCE_LABEL}</p>
              <p className="trading-lab__notice">
                {tradeFlowCollector?.connected ? CVD_OK_LABEL : CVD_RECONNECTING_LABEL}
              </p>
            </>
          ) : (
            <p className="trading-lab__data-hint">{CVD_SOURCE_LABEL}</p>
          )}
        </div>

        <div className="trading-lab__liq" aria-label="최근 관측된 청산">
          <p className="trading-lab__liq-title">최근 15분 관측된 청산</p>
          {liqStatus === 'RECONNECTING' ? (
            <p className="trading-lab__notice">{LIQUIDATION_RECONNECTING_LABEL}</p>
          ) : null}
          {liqStatus === 'COLLECTING' ? (
            <p className="trading-lab__notice">{LIQUIDATION_COLLECTING_LABEL}</p>
          ) : null}
          {liqStatus === 'HAS_DATA' ? (
            <>
              <div className="trading-lab__liq-sides">
                <p>
                  <span className="trading-lab__liq-side">LONG</span>
                  {formatObservedLiquidationSide(observedLiquidations?.long)}
                </p>
                <p>
                  <span className="trading-lab__liq-side">SHORT</span>
                  {formatObservedLiquidationSide(observedLiquidations?.short)}
                </p>
              </div>
              {largest && largestSide ? (
                <p className="trading-lab__liq-large">
                  최근 큰 청산 {observedLiquidations?.symbol || ''} {largestSide}{' '}
                  {formatUsdValue(largest.estimatedNotional)} ·{' '}
                  {formatUsdValue(largest.price)}
                </p>
              ) : null}
              {liquidationCollector && !liquidationCollector.connected ? (
                <p className="trading-lab__notice">{LIQUIDATION_RECONNECTING_LABEL}</p>
              ) : null}
            </>
          ) : null}
        </div>

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
