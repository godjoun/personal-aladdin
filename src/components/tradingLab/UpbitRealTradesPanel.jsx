import React, { useCallback, useEffect, useState } from 'react'
import {
  deferUpbitTradeReview,
  fetchUpbitQuotes,
  fetchUpbitStatus,
  fetchUpbitTrades,
  saveUpbitTradeReview,
  syncUpbitTrades,
} from '../../services/tradingLabApi.js'
import {
  isOpenUpbitTrade,
  sortUpbitTrades,
  summarizeUpbitTrades,
  upbitReviewBadge,
  upbitTradePnl,
} from '../../utils/upbitTradeView.js'
import UpbitTradeReviewDialog from './UpbitTradeReviewDialog.jsx'

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

function syncTime(value, now = new Date()) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return date.toDateString() === now.toDateString() ? `오늘 ${time}` : date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function closedStamp(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date.getFullYear()}.${month}.${day} ${time}`
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

function CoinMark({ market }) {
  const base = String(market || '').split('-')[1] || '?'
  return <span className="lab-upbit-coin" aria-hidden="true">{base.slice(0, 1)}</span>
}

function pnlClass(tone, unknownBasis) {
  return `lab-upbit-pnl lab-upbit-pnl--${unknownBasis ? 'unknown' : tone}`
}

function sumOpenPnl(trades, quotes) {
  let total = 0
  let counted = false
  for (const trade of trades) {
    const amount = upbitTradePnl(trade, quotes[trade.market]).amount
    if (amount == null) continue
    total += amount
    counted = true
  }
  return counted ? total : null
}

function ReviewBadge({ trade, onOpenReview }) {
  const badge = upbitReviewBadge(trade.review) || { kind: 'pending', label: '복기 미작성' }
  return (
    <button
      type="button"
      className={`lab-upbit-review-badge lab-upbit-review-badge--${badge.kind}`}
      onClick={() => onOpenReview?.(trade)}
    >
      {badge.label}
    </button>
  )
}

function TradeDetails({ trade, quote, lastSyncAt, quoteUnavailable, open }) {
  return (
    <dl>
      {open && <div><dt>현재가</dt><dd><QuoteValue quote={quote} quoteUnavailable={quoteUnavailable} /></dd></div>}
      <div><dt>매도금액</dt><dd>{won(trade.grossSellAmount)}</dd></div>
      <div><dt>총 수수료</dt><dd>{won((finite(trade.buyFees) || 0) + (finite(trade.sellFees) || 0))}</dd></div>
      <div><dt>진입 시각</dt><dd>{dateTime(trade.openedAt)}</dd></div>
      <div><dt>청산 시각</dt><dd>{dateTime(trade.closedAt)}</dd></div>
      <div><dt>마지막 동기화</dt><dd>{dateTime(lastSyncAt)}</dd></div>
      <div><dt>누적 매수 체결</dt><dd>{number(trade.boughtQuantity)} · {won(trade.grossBuyAmount)}</dd></div>
      <div><dt>누적 매도 체결</dt><dd>{number(trade.soldQuantity)} · {won(trade.grossSellAmount)}</dd></div>
      <div><dt>매수금액</dt><dd>{won(trade.grossBuyAmount)}</dd></div>
      {open ? <div><dt>남은 수량</dt><dd>{number(trade.remainingQuantity)}</dd></div> : null}
    </dl>
  )
}

export function UpbitTradeCard({
  trade,
  quote,
  lastSyncAt,
  quoteUnavailable = false,
  detailsOpen = false,
  onOpenReview,
}) {
  const open = isOpenUpbitTrade(trade)
  const pnl = upbitTradePnl(trade, quote)
  const unknownBasis = trade.status === 'UNKNOWN_BASIS'
  return <li className={`lab-upbit-card lab-upbit-card--${open ? 'open' : 'closed'}`}>
    <div className="lab-upbit-card__head">
      <div>
        <CoinMark market={trade.market} />
        <strong>{marketLabel(trade.market)}</strong>
        <span className={`lab-upbit-card__status lab-upbit-card__status--${open ? 'open' : 'closed'}`}>{statusLabel(trade)}</span>
        <span className="lab-tag">실전</span>
      </div>
    </div>
    <div className={pnlClass(pnl.tone, unknownBasis)}>
      <span>{pnl.label}</span>
      <strong>{unknownBasis ? '매수 원가 확인 불가' : won(pnl.amount)}</strong>
      {!unknownBasis && <b>{pct(pnl.rate)}</b>}
    </div>
    <dl className="lab-upbit-card__summary">
      <div><dt>평균 진입가</dt><dd>{won(trade.averageEntryPrice)}</dd></div>
      {open
        ? <>
          <div><dt>현재가</dt><dd><QuoteValue quote={quote} quoteUnavailable={quoteUnavailable} /></dd></div>
          <div><dt>보유 수량</dt><dd>{number(trade.remainingQuantity)}</dd></div>
          <div><dt>투자금액</dt><dd>{won(trade.grossBuyAmount)}</dd></div>
          <div><dt>보유시간</dt><dd>{duration(trade.openedAt, trade.closedAt)}</dd></div>
          <div><dt>평가손익</dt><dd className={`lab-upbit-value--${pnl.tone}`}>{won(pnl.amount)}</dd></div>
        </>
        : <>
          <div><dt>평균 청산가</dt><dd>{won(trade.averageExitPrice)}</dd></div>
          <div><dt>평균 매수가</dt><dd>{won(trade.averageEntryPrice)}</dd></div>
          <div><dt>평균 매도가</dt><dd>{won(trade.averageExitPrice)}</dd></div>
          <div><dt>보유시간</dt><dd>{duration(trade.openedAt, trade.closedAt)}</dd></div>
          <div><dt>종료일시</dt><dd>{closedStamp(trade.closedAt)}</dd></div>
        </>}
    </dl>
    {!open ? <ReviewBadge trade={trade} onOpenReview={onOpenReview} /> : null}
    <details className="lab-upbit-card__details" open={detailsOpen || undefined}>
      <summary><span className="lab-upbit-detail-label--closed">상세 보기 <i>›</i></span><span className="lab-upbit-detail-label--open">상세 닫기</span></summary>
      <TradeDetails trade={trade} quote={quote} lastSyncAt={lastSyncAt} quoteUnavailable={quoteUnavailable} open={open} />
      {!open && <p>업비트 실전 거래 원본을 바탕으로 진입·청산 흐름을 복기하세요.</p>}
    </details>
  </li>
}

export function UpbitClosedTable({ trades, lastSyncAt, onOpenReview }) {
  return (
    <table className="lab-upbit-closed-table">
      <thead>
        <tr>
          <th>종목</th>
          <th>실현손익</th>
          <th>수익률</th>
          <th>평균 매수가</th>
          <th>평균 매도가</th>
          <th>보유시간</th>
          <th>종료일시</th>
          <th>복기 상태</th>
          <th>상세</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => (
          <ClosedTableRows key={trade.id} trade={trade} lastSyncAt={lastSyncAt} onOpenReview={onOpenReview} />
        ))}
      </tbody>
    </table>
  )
}

function ClosedTableRows({ trade, lastSyncAt, onOpenReview }) {
  const [open, setOpen] = React.useState(false)
  const pnl = upbitTradePnl(trade)
  const unknownBasis = trade.status === 'UNKNOWN_BASIS'
  return <>
    <tr>
      <td><strong>{marketLabel(trade.market)}</strong></td>
      <td className={`lab-upbit-pnl--${unknownBasis ? 'unknown' : pnl.tone}`}>{unknownBasis ? '매수 원가 확인 불가' : won(pnl.amount)}</td>
      <td className={`lab-upbit-pnl--${unknownBasis ? 'unknown' : pnl.tone}`}>{unknownBasis ? '—' : pct(pnl.rate)}</td>
      <td>{won(trade.averageEntryPrice)}</td>
      <td>{won(trade.averageExitPrice)}</td>
      <td>{duration(trade.openedAt, trade.closedAt)}</td>
      <td>{closedStamp(trade.closedAt)}</td>
      <td><ReviewBadge trade={trade} onOpenReview={onOpenReview} /></td>
      <td>
        <button type="button" className="lab-button lab-button--quiet" onClick={() => setOpen((current) => !current)}>
          {open ? '상세 닫기' : '상세 보기'}
        </button>
      </td>
    </tr>
    {open ? (
      <tr className="lab-upbit-closed-detail">
        <td colSpan={9}>
          <TradeDetails trade={trade} lastSyncAt={lastSyncAt} open={false} />
        </td>
      </tr>
    ) : null}
  </>
}

export default function UpbitRealTradesPanel() {
  const [status, setStatus] = useState(null)
  const [trades, setTrades] = useState([])
  const [summary, setSummary] = useState(null)
  const [pendingReminders, setPendingReminders] = useState([])
  const [quotes, setQuotes] = useState({})
  const [quoteUnavailable, setQuoteUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [reviewTrade, setReviewTrade] = useState(null)
  const [reviewBusy, setReviewBusy] = useState(false)

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
      setPendingReminders(tradesResult.value.pendingReminders || [])
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

  const activeReminder = pendingReminders[0] || null
  const reminderTrade = activeReminder
    ? trades.find((trade) => trade.id === activeReminder.episodeId) || {
      id: activeReminder.episodeId,
      market: activeReminder.market,
      status: 'CLOSED',
      review: activeReminder,
    }
    : null

  async function laterReminder() {
    if (!activeReminder || reviewBusy) return
    setReviewBusy(true)
    setError('')
    try {
      await deferUpbitTradeReview(activeReminder.episodeId)
      await load()
    } catch {
      setError('나중에 알림을 처리하지 못했습니다.')
    } finally {
      setReviewBusy(false)
    }
  }

  async function saveReview(payload) {
    if (!reviewTrade) return
    setReviewBusy(true)
    try {
      await saveUpbitTradeReview(reviewTrade.id, payload)
      setReviewTrade(null)
      await load()
    } finally {
      setReviewBusy(false)
    }
  }

  const connection = !status?.configured
    ? '미설정'
    : status.connected ? '연결됨' : '연결 끊김'
  const connectionTone = status?.connected ? 'connected' : 'idle'
  const overview = summary || summarizeUpbitTrades(trades)
  const openTrades = trades.filter(isOpenUpbitTrade)
  const closedTrades = trades.filter((trade) => !isOpenUpbitTrade(trade))
  const unrealized = sumOpenPnl(openTrades, quotes)
  const realizedTone = overview.totalRealizedPnl > 0 ? 'is-profit' : overview.totalRealizedPnl < 0 ? 'is-loss' : ''
  const unrealizedTone = unrealized > 0 ? 'is-profit' : unrealized < 0 ? 'is-loss' : ''

  return <section className="lab-upbit-real" aria-label="업비트 실전 거래">
    <header className="lab-section-head">
      <div><h2>업비트 실전</h2></div>
    </header>
    <div className="lab-upbit-summary" aria-label="업비트 실전 거래 요약">
      <div><span>보유 중</span><strong>{overview.openCount ?? 0}</strong></div>
      <div><span>종료</span><strong>{overview.closedCount ?? 0}</strong></div>
      <div><span>총 실현손익</span><strong className={realizedTone}>{won(overview.totalRealizedPnl)}</strong></div>
      <div><span>총 평가손익</span><strong className={unrealizedTone}>{won(unrealized)}</strong></div>
      <div><span>최근 동기화</span><strong>{syncTime(status?.lastSyncAt)}</strong></div>
      <div><span>연결 상태</span><strong className={`lab-upbit-status lab-upbit-status--${connectionTone}`}>● {connection}</strong></div>
    </div>
    <div className="lab-upbit-sync">
      <div><strong>UPBIT · READ ONLY</strong><span>조회 동기화 전용 · 실제 주문 기능 없음</span></div>
      <div className="lab-upbit-sync__meta">
        <span className={`lab-upbit-status lab-upbit-status--${connectionTone}`}>● {connection}</span>
        <span>최근 동기화 {syncTime(status?.lastSyncAt)}</span>
        <button type="button" className="lab-button" disabled={syncing || !status?.configured} onClick={synchronize}>{syncing ? '동기화 중…' : '지금 동기화'}</button>
      </div>
    </div>
    {activeReminder ? (
      <div className="lab-upbit-review-banner" role="status">
        <div>
          <strong>{marketLabel(activeReminder.market)} 거래가 종료됐습니다.</strong>
          <span>이번 매매의 근거를 기록할까요?</span>
        </div>
        <div className="lab-upbit-review-banner__actions">
          <button type="button" className="lab-button lab-button--primary" disabled={reviewBusy} onClick={() => setReviewTrade(reminderTrade)}>지금 작성</button>
          <button type="button" className="lab-button" disabled={reviewBusy} onClick={() => void laterReminder()}>나중에</button>
        </div>
      </div>
    ) : null}
    {error && <p className="lab-error" role="alert">{error}</p>}
    {loading ? <div className="lab-empty" role="status">업비트 실전 기록 확인 중…</div> : <>
      <section className="lab-upbit-section" aria-label="보유 포지션">
        <header>
          <h3>보유 포지션 ({openTrades.length})</h3>
          <p>현재 보유 중인 포지션입니다.</p>
        </header>
        {openTrades.length === 0
          ? <div className="lab-empty">현재 보유 중인 포지션이 없습니다.</div>
          : <ul className="lab-upbit-cards lab-upbit-open-grid">{openTrades.map((trade) => <UpbitTradeCard
            key={trade.id}
            trade={trade}
            quote={quotes[trade.market]}
            quoteUnavailable={quoteUnavailable}
            lastSyncAt={status?.lastSyncAt}
          />)}</ul>}
      </section>
      <section className="lab-upbit-section" aria-label="종료된 포지션">
        <header>
          <h3>종료된 포지션 ({closedTrades.length})</h3>
        </header>
        {closedTrades.length === 0
          ? <div className="lab-empty">종료된 포지션이 없습니다.</div>
          : <>
            <UpbitClosedTable trades={closedTrades} lastSyncAt={status?.lastSyncAt} onOpenReview={setReviewTrade} />
            <ul className="lab-upbit-closed-stack">{closedTrades.map((trade) => <UpbitTradeCard
              key={trade.id}
              trade={trade}
              lastSyncAt={status?.lastSyncAt}
              onOpenReview={setReviewTrade}
            />)}</ul>
          </>}
      </section>
    </>}
    <p className="lab-journal-footnote">업비트에서 직접 실행한 체결을 읽어온 기록입니다. ALADDIN은 주문을 생성하거나 취소하지 않습니다.</p>
    {reviewTrade ? (
      <UpbitTradeReviewDialog
        trade={reviewTrade}
        review={reviewTrade.review}
        busy={reviewBusy}
        onClose={() => { if (!reviewBusy) setReviewTrade(null) }}
        onSave={saveReview}
      />
    ) : null}
  </section>
}
