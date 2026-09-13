import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import MarketStatePanel from '../../components/tradingLab/MarketStatePanel.jsx'
import StrategyChecklistPanel from '../../components/tradingLab/StrategyChecklistPanel.jsx'
import RecentAnalysisList from '../../components/tradingLab/RecentAnalysisList.jsx'
import AnalysisComposerDrawer from '../../components/tradingLab/AnalysisComposerDrawer.jsx'
import AnalysisDetailDrawer from '../../components/tradingLab/AnalysisDetailDrawer.jsx'
import ObservationPanel from '../../components/tradingLab/ObservationPanel.jsx'
import TradeJournalDialog from '../../components/tradingLab/TradeJournalDialog.jsx'
import TradeJournalList from '../../components/tradingLab/TradeJournalList.jsx'
import {
  fetchAnalyses, fetchCvdSummary, fetchLiquidationCollectorStatus, fetchMarketSnapshot,
  fetchMarketState, fetchObservedLiquidations, fetchTradeFlowCollectorStatus,
  fetchShadowTrades, fetchTradeJournals,
} from '../../services/tradingLabApi.js'
import '../../styles/TradingLab.css'
import '../../styles/TradeJournal.css'

const ChartViewPanel = lazy(() => import('../../components/tradingLab/ChartViewPanel.jsx'))
const SYMBOLS = ['BTCUSDT', 'ETHUSDT']

export default function TradingLabHome() {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [view, setView] = useState('observe')
  const [timeframe, setTimeframe] = useState('1h')
  return <div className="trading-lab lab-workspace" aria-label="Trading Lab">
    <header className="lab-header"><div><div className="lab-eyebrow">ALADDIN / PERSONAL TRADING JOURNAL</div><h1>Trading Lab<span>내 판단을 남기는 곳</span></h1><p>차트에서 본 시나리오를 기록하고, 시간이 지난 뒤 내 근거를 돌아봅니다.</p></div><span className="lab-local-status"><i />로컬 · 가상 기록 전용</span></header>
    <div className="lab-navigation"><nav aria-label="Trading Lab 작업"><button type="button" aria-current={view === 'observe' ? 'page' : undefined} onClick={() => setView('observe')}>관찰 · 기록</button><button type="button" aria-current={view === 'review' ? 'page' : undefined} onClick={() => setView('review')}>일지 · 복기</button></nav><div className="lab-symbols" aria-label="관찰 종목">{SYMBOLS.map((item) => <button type="button" key={item} aria-pressed={symbol === item} onClick={() => setSymbol(item)}>{item}</button>)}</div></div>
    <JournalWorkspace key={symbol} symbol={symbol} view={view} setView={setView} timeframe={timeframe} setTimeframe={setTimeframe} />
  </div>
}

function JournalWorkspace({ symbol, view, setView, timeframe, setTimeframe }) {
  const [marketData, setMarketData] = useState({})
  const [marketLoading, setMarketLoading] = useState(true)
  const [marketError, setMarketError] = useState(false)
  const [records, setRecords] = useState({ trades: [], summary: {}, hasMore: false })
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordsError, setRecordsError] = useState('')
  const [filter, setFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  const [chartTrades, setChartTrades] = useState([])
  const [autoRecord, setAutoRecord] = useState(null)
  const [editor, setEditor] = useState(null)
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [legacyRecords, setLegacyRecords] = useState([])
  const [legacyError, setLegacyError] = useState('')
  const [legacyComposer, setLegacyComposer] = useState(false)
  const [legacyDetail, setLegacyDetail] = useState(null)
  const recordsRequest = useRef(0)
  const marketRequest = useRef(0)
  const markersRequest = useRef(0)
  const cancelRecords = useCallback(() => { recordsRequest.current++ }, [])
  const cancelMarket = useCallback(() => { marketRequest.current++; markersRequest.current++ }, [])

  const loadRecords = useCallback(async () => {
    const request = ++recordsRequest.current
    setRecordsLoading(true)
    try {
      const payload = await fetchTradeJournals(symbol, { filter, offset })
      if (request !== recordsRequest.current) return
      setRecords(payload); setRecordsError('')
    } catch { if (request === recordsRequest.current) setRecordsError('일지를 불러오지 못했습니다. 목록 새로고침으로 다시 시도해주세요.') }
    finally { if (request === recordsRequest.current) setRecordsLoading(false) }
  }, [symbol, filter, offset])
  const loadMarkers = useCallback(async () => {
    const request = ++markersRequest.current
    try {
      const payload = await fetchShadowTrades({ symbol, limit: 200 })
      if (request !== markersRequest.current) return
      setChartTrades(payload.trades || []); setAutoRecord(Boolean(payload.settings?.autoRecord))
    } catch { /* Keep saved markers when a background refresh fails. */ }
  }, [symbol])
  const loadMarket = useCallback(async () => {
    const request = ++marketRequest.current
    setMarketLoading(true)
    const results = await Promise.allSettled([
      fetchMarketSnapshot(symbol), fetchMarketState(symbol), fetchObservedLiquidations(symbol, { window: '15m' }),
      fetchCvdSummary(symbol, { window: '15m' }), fetchLiquidationCollectorStatus(), fetchTradeFlowCollectorStatus(),
    ])
    if (request !== marketRequest.current) return
    const value = (i) => results[i].status === 'fulfilled' ? results[i].value : null
    setMarketData({ market: value(0)?.market, state: value(1), liquidations: value(2), cvd: value(3), liquidationCollector: value(4)?.collector, tradeFlowCollector: value(5)?.collector })
    setMarketError(!value(0) || !value(1)); setMarketLoading(false)
  }, [symbol])
  useEffect(() => {
    void loadRecords()
    const timer = setInterval(loadRecords, 30000)
    return () => { clearInterval(timer); cancelRecords() }
  }, [loadRecords, cancelRecords])
  useEffect(() => {
    void loadMarket(); void loadMarkers()
    const timer = setInterval(() => { void loadMarket(); void loadMarkers() }, 30000)
    return () => { clearInterval(timer); cancelMarket() }
  }, [loadMarket, loadMarkers, cancelMarket])
  const loadLegacy = useCallback(() => fetchAnalyses({ symbol, limit: 20 }).then((p) => { setLegacyRecords(p.analyses || []); setLegacyError('') }).catch(() => setLegacyError('기존 분석 기록을 불러오지 못했습니다.')), [symbol])
  useEffect(() => { if (legacyOpen) void loadLegacy() }, [legacyOpen, loadLegacy])
  function recorded(trade) {
    if (trade?.id) setChartTrades((current) => [trade, ...current.filter((item) => item.id !== trade.id)])
    void loadRecords(); void loadMarkers()
  }
  const summary = records.summary || {}
  return <>
    <section className={`lab-intro${view === 'review' ? ' lab-intro--compact' : ''}`} aria-label="나의 기록 흐름">
      <div className="lab-intro__copy">
        <div className="lab-eyebrow">{view === 'observe' ? 'CAPTURE → RECORD → REVIEW' : 'LOOK BACK, LEARN FORWARD'}</div>
        <h2>{view === 'observe' ? '지금 본 장면, 나중에도 기억할 수 있게.' : '결과보다, 내 근거부터 돌아보기.'}</h2>
        {view === 'observe' && <p>TradingView 캡처도 좋습니다. 본 구간, 진입 근거, 틀렸다고 볼 기준을 함께 남겨보세요.</p>}
        {view === 'observe' && <button type="button" className="lab-button lab-button--primary" onClick={() => setEditor({ tradeId: null })}>+ 시나리오 남기기</button>}
      </div>
      <div className="lab-intro__stats">
        <button type="button" onClick={() => { setView('review'); setFilter('review'); setOffset(0) }}><strong>{summary.needsReview ?? '—'}</strong><span>복기할 기록</span></button>
        <button type="button" onClick={() => { setView('review'); setFilter('all'); setOffset(0) }}><strong>{summary.total ?? '—'}</strong><span>남긴 기록</span></button>
        <button type="button" onClick={() => { setView('review'); setFilter('reviewed'); setOffset(0) }}><strong>{summary.reviewed ?? '—'}</strong><span>복기 완료</span></button>
        {view === 'review' && <button type="button" className="lab-button lab-button--primary" onClick={() => setEditor({ tradeId: null })}>+ 시나리오 남기기</button>}
      </div>
    </section>
    {view === 'observe' && <>
      <div className="lab-observe-grid"><div className="lab-chart-column"><Suspense fallback={<div className="lab-empty" role="status">시장 차트 준비 중…</div>}><ChartViewPanel symbol={symbol} trades={chartTrades} timeframe={timeframe} onTimeframeChange={setTimeframe} /></Suspense><p className="lab-chart-note">ALADDIN 차트는 관찰을 돕습니다. TradingView 캡처는 시나리오 일지에 직접 첨부하세요.</p></div><ObservationPanel state={marketData.state} loading={marketLoading} error={marketError} fetchedAt={marketData.market?.fetchedAt} stale={marketData.market?.stale}><button type="button" className="lab-button" onClick={loadMarket} disabled={marketLoading}>관찰 근거 새로고침</button></ObservationPanel></div>
      <div className="lab-support-tools"><details><summary>내 진입 기준 점검 <span>필요할 때 체크리스트로 정리</span></summary><StrategyChecklistPanel symbol={symbol} onShadowRecorded={(trade) => { recorded(trade); if (trade?.id) setEditor({ tradeId: trade.id }) }} /></details><details><summary>시장 데이터 상세 <span>CVD · OI · 거래량 · Funding · 청산</span></summary><MarketStatePanel market={marketData.market} loading={marketLoading} observedLiquidations={marketData.liquidations} liquidationCollector={marketData.liquidationCollector} cvdSummary={marketData.cvd} tradeFlowCollector={marketData.tradeFlowCollector} /></details></div>
    </>}
    {view === 'review' && <TradeJournalList {...records} loading={recordsLoading} error={recordsError} filter={filter} offset={offset} onFilter={(next) => { setFilter(next); setOffset(0); setRecords((current) => ({ ...current, trades: [] })) }} onSelect={(tradeId) => setEditor({ tradeId })} onCreate={() => setEditor({ tradeId: null })} onRefresh={loadRecords} onMore={() => setOffset((current) => current + 30)} onPrevious={() => setOffset((current) => Math.max(0, current - 30))} />}
    <footer className="lab-workspace-footer"><p>가상 결과 추적은 기록 생성과 별개로 계속됩니다. 자동 기록 {autoRecord == null ? '설정 확인 중' : autoRecord ? 'ON' : 'OFF'}.</p><details onToggle={(event) => setLegacyOpen(event.currentTarget.open)}><summary>이전 분석 기록</summary><button className="lab-button" type="button" onClick={() => setLegacyComposer(true)}>수동 분석 기록 추가</button>{legacyError && <p role="alert">{legacyError}</p>}<RecentAnalysisList analyses={legacyRecords} onSelect={setLegacyDetail} /></details></footer>
    {editor && <TradeJournalDialog key={editor.tradeId || 'new'} tradeId={editor.tradeId} symbol={symbol} timeframe={timeframe} onClose={() => setEditor(null)} onSaved={recorded} />}
    <AnalysisComposerDrawer open={legacyComposer} symbol={symbol} onClose={() => setLegacyComposer(false)} onSaved={() => { setLegacyComposer(false); void loadLegacy() }} />
    {legacyDetail && <AnalysisDetailDrawer analysisId={legacyDetail} onClose={() => setLegacyDetail(null)} onChanged={loadLegacy} />}
  </>
}
