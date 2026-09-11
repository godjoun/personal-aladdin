import { useCallback, useEffect, useState } from 'react'
import MarketStatePanel from '../../components/tradingLab/MarketStatePanel.jsx'
import AnalysisPanel from '../../components/tradingLab/AnalysisPanel.jsx'
import RecentAnalysisList from '../../components/tradingLab/RecentAnalysisList.jsx'
import AnalysisComposerDrawer from '../../components/tradingLab/AnalysisComposerDrawer.jsx'
import AnalysisDetailDrawer from '../../components/tradingLab/AnalysisDetailDrawer.jsx'
import ChartCaptureSlot from '../../components/tradingLab/ChartCaptureSlot.jsx'
import {
  fetchAnalyses,
  fetchCvdSummary,
  fetchLiquidationCollectorStatus,
  fetchMarketSnapshot,
  fetchMarketState,
  fetchMarketStateHistory,
  fetchObservedLiquidations,
  fetchTradeFlowCollectorStatus,
  fetchTradingLabStats,
} from '../../services/tradingLabApi.js'
import '../../styles/TradingLab.css'

/** MVP 대상 — 서버 allowlist 와 동일 */
const SYMBOLS = ['BTCUSDT', 'ETHUSDT']

export default function TradingLabHome() {
  const [symbol, setSymbol] = useState(SYMBOLS[0])
  const [market, setMarket] = useState(null)
  const [marketLoading, setMarketLoading] = useState(false)
  const [observedLiquidations, setObservedLiquidations] = useState(null)
  const [liquidationCollector, setLiquidationCollector] = useState(null)
  const [cvdSummary, setCvdSummary] = useState(null)
  const [tradeFlowCollector, setTradeFlowCollector] = useState(null)
  const [marketState, setMarketState] = useState(null)
  const [marketStateHistory, setMarketStateHistory] = useState([])
  const [analyses, setAnalyses] = useState([])
  const [analysesLoading, setAnalysesLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const loadMarket = useCallback(async () => {
    setMarketLoading(true)
    try {
      const [
        payload,
        liqPayload,
        liqStatus,
        cvdPayload,
        cvdStatus,
        statePayload,
        stateHistory,
      ] = await Promise.all([
        fetchMarketSnapshot(symbol),
        fetchObservedLiquidations(symbol, { window: '15m' }).catch(() => null),
        fetchLiquidationCollectorStatus().catch(() => null),
        fetchCvdSummary(symbol, { window: '15m' }).catch(() => null),
        fetchTradeFlowCollectorStatus().catch(() => null),
        fetchMarketState(symbol).catch(() => null),
        fetchMarketStateHistory(symbol, { limit: 20 }).catch(() => null),
      ])
      setMarket(payload.market)
      setObservedLiquidations(liqPayload)
      setLiquidationCollector(liqStatus?.collector || null)
      setCvdSummary(cvdPayload)
      setTradeFlowCollector(cvdStatus?.collector || null)
      setMarketState(statePayload)
      setMarketStateHistory(stateHistory?.observations || [])
    } catch {
      // provider 미연결과 조회 실패를 화면에서 구분해 보여준다
      setMarket({ symbol, configured: false, status: 'ERROR', metrics: {} })
      setObservedLiquidations(null)
      setLiquidationCollector(null)
      setCvdSummary(null)
      setTradeFlowCollector(null)
      setMarketState(null)
      setMarketStateHistory([])
    } finally {
      setMarketLoading(false)
    }
  }, [symbol])

  const loadAnalyses = useCallback(async () => {
    setAnalysesLoading(true)
    setError('')
    try {
      const [listPayload, statsPayload] = await Promise.all([
        fetchAnalyses({ symbol, limit: 20 }),
        fetchTradingLabStats(),
      ])
      setAnalyses(listPayload.analyses || [])
      setStats(statsPayload.stats || null)
    } catch (loadError) {
      setError(loadError.message || '분석 기록을 불러오지 못했습니다.')
      setAnalyses([])
    } finally {
      setAnalysesLoading(false)
    }
  }, [symbol])

  useEffect(() => {
    loadMarket()
  }, [loadMarket])

  useEffect(() => {
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const [liqPayload, liqStatus, cvdPayload, cvdStatus, statePayload, stateHistory] =
          await Promise.all([
            fetchObservedLiquidations(symbol, { window: '15m' }),
            fetchLiquidationCollectorStatus(),
            fetchCvdSummary(symbol, { window: '15m' }),
            fetchTradeFlowCollectorStatus(),
            fetchMarketState(symbol),
            fetchMarketStateHistory(symbol, { limit: 20 }),
          ])
        if (cancelled) return
        setObservedLiquidations(liqPayload)
        setLiquidationCollector(liqStatus?.collector || null)
        setCvdSummary(cvdPayload)
        setTradeFlowCollector(cvdStatus?.collector || null)
        setMarketState(statePayload)
        setMarketStateHistory(stateHistory?.observations || [])
      } catch {
        // 청산/CVD 폴링 실패가 화면 전체를 막지 않는다
      }
    }, 15_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [symbol])

  useEffect(() => {
    loadAnalyses()
  }, [loadAnalyses])

  const latestAnalysis = analyses[0] || null

  function handleSaved() {
    setComposerOpen(false)
    loadAnalyses()
  }

  return (
    <div className="trading-lab" aria-label="Trading Lab">
      <header className="trading-lab__header">
        <div>
          <h1 className="trading-lab__title">Trading Lab</h1>
          <p className="trading-lab__subtitle">
            BTC/ETH 무기한 선물 시장을 분석하고 내 판단과 결과를 누적하는 공간입니다.
            주문 기능은 없습니다.
          </p>
        </div>
        {stats ? (
          <p className="trading-lab__stats">
            분석 {stats.total}건 · 결과 확정 {stats.resolved}건
          </p>
        ) : null}
      </header>

      <div className="trading-lab__symbols" role="tablist" aria-label="분석 종목">
        {SYMBOLS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={symbol === item}
            className={`trading-lab__symbol${
              symbol === item ? ' is-active' : ''
            }`}
            onClick={() => setSymbol(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {error ? <p className="trading-lab__error">{error}</p> : null}

      <MarketStatePanel
        market={market}
        loading={marketLoading}
        observedLiquidations={observedLiquidations}
        liquidationCollector={liquidationCollector}
        cvdSummary={cvdSummary}
        tradeFlowCollector={tradeFlowCollector}
      />

      <AnalysisPanel
        analysis={latestAnalysis}
        marketState={marketState}
        marketStateHistory={marketStateHistory}
        onRecord={() => setComposerOpen(true)}
      />

      <ChartCaptureSlot
        symbol={symbol}
        analysisId={latestAnalysis?.id || null}
        onSaved={loadAnalyses}
      />

      <RecentAnalysisList
        analyses={analyses}
        loading={analysesLoading}
        onSelect={setDetailId}
      />

      <AnalysisComposerDrawer
        open={composerOpen}
        symbol={symbol}
        onClose={() => setComposerOpen(false)}
        onSaved={handleSaved}
      />

      {detailId ? (
        <AnalysisDetailDrawer
          analysisId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={loadAnalyses}
        />
      ) : null}
    </div>
  )
}
