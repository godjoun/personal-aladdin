import { useMemo, useState } from 'react'
import TradeRecordDrawer from '../../components/trading/TradeRecordDrawer.jsx'
import { getTradingTrades } from '../../services/tradingTradeStorage.js'
import {
  buildTradingDeskSummary,
  buildTradingPerformanceStats,
  formatTradeDateShort,
  getRecentTrades,
} from '../../utils/tradingTradeCalculator.js'
import {
  formatCurrency,
  formatPercent,
  formatProfitLoss,
} from '../../utils/formatters.js'
import '../../styles/Trading.css'

function getPnlClassName(value) {
  if (!Number.isFinite(Number(value)) || Number(value) === 0) return ''
  return Number(value) > 0
    ? 'trading-desk__pnl--profit'
    : 'trading-desk__pnl--loss'
}

function formatWinRate(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-'
  }
  return `${value.toFixed(1)}%`
}

function formatOptionalPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-'
  }
  return formatPercent(value)
}

function formatMaxLossStreak(value, hasTradeData) {
  if (!hasTradeData) return '-'
  return `${value}회`
}

export default function TradingHome() {
  const [trades, setTrades] = useState(() => getTradingTrades())
  const [drawerState, setDrawerState] = useState({
    open: false,
    mode: 'create',
    trade: null,
  })

  const summary = useMemo(() => buildTradingDeskSummary(trades), [trades])
  const performance = useMemo(
    () => buildTradingPerformanceStats(trades),
    [trades],
  )
  const recentTrades = useMemo(() => getRecentTrades(trades, 5), [trades])
  const hasTrades = trades.length > 0

  function openCreateDrawer() {
    setDrawerState({ open: true, mode: 'create', trade: null })
  }

  function openTradeDrawer(trade) {
    setDrawerState({ open: true, mode: 'view', trade })
  }

  function closeDrawer() {
    setDrawerState({ open: false, mode: 'create', trade: null })
  }

  function refreshTrades() {
    setTrades(getTradingTrades())
  }

  function handleSaved() {
    closeDrawer()
    refreshTrades()
  }

  function handleDeleted() {
    closeDrawer()
    refreshTrades()
  }

  const summaryItems = [
    { id: 'total-trades', label: '총 거래', value: `${summary.totalTrades}회` },
    {
      id: 'total-pnl',
      label: '누적 손익',
      value: formatCurrency(summary.totalProfitLoss),
    },
    {
      id: 'win-rate',
      label: '승률',
      value: formatWinRate(summary.winRate),
    },
    {
      id: 'week-pnl',
      label: '이번 주 손익',
      value: formatCurrency(summary.weekProfitLoss),
    },
  ]

  const performanceItems = [
    {
      id: 'avg-win',
      label: '평균 수익',
      value: formatOptionalPercent(performance.avgWinRate),
    },
    {
      id: 'avg-loss',
      label: '평균 손실',
      value: formatOptionalPercent(performance.avgLossRate),
    },
    {
      id: 'max-loss-streak',
      label: '최대 연속손실',
      value: formatMaxLossStreak(performance.maxLossStreak, hasTrades),
    },
    {
      id: 'win-share',
      label: '수익 거래 비중',
      value: formatWinRate(performance.winShare),
    },
  ]

  return (
    <div className="trading trading-desk" aria-label="TRADING">
      <header className="trading-desk__header">
        <div className="trading-desk__intro">
          <h1 className="trading-desk__title">TRADING</h1>
          <p className="trading-desk__subtitle">
            내 거래를 기록하고 복기하는 공간
          </p>
        </div>
        <button
          type="button"
          className="trading-desk__action trading-desk__action--primary"
          onClick={openCreateDrawer}
        >
          + 거래 기록
        </button>
      </header>

      <section className="trading-desk__metrics" aria-label="상단 요약">
        {summaryItems.map((item) => (
          <article key={item.id} className="trading-desk__metric">
            <p className="trading-desk__metric-label">{item.label}</p>
            <p className="trading-desk__metric-value">{item.value}</p>
          </article>
        ))}
      </section>

      <section
        className={`trading-desk__section trading-desk__section--trades${
          hasTrades ? ' trading-desk__section--trades-filled' : ''
        }`}
        aria-label="최근 거래"
      >
        <h2 className="trading-desk__section-title">최근 거래</h2>
        {!hasTrades ? (
          <div className="trading-desk__empty trading-desk__empty--center">
            <p className="trading-desk__empty-text">
              아직 거래 기록이 없습니다.
            </p>
            <button
              type="button"
              className="trading-desk__cta-btn"
              onClick={openCreateDrawer}
            >
              첫 거래 기록
            </button>
          </div>
        ) : (
          <ul className="trading-desk__trade-list">
            {recentTrades.map((trade) => {
              const pnlClass = getPnlClassName(trade.profitLoss)
              return (
                <li key={trade.id}>
                  <button
                    type="button"
                    className="trading-desk__trade-row"
                    onClick={() => openTradeDrawer(trade)}
                  >
                    <span className="trading-desk__trade-symbol">
                      {trade.symbol}
                    </span>
                    <span className="trading-desk__trade-date">
                      {formatTradeDateShort(trade.tradedAt)}
                    </span>
                    <span className={pnlClass}>
                      {formatPercent(trade.returnRate)}
                    </span>
                    <span className={pnlClass}>
                      {formatProfitLoss(trade.profitLoss)}
                    </span>
                    <span className="trading-desk__trade-tag">
                      {trade.tags[0] || '—'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section
        className="trading-desk__section trading-desk__performance"
        aria-label="내 매매 성적"
      >
        <h2 className="trading-desk__section-title trading-desk__section-title--compact">
          내 매매 성적
        </h2>
        <dl className="trading-desk__perf-grid">
          {performanceItems.map((item) => (
            <div key={item.id}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="trading-desk__empty-text trading-desk__perf-hint">
          거래 기록이 쌓이면 매매 패턴을 확인할 수 있습니다.
        </p>
      </section>

      <TradeRecordDrawer
        open={drawerState.open}
        mode={drawerState.mode}
        trade={drawerState.trade}
        onClose={closeDrawer}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
