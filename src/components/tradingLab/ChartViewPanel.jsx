import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  LineStyle,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import {
  createChartAnnotation,
  deleteChartAnnotation,
  fetchChartAnnotations,
  fetchMarketCandles,
} from '../../services/tradingLabApi.js'
import {
  CHART_ANNOTATION_DISCLAIMER,
  CHART_ANNOTATION_TYPES,
  CHART_TIMEFRAMES,
  CHART_TOOLS_TITLE,
  CHART_VIEW_DISCLAIMER,
  CHART_VIEW_TITLE,
  buildChartBoxes,
  buildChartPriceLines,
  buildShadowEntryMarkers,
  defaultAnnotationDraftFromCandles,
  getChartAnnotationLabel,
  getChartDataState,
  isChartBoxType,
  isChartLineType,
  toChartCandles,
} from '../../utils/tradingLabView.js'
import { ChartAnnotationPrimitive } from './chartAnnotationPrimitive.js'

/**
 * Chart View + Chart Tools v1 — 공개 캔들, 가상 진입 마커, 사용자 표시.
 * 실제 주문/포지션과 연결하지 않는다.
 */
export default function ChartViewPanel({ symbol, trades, annotations: annotationsProp, timeframe: controlledTimeframe, onTimeframeChange }) {
  const [localTimeframe, setLocalTimeframe] = useState('1h')
  const timeframe = controlledTimeframe || localTimeframe
  function setTimeframe(next) { setLocalTimeframe(next); onTimeframeChange?.(next) }
  const [rawCandles, setRawCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [stale, setStale] = useState(false)
  const [requestStatus, setRequestStatus] = useState('NOT_CONFIGURED')
  const [annotations, setAnnotations] = useState([])
  const [selectedType, setSelectedType] = useState('SUPPORT')
  const [draft, setDraft] = useState({
    price: '',
    topPrice: '',
    bottomPrice: '',
    memo: '',
  })
  const [saving, setSaving] = useState(false)
  const [toolError, setToolError] = useState('')
  const hostRef = useRef(null)
  const chartApiRef = useRef(null)

  const chartCandles = useMemo(() => toChartCandles(rawCandles), [rawCandles])
  const markers = useMemo(
    () => buildShadowEntryMarkers(trades, chartCandles, symbol),
    [trades, chartCandles, symbol],
  )
  const visibleAnnotations = useMemo(
    () =>
      (Array.isArray(annotationsProp) ? annotationsProp : annotations).filter(
        (item) =>
          item
          && !item.deletedAt
          && item.symbol === symbol
          && item.timeframe === timeframe,
      ),
    [annotations, annotationsProp, symbol, timeframe],
  )
  const priceLines = useMemo(
    () => buildChartPriceLines(visibleAnnotations),
    [visibleAnnotations],
  )
  const boxes = useMemo(
    () => buildChartBoxes(visibleAnnotations),
    [visibleAnnotations],
  )
  const chartState = useMemo(
    () =>
      getChartDataState({
        loading,
        status: requestStatus,
        candleCount: chartCandles.length,
        stale,
      }),
    [chartCandles.length, loading, requestStatus, stale],
  )

  useEffect(() => {
    const defaults = defaultAnnotationDraftFromCandles(rawCandles, 20)
    setDraft((current) => ({
      ...current,
      price: defaults.price == null ? '' : String(defaults.price),
      topPrice: defaults.topPrice == null ? '' : String(defaults.topPrice),
      bottomPrice: defaults.bottomPrice == null ? '' : String(defaults.bottomPrice),
    }))
  }, [rawCandles, selectedType])

  useEffect(() => {
    if (Array.isArray(annotationsProp)) {
      setAnnotations(annotationsProp)
      return undefined
    }
    let cancelled = false
    fetchChartAnnotations({ symbol, timeframe })
      .then((payload) => {
        if (!cancelled) setAnnotations(payload.annotations || [])
      })
      .catch(() => {
        if (!cancelled) setAnnotations([])
      })
    return () => {
      cancelled = true
    }
  }, [annotationsProp, symbol, timeframe])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setRawCandles([])
    setRequestStatus('OK')
    setStale(false)
    fetchMarketCandles(symbol, { timeframe, limit: 150 })
      .then((payload) => {
        if (cancelled) return
        setRawCandles(payload.candles || [])
        setRequestStatus(payload.status || 'OK')
        setStale(Boolean(payload.stale))
      })
      .catch(() => {
        if (cancelled) return
        setRawCandles([])
        setRequestStatus('ERROR')
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
        rightOffset: 10,
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
    const annotationPrimitive = new ChartAnnotationPrimitive()
    series.attachPrimitive(annotationPrimitive)
    chartApiRef.current = {
      chart,
      series,
      markerApi,
      annotationPrimitive,
      priceLines: [],
    }

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

  useEffect(() => {
    const api = chartApiRef.current
    if (!api) return
    for (const line of api.priceLines) {
      api.series.removePriceLine(line)
    }
    api.priceLines = priceLines.map((line) =>
      api.series.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: line.lineWidth,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: line.axisLabelVisible,
        title: line.title,
      }),
    )
    api.annotationPrimitive.setBoxes(boxes)
  }, [boxes, priceLines])

  async function handleAddAnnotation() {
    const defaults = defaultAnnotationDraftFromCandles(rawCandles, 20)
    setSaving(true)
    setToolError('')
    try {
      const payload = {
        symbol,
        timeframe,
        annotationType: selectedType,
        memo: draft.memo || null,
      }
      if (isChartLineType(selectedType)) {
        payload.price = Number(draft.price)
      } else {
        payload.topPrice = Number(draft.topPrice)
        payload.bottomPrice = Number(draft.bottomPrice)
        payload.startTime = defaults.startTime
        payload.endTime = defaults.endTime
      }
      const created = await createChartAnnotation(payload)
      setAnnotations((current) => [created.annotation, ...current])
      setDraft((current) => ({ ...current, memo: '' }))
    } catch (err) {
      setToolError(err.message || '차트 표시를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAnnotation(id) {
    setToolError('')
    try {
      await deleteChartAnnotation(id)
      setAnnotations((current) => current.filter((item) => item.id !== id))
    } catch (err) {
      setToolError(err.message || '차트 표시를 삭제하지 못했습니다.')
    }
  }

  const hasCandles = chartCandles.length > 0
  const emptyLabel = chartState.emptyLabel
  const selectedIsBox = isChartBoxType(selectedType)

  return (
    <section className="trading-lab__section" aria-label={CHART_VIEW_TITLE}>
      <header className="trading-lab__section-head">
        <div>
          <h2 className="trading-lab__section-title">{CHART_VIEW_TITLE}</h2>
          <p className="trading-lab__metric-sub">
            {symbol} · {timeframe}
            {markers.length > 0 ? ` · 가상 진입 ${markers.length}건` : ''}
            {visibleAnnotations.length > 0
              ? ` · 표시 ${visibleAnnotations.length}개`
              : ''}
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
      {chartState.notice ? (
        <p
          className={`trading-lab__notice trading-lab__notice--${chartState.tone}`}
        >
          {chartState.notice}
        </p>
      ) : null}

      <div className="trading-lab__chart-wrap">
        {emptyLabel ? (
          <p className="trading-lab__chart-empty" role="status" aria-live="polite">
            {emptyLabel}
          </p>
        ) : null}
        <div
          ref={hostRef}
          className={`trading-lab__chart-canvas${hasCandles ? '' : ' is-empty'}`}
        />
      </div>

      <details className="trading-lab__chart-tools" aria-label={CHART_TOOLS_TITLE}>
        <summary>{CHART_TOOLS_TITLE} · 구간 표시</summary>
        <p className="trading-lab__notice">{CHART_ANNOTATION_DISCLAIMER}</p>
        <div className="trading-lab__shadow-chips" aria-label="차트 표시 도구">
          {CHART_ANNOTATION_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`trading-lab__shadow-chip${
                selectedType === type ? ' is-active' : ''
              }`}
              onClick={() => setSelectedType(type)}
            >
              {getChartAnnotationLabel(type)}
            </button>
          ))}
        </div>
        <div className="trading-lab__chart-tool-form">
          {selectedIsBox ? (
            <>
              <label>
                상단 가격
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.topPrice}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, topPrice: event.target.value }))
                  }
                />
              </label>
              <label>
                하단 가격
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.bottomPrice}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      bottomPrice: event.target.value,
                    }))
                  }
                />
              </label>
              <p className="trading-lab__metric-sub">시간 범위는 최근 20개 캔들 기준</p>
            </>
          ) : (
            <label>
              가격
              <input
                type="number"
                min="0"
                step="any"
                value={draft.price}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, price: event.target.value }))
                }
              />
            </label>
          )}
          <label>
            메모
            <input
              type="text"
              value={draft.memo}
              onChange={(event) =>
                setDraft((current) => ({ ...current, memo: event.target.value }))
              }
              placeholder="선택"
            />
          </label>
          <button
            type="button"
            className="trading-lab__action trading-lab__action--primary"
            disabled={saving}
            onClick={handleAddAnnotation}
          >
            {saving ? '저장 중' : `${getChartAnnotationLabel(selectedType)} 추가`}
          </button>
        </div>
        {toolError ? <p className="trading-lab__error">{toolError}</p> : null}
        {visibleAnnotations.length === 0 ? (
          <p className="trading-lab__reason-empty">이 차트에 저장된 표시 없음</p>
        ) : (
          <ul className="trading-lab__chart-annotation-list">
            {visibleAnnotations.map((item) => (
              <li key={item.id}>
                <span>
                  {getChartAnnotationLabel(item.annotationType)}
                  {isChartLineType(item.annotationType)
                    ? ` · ${item.price}`
                    : ` · ${item.bottomPrice} ~ ${item.topPrice}`}
                  {item.memo ? ` · ${item.memo}` : ''}
                </span>
                <button
                  type="button"
                  className="trading-lab__action"
                  onClick={() => handleDeleteAnnotation(item.id)}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  )
}
