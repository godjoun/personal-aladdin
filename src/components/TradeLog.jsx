/**
 * TradeLog.jsx — 거래 원장 목록
 */

import '../styles/TradeForm.css'

function formatCurrency(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatTradeTime(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TradeLog({ trades = [] }) {
  if (trades.length === 0) {
    return (
      <section className="trade-log" aria-label="거래 원장">
        <h3 className="trade-log__title">Transaction History</h3>
        <p className="trade-log__empty">아직 거래 기록이 없습니다.</p>
      </section>
    )
  }

  return (
    <section className="trade-log" aria-label="거래 원장">
      <h3 className="trade-log__title">Transaction History</h3>
      <p className="trade-log__desc">총 {trades.length}건 · 최신순</p>

      <div className="trade-log__list">
        {trades.map((trade) => (
          <article
            key={trade.id}
            className={`trade-log__item trade-log__item--${trade.side}`}
          >
            <div className="trade-log__item-header">
              <span className={`trade-log__side trade-log__side--${trade.side}`}>
                {trade.side === 'buy' ? '매수' : '매도'}
              </span>
              <span className="trade-log__name">
                {trade.name} ({trade.symbol})
              </span>
            </div>
            <p className="trade-log__detail">
              {trade.quantity}주 @ {formatCurrency(trade.price)}
              <span className="trade-log__total">
                = {formatCurrency(trade.quantity * trade.price)}
              </span>
            </p>
            {trade.memo && <p className="trade-log__memo">{trade.memo}</p>}
            <time className="trade-log__time" dateTime={trade.tradedAt}>
              {formatTradeTime(trade.tradedAt)}
            </time>
          </article>
        ))}
      </div>
    </section>
  )
}

export default TradeLog
