import React, { useCallback, useEffect, useState } from 'react'
import {
  fetchUpbitQuotes,
  fetchUpbitStatus,
  fetchUpbitTrades,
  syncUpbitTrades,
} from '../../services/tradingLabApi.js'
import {
  isOpenUpbitTrade,
  sortUpbitTrades,
  summarizeUpbitTrades,
  upbitTradePnl,
} from '../../utils/upbitTradeView.js'

function finite(value) {
  if (value == null || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function won(value) {
  const amount = finite(value)
  if (amount == null) return '—'
  return `${Math.round(amount).toLocaleString('ko-KR')}원`
}

function number(value, digits = 8) {
  const amount = finite(value)
  if (amount == null) return '—'
  return amount.toLocaleString('ko-KR', { maximumFractionDigits: digits })
}

function pct(value) {
  const rate = finite(value)
  if (rate == null) return '—'
  const normalized = Math.abs(rate) < 0.005 ? 0 : rate
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(2)}%`
}

function dateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR')
}

function syncTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function duration(openedAt, closedAt) {
  if (!openedAt) return '—'
  const end = closedAt ? Date.parse(closedAt) : Date.now()
  const start = Date.parse(openedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—'
  const minutes = Math.floor((end - start) / 60_000)
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}시간 ${minutes % 60}분` : `${Math.floor(hours / 24)}일 ${hours % 24}시간`
}

function statusLabel(trade) {
  return isOpenUpbitTrade(trade) ? '보유 중' : '종료'
}

function marketLabel(market) {
  const [quote, base] = String(market || '').split('-')
  return quote && base ? `${base}/${quote}` : market
}

function QuoteValue({ quote, quoteUnavailable }) {
  if (quote?.tradePrice) return won(quote.tradePrice)
  return quoteUnavailable ? '현재가 지연' : '—'
}

export function UpbitTradeCard({ trade, quote, lastSyncAt, quoteUnavailable = false, detailsOpen = false }) {
  const open = isOpenUpbitTrade(trade)
  const pnl = upbitTradePnl(trade, quote)
  const unknownBasis = trade.status === 'UNKNOWN_BASIS'
  return <li className={`lab-upbit-card lab-upbit-card--${open ? 'open' : 'closed'}`}>
    <div className="lab-upbit-card__head">
      <div><strong>{marketLabel(trade.market)}</strong><span className="lab-tag">실전</span></div>
      <span className={`lab-upbit-card__status lab-upbit-card__status--${open ? 'open' : 'closed'}`}>{statusLabel(trade)}</span>
    </div>
    <div className={`lab-upbit-pnl lab-upbit-pnl--${pnl.tone}${unknownBasis ? ' lab-upbit-pnl--unknown' : ''}`}>
      <span>{pnl.label}</span>
      <strong>{unknownBasis ? '매수 원가 확인 불가' : won(pnl.amount)}</strong>
      {!unknownBasis && <b>{pct(pnl.rate)}</b>}
    </div>
    <dl className="lab-upbit-card__summary">
      <div><dt>평균 진입가</dt><dd>{won(trade.averageEntryPrice)}</dd></div>
      {open
        ? <><div><dt>매수금액</dt><dd>{won(trade.grossBuyAmount)}</dd></div><div><dt>남은 수량</dt><dd>{number(trade.remainingQuantity)}</dd></div><div><dt>보유시간</dt><dd>{duration(trade.openedAt, trade.closedAt)}</dd></div></>
        : <><div><dt>평균 청산가</dt><dd>{won(trade.averageExitPrice)}</dd></div><div><dt>매수금액</dt><dd>{won(trade.grossBuyAmount)}</dd></div><div><dt>보유시간</dt><dd>{duration(trade.openedAt, trade.closedAt)}</dd></div></>}
    </dl>
    <details className="lab-upbit-card__details" open={detailsOpen || undefined}>
      <summary><span className="lab-upbit-detail-label--closed">상세 보기 <i>›</i></span><span className="lab-upbit-detail-label--open">상세 닫기</span></summary>
      <dl>
        {open && <div><dt>현재가</dt><dd><QuoteValue quote={quote} quoteUnavailable={quoteUnavailable} /></dd></div>}
        <div><dt>매도금액</dt><dd>{won(trade.grossSellAmount)}</dd></div>
        <div><dt>총 수수료</dt><dd>{won((finite(trade.buyFees) || 0) + (finite(trade.sellFees) || 0))}</dd></div>
        <div><dt>진입 시각</dt><dd>{dateTime(trade.openedAt)}</dd></div>
        <div><dt>청산 시각</dt><dd>{dateTime(trade.closedAt)}</dd></div>
        <div><dt>마지막 동기화</dt><dd>{dateTime(lastSyncAt)}</dd></div>
        <div><dt>누적 매수 체결</dt><dd>{number(trade.boughtQuantity)} · {won(trade.grossBuyAmount)}</dd></div>
        <div><dt>누적 매도 체결</dt><dd>{number(trade.soldQuantity)} · {won(trade.grossSellAmount)}</dd></div>
      </dl>
      {!open && <p>업비트 실전 거래 원본을 바탕으로 진입·청산 흐름을 복기하세요.</p>}
    </details>
  </li>
}

export default function UpbitRealTradesPanel() {
  const [status, setStatus] = useState(null)
  const [trades, setTrades] = useState([])
  const [summary, setSummary] = useState(null)
  const [quotes, setQuotes] = useState({})
  const [quoteUnavailable, setQuoteUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [statusResult, tradesResult] = await Promise.allSettled([
      fetchUpbitStatus(), fetchUpbitTrades({ limit: 100 }),
    ])
    if (statusResult.status === 'fulfilled') setStatus(statusResult.value.status)
    if (tradesResult.status === 'fulfilled') {
      const nextTrades = sortUpbitTrades(tradesResult.value.trades || [])
      setTrades(nextTrades)
      setSummary(tradesResult.value.summary || summarizeUpbitTrades(nextTrades))
      const markets = [...new Set(nextTrades.filter(isOpenUpbitTrade).map((trade) => trade.market))]
      if (markets.length > 0) {
        try {
          const quotePayload = await fetchUpbitQuotes(markets)
          setQuotes(Object.fromEntries((quotePayload.quotes || []).map((quote) => [quote.market, quote])))
          setQuoteUnavailable(false)
        } catch {
          setQuotes({})
          setQuoteUnavailable(true)
        }
      } else {
        setQuotes({})
        setQuoteUnavailable(false)
      }
    }
    setError(statusResult.status === 'rejected' || tradesResult.status === 'rejected'
      ? '업비트 실전 기록을 불러오지 못했습니다.' : '')
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function synchronize() {
    setSyncing(true)
    setError('')
    try {
      await syncUpbitTrades()
      await load()
    } catch (syncError) {
      setError(syncError?.status === 409
        ? 'Upbit 주문조회 API Key가 설정되지 않았습니다.'
        : '업비트 동기화에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setSyncing(false)
    }
  }

  const connection = !status?.configured
    ? '미설정'
    : status.connected ? '연결됨' : '연결 끊김'
  const overview = summary || summarizeUpbitTrades(trades)

  return <section className="lab-upbit-real" aria-label="업비트 실전 거래">
    <header className="lab-section-head">
      <div><span className="lab-eyebrow">UPBIT · READ ONLY</span><h2>업비트 실전</h2></div>
      <span className={`lab-upbit-status lab-upbit-status--${status?.connected ? 'connected' : 'idle'}`}>{connection}</span>
    </header>
    <div className="lab-upbit-overview" aria-label="업비트 실전 거래 요약">
      <div><span>보유 중</span><strong>{overview.openCount ?? 0}</strong></div>
      <div><span>종료</span><strong>{overview.closedCount ?? 0}</strong></div>
      <div><span>총 실현손익</span><strong className={overview.totalRealizedPnl > 0 ? 'is-profit' : overview.totalRealizedPnl < 0 ? 'is-loss' : ''}>{won(overview.totalRealizedPnl)}</strong></div>
      <div><span>최근 동기화</span><strong>{syncTime(status?.lastSyncAt)}</strong></div>
    </div>
    <div className="lab-upbit-sync">
      <div><strong>{status?.connected ? '실시간 감지 중' : status?.configured ? '재연결 대기 중' : '주문조회 키 미설정'}</strong><span>조회·동기화 전용 · 실제 주문 기능 없음</span></div>
      <button type="button" className="lab-button" disabled={syncing || !status?.configured} onClick={synchronize}>{syncing ? '동기화 중…' : '지금 동기화'}</button>
    </div>
    {error && <p className="lab-error" role="alert">{error}</p>}
    {loading ? <div className="lab-empty" role="status">업비트 실전 기록 확인 중…</div>
      : trades.length === 0 ? <div className="lab-empty">동기화된 업비트 실전 거래가 없습니다.</div>
      : <ul className="lab-upbit-cards">{trades.map((trade) => <UpbitTradeCard
        key={trade.id}
        trade={trade}
        quote={quotes[trade.market]}
        quoteUnavailable={quoteUnavailable}
        lastSyncAt={status?.lastSyncAt}
      />)}</ul>}
    <p className="lab-journal-footnote">업비트에서 직접 실행한 체결을 읽어온 기록입니다. ALADDIN은 주문을 생성하거나 취소하지 않습니다.</p>
  </section>
}
