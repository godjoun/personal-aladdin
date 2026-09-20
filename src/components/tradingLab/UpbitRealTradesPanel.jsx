import { useCallback, useEffect, useState } from 'react'
import {
  fetchUpbitStatus,
  fetchUpbitTrades,
  syncUpbitTrades,
} from '../../services/tradingLabApi.js'

function won(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Math.round(Number(value)).toLocaleString('ko-KR')}원`
}

function number(value, digits = 8) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits })
}

function pct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const n = Number(value)
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

function dateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR')
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

function statusLabel(status) {
  return {
    OPEN: 'OPEN', CLOSED: 'CLOSED', PARTIAL: 'PARTIAL', UNKNOWN_BASIS: '매수 원가 확인 불가',
  }[status] || status
}

function resultLabel(trade) {
  if (trade.status === 'UNKNOWN_BASIS' || trade.realizedPnl == null) return '매수 원가 확인 불가'
  if (trade.realizedPnl > 0) return '이익 실현'
  if (trade.realizedPnl < 0) return '손실 실현'
  return '손익 없음'
}

export default function UpbitRealTradesPanel() {
  const [status, setStatus] = useState(null)
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [statusResult, tradesResult] = await Promise.allSettled([
      fetchUpbitStatus(), fetchUpbitTrades({ limit: 100 }),
    ])
    if (statusResult.status === 'fulfilled') setStatus(statusResult.value.status)
    if (tradesResult.status === 'fulfilled') setTrades(tradesResult.value.trades || [])
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

  return <section className="lab-upbit-real" aria-label="업비트 실전 거래">
    <header className="lab-section-head">
      <div><span className="lab-eyebrow">UPBIT · READ ONLY</span><h2>업비트 실전</h2></div>
      <span className={`lab-upbit-status lab-upbit-status--${status?.connected ? 'connected' : 'idle'}`}>{connection}</span>
    </header>
    <div className="lab-upbit-sync">
      <div><strong>{status?.connected ? '실시간 감지 중' : status?.configured ? '재연결 대기 중' : '주문조회 키 미설정'}</strong><span>마지막 동기화: {dateTime(status?.lastSyncAt)}</span></div>
      <button type="button" className="lab-button" disabled={syncing || !status?.configured} onClick={synchronize}>{syncing ? '동기화 중…' : '지금 동기화'}</button>
    </div>
    {error && <p className="lab-error" role="alert">{error}</p>}
    {loading ? <div className="lab-empty" role="status">업비트 실전 기록 확인 중…</div>
      : trades.length === 0 ? <div className="lab-empty">동기화된 업비트 실전 거래가 없습니다.</div>
      : <ul className="lab-upbit-cards">{trades.map((trade) => <li key={trade.id} className="lab-upbit-card">
        <div className="lab-upbit-card__head"><strong>{trade.market}</strong><span className="lab-tag">실전</span><span>{statusLabel(trade.status)}</span></div>
        <dl>
          <div><dt>평균 진입가</dt><dd>{won(trade.averageEntryPrice)}</dd></div>
          <div><dt>평균 청산가</dt><dd>{won(trade.averageExitPrice)}</dd></div>
          <div><dt>매수금액</dt><dd>{won(trade.grossBuyAmount)}</dd></div>
          <div><dt>매도금액</dt><dd>{won(trade.grossSellAmount)}</dd></div>
          <div><dt>총 수수료</dt><dd>{won((trade.buyFees || 0) + (trade.sellFees || 0))}</dd></div>
          <div><dt>남은 수량</dt><dd>{number(trade.remainingQuantity)}</dd></div>
          <div><dt>실현손익</dt><dd>{trade.status === 'UNKNOWN_BASIS' ? '매수 원가 확인 불가' : won(trade.realizedPnl)}</dd></div>
          <div><dt>실현손익률</dt><dd>{trade.status === 'UNKNOWN_BASIS' ? '—' : pct(trade.realizedPnlPct)}</dd></div>
          <div><dt>보유시간</dt><dd>{duration(trade.openedAt, trade.closedAt)}</dd></div>
          <div><dt>진입 / 청산</dt><dd>{dateTime(trade.openedAt)} / {dateTime(trade.closedAt)}</dd></div>
        </dl>
        <p className="lab-upbit-card__result">{resultLabel(trade)}</p>
      </li>)}</ul>}
    <p className="lab-journal-footnote">업비트에서 직접 실행한 체결을 읽어온 기록입니다. ALADDIN은 주문을 생성하거나 취소하지 않습니다.</p>
  </section>
}
