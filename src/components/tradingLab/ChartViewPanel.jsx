import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import { fetchMarketCandles } from '../../services/tradingLabApi.js'
import {
  CHART_TIMEFRAMES,
  CHART_VIEW_DISCLAIMER,
  CHART_VIEW_TITLE,
  NOT_CONNECTED_LABEL,
  buildShadowEntryMarkers,
  toChartCandles,
} from '../../utils/tradingLabView.js'

/**
 * Chart View v1 — Bybit 공개 캔들 + Shadow Trade 진입 마커.
 * 실제 주문/포지션과 연결하지 않는다.
 */
export default function ChartViewPanel({ symbol, trades }) {
  const [timeframe, setTimeframe] = useState('1h')
  const [rawCandles, setRawCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [stale, setStale] = useState(false)
  const hostRef = useRef(null)
  const chartApiRef = useRef(null)

  const chartCandles = useMemo(() => toChartCandles(rawCandles), [rawCandles])
  const markers = useMemo(
    () => buildShadowEntryMarkers(trades, chartCandles, symbol),
    [trades, chartCandles, symbol],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchMarketCandles(symbol, { timeframe, limit: 150 })
      .then((payload) => {
        if (cancelled) return
        setRawCandles(payload.candles || [])
        setStale(Boolean(payload.stale))
      })
      .catch(() => {
        if (cancelled) return
        setRawCandles([])
        setStale(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [symbol, timeframe])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#57606a',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#eef1f4' },
        horzLines: { color: '#eef1f4' },
      },
      rightPriceScale: { borderColor: '#d0d7de' },
      timeScale: {
        borderColor: '#d0d7de',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#0a7f3f',
      downColor: '#cf222e',
      borderUpColor: '#0a7f3f',
      borderDownColor: '#cf222e',
      wickUpColor: '#0a7f3f',
      wickDownColor: '#cf222e',
    })
    const markerApi = createSeriesMarkers(series, [])
    chartApiRef.current = { chart, series, markerApi }

    return () => {
      chartApiRef.current = null
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const api = chartApiRef.current
    if (!api) return
    api.series.setData(chartCandles)
    api.markerApi.setMarkers(markers)
    if (chartCandles.length > 0) {
      api.chart.timeScale().fitContent()
    }
  }, [chartCandles, markers])

  const hasCandles = chartCandles.length > 0
  const emptyLabel = loading ? '불러오는 중' : NOT_CONNECTED_LABEL

  return (
    <section className="trading-lab__section" aria-label={CHART_VIEW_TITLE}>
      <header className="trading-lab__section-head">
        <div>
          <h2 className="trading-lab__section-title">{CHART_VIEW_TITLE}</h2>
          <p className="trading-lab__metric-sub">
            {symbol} · {timeframe}
            {markers.length > 0 ? ` · 가상 진입 ${markers.length}건` : ''}
          </p>
        </div>
        <div className="trading-lab__symbols" role="tablist" aria-label="차트 타임프레임">
          {CHART_TIMEFRAMES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === timeframe}
              className={`trading-lab__symbol${item === timeframe ? ' is-active' : ''}`}
              onClick={() => setTimeframe(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <p className="trading-lab__notice">{CHART_VIEW_DISCLAIMER}</p>
      {stale ? (
        <p className="trading-lab__notice trading-lab__notice--stale">시장 데이터 일시 지연</p>
      ) : null}

      <div className="trading-lab__chart-wrap">
        {!hasCandles ? (
          <p className="trading-lab__chart-empty">{emptyLabel}</p>
        ) : null}
        <div
          ref={hostRef}
          className={`trading-lab__chart-canvas${hasCandles ? '' : ' is-empty'}`}
        />
      </div>
    </section>
  )
}
