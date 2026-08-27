/**
 * Dashboard.jsx — 단일 개인 투자 대시보드 (v1.1)
 */

import { useEffect, useMemo, useState } from 'react'
import AssetForm from '../components/AssetForm.jsx'
import TradeForm from '../components/TradeForm.jsx'
import DividendForm from '../components/DividendForm.jsx'
import HoldingsTable from '../components/dashboard/HoldingsTable.jsx'
import DividendCalendar from './DividendCalendar.jsx'
import { removeAssetWithTrades } from '../services/tradeService.js'
import { fetchKiwoomBalances } from '../services/kiwoomApi.js'
import { syncKiwoomDividends } from '../services/kiwoomDividendSync.js'
import {
  deleteDividendEvent,
  getDividendEvents,
  saveDividendEvents,
} from '../services/dividendStorage.js'
import { persistManualLedger } from '../services/dividendPersistence.js'
import { apiFetch } from '../services/apiClient.js'
import {
  buildDashboardHoldingsView,
  calculateKiwoomPortfolioSummary,
} from '../utils/kiwoomDashboard.js'
import { calculatePortfolioSummary } from '../utils/portfolioRows.js'
import {
  calculateLast12MonthsDividendBars,
  calculateMonthlyDividendSummary,
  calculateYearPaidDividend,
  getDividendEventAmount,
  getDividendStatusLabel,
  getNextDividendEvent,
  getRecentPaidDividends,
  parseDividendPaymentDate,
} from '../utils/dividendCalculator.js'
import {
  filterDividendsByAccount,
  filterHoldingsByAccount,
  pickTopMoverByAbsProfitLoss,
  isKiwoomDividendEvent,
} from '../utils/dashboardFilters.js'
import {
  formatCurrency,
  formatPercent,
  formatProfitLoss,
  getPnlClass,
} from '../utils/formatters.js'
import '../styles/Dashboard.css'

const REFRESH_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
}

const KIWOOM_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  OK: 'ok',
  ERROR: 'error',
}

const SYNC_STEPS = {
  IDLE: '',
  ACCOUNTS: '계좌 확인 중...',
  TRADES: '거래내역 확인 중...',
  DIVIDENDS: '배당 확인 중...',
  DONE: '완료',
}

const ACCOUNT_FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'isa', label: 'ISA' },
  { id: 'general', label: '일반' },
]

function formatUpdatedAt(date) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatPaymentDateDot(paymentDate) {
  const date = parseDividendPaymentDate(paymentDate)
  if (!date) return paymentDate || '—'
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${m}.${d}`
}

function formatDayTitle(dateKey) {
  const date = parseDividendPaymentDate(dateKey)
  if (!date) return dateKey || '—'
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
}

function filterRowsByAccount(rows, accountFilter) {
  return filterHoldingsByAccount(rows, accountFilter)
}

function filterEventsByAccount(events, accountFilter) {
  return filterDividendsByAccount(events, accountFilter)
}

function pickTopMover(rows) {
  return pickTopMoverByAbsProfitLoss(rows)
}

function isKiwoomEvent(event) {
  return isKiwoomDividendEvent(event)
}

function DividendFlowBars({ bars }) {
  const max = Math.max(0, ...bars.map((bar) => bar.total))

  return (
    <div className="simple-dash__flow" aria-label="최근 12개월 배당">
      <h3 className="simple-dash__flow-title">최근 12개월 배당</h3>
      <ul className="simple-dash__flow-list">
        {bars.map((bar) => {
          const height =
            max <= 0 ? 0 : Math.max(bar.total > 0 ? 8 : 0, (bar.total / max) * 56)
          return (
            <li
              key={`${bar.year}-${bar.month}`}
              className="simple-dash__flow-item"
              title={`${bar.year}년 ${bar.month}월 · ${formatCurrency(bar.total)}`}
            >
              <div className="simple-dash__flow-bar-track">
                <div
                  className="simple-dash__flow-bar"
                  style={{ height: `${height}px` }}
                />
              </div>
              <span className="simple-dash__flow-label">{bar.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Dashboard({
  prices = [],
  assets = [],
  onRefreshPrices,
  lastUpdatedAt = null,
  persistenceReady = false,
  onAssetsChange,
  onAssetAdded,
  onTradesChange,
  onKiwoomSynced,
  onLogout,
}) {
  const [refreshStatus, setRefreshStatus] = useState(REFRESH_STATUS.IDLE)
  const [syncStep, setSyncStep] = useState(SYNC_STEPS.IDLE)
  const [syncNotice, setSyncNotice] = useState('')
  const [kiwoomStatus, setKiwoomStatus] = useState(KIWOOM_STATUS.LOADING)
  const [kiwoomHoldings, setKiwoomHoldings] = useState([])
  const [withdrawableByAccount, setWithdrawableByAccount] = useState([
    { accountType: 'isa', withdrawableAmount: null },
    { accountType: 'general', withdrawableAmount: null },
  ])
  const [dividendEvents, setDividendEvents] = useState(() => getDividendEvents())
  const [accountFilter, setAccountFilter] = useState('all')
  const [holdingsSearch, setHoldingsSearch] = useState('')
  const [manageMode, setManageMode] = useState(null)
  const [editingEvent, setEditingEvent] = useState(null)
  const [detailEvent, setDetailEvent] = useState(null)
  const [dayDetail, setDayDetail] = useState(null)
  const [syncedAt, setSyncedAt] = useState(lastUpdatedAt)

  async function loadKiwoomBalances({ preserveOnFail = true } = {}) {
    setKiwoomStatus(KIWOOM_STATUS.LOADING)
    try {
      const result = await fetchKiwoomBalances()
      if (!result.ok) {
        if (!preserveOnFail) {
          setKiwoomHoldings([])
          setWithdrawableByAccount([
            { accountType: 'isa', withdrawableAmount: null },
            { accountType: 'general', withdrawableAmount: null },
          ])
        }
        setKiwoomStatus(KIWOOM_STATUS.ERROR)
        return false
      }
      setKiwoomHoldings(result.holdings)
      setWithdrawableByAccount(
        Array.isArray(result.withdrawableByAccount)
          ? result.withdrawableByAccount
          : [
              { accountType: 'isa', withdrawableAmount: null },
              { accountType: 'general', withdrawableAmount: null },
            ],
      )
      setKiwoomStatus(KIWOOM_STATUS.OK)
      const now = new Date()
      setSyncedAt(now)
      onKiwoomSynced?.(now)
      return true
    } catch (error) {
      console.error('[Dashboard] 키움 잔고 조회 실패:', error.message)
      if (!preserveOnFail) {
        setKiwoomHoldings([])
        setWithdrawableByAccount([
          { accountType: 'isa', withdrawableAmount: null },
          { accountType: 'general', withdrawableAmount: null },
        ])
      }
      setKiwoomStatus(KIWOOM_STATUS.ERROR)
      return false
    }
  }

  async function loadKiwoomDividends() {
    try {
      const result = await syncKiwoomDividends({ from: '2026-08-01' })
      setDividendEvents(getDividendEvents())
      return result
    } catch (error) {
      console.warn('[Dashboard] 키움 배당 동기화 실패:', error.message)
      return { ok: false, added: 0, additions: [] }
    }
  }

  // App hydrate(manual → dividend) 완료 후 Kiwoom 동기화
  useEffect(() => {
    if (!persistenceReady) return undefined

    let cancelled = false

    async function boot() {
      setDividendEvents(getDividendEvents())
      await loadKiwoomBalances({ preserveOnFail: false })
      if (!cancelled) {
        await loadKiwoomDividends()
      }
    }

    boot()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistenceReady])

  useEffect(() => {
    if (lastUpdatedAt) setSyncedAt(lastUpdatedAt)
  }, [lastUpdatedAt])

  useEffect(() => {
    if (
      refreshStatus === REFRESH_STATUS.SUCCESS ||
      refreshStatus === REFRESH_STATUS.ERROR
    ) {
      const timer = setTimeout(() => {
        setRefreshStatus(REFRESH_STATUS.IDLE)
        setSyncStep(SYNC_STEPS.IDLE)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [refreshStatus])

  useEffect(() => {
    if (!syncNotice) return undefined
    const timer = setTimeout(() => setSyncNotice(''), 5000)
    return () => clearTimeout(timer)
  }, [syncNotice])

  useEffect(() => {
    if (!manageMode && !detailEvent && !dayDetail) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setManageMode(null)
        setEditingEvent(null)
        setDetailEvent(null)
        setDayDetail(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [manageMode, detailEvent, dayDetail])

  async function handleFullSync() {
    if (refreshStatus === REFRESH_STATUS.LOADING) return

    setRefreshStatus(REFRESH_STATUS.LOADING)
    setSyncNotice('')
    setSyncStep(SYNC_STEPS.ACCOUNTS)

    try {
      const balanceOk = await loadKiwoomBalances({ preserveOnFail: true })

      setSyncStep(SYNC_STEPS.TRADES)
      let marketOk = false
      try {
        await onRefreshPrices?.()
        marketOk = true
      } catch (error) {
        console.warn('[Dashboard] 시세 갱신 실패:', error.message)
      }

      setSyncStep(SYNC_STEPS.DIVIDENDS)
      const dividendResult = await loadKiwoomDividends()

      try {
        await persistManualLedger()
      } catch {
        // 수동 백업 실패는 동기화 전체 실패로 보지 않음
      }

      setSyncStep(SYNC_STEPS.DONE)

      if (balanceOk || marketOk || dividendResult.ok) {
        setRefreshStatus(REFRESH_STATUS.SUCCESS)
        setSyncedAt(new Date())
        if (dividendResult.added > 0) {
          const amount = (dividendResult.additions || []).reduce(
            (sum, event) => sum + getDividendEventAmount(event),
            0,
          )
          setSyncNotice(
            `새 배당 ${dividendResult.added}건 · ${formatCurrency(amount)}`,
          )
        } else {
          setSyncNotice('방금 동기화됨')
        }
      } else {
        setRefreshStatus(REFRESH_STATUS.ERROR)
        setSyncNotice('동기화 실패 · 기존 데이터 유지')
      }
    } catch (error) {
      console.error('[Dashboard] 전체 동기화 실패:', error)
      setRefreshStatus(REFRESH_STATUS.ERROR)
      setSyncNotice('동기화 실패 · 기존 데이터 유지')
    }
  }

  function handleDeleteAsset(id) {
    removeAssetWithTrades(id)
    onAssetsChange?.()
    onTradesChange?.()
    persistManualLedger().catch(() => {})
  }

  function reloadDividends() {
    setDividendEvents(getDividendEvents())
  }

  function openManage(mode, event = null) {
    setDetailEvent(null)
    setDayDetail(null)
    setEditingEvent(event)
    setManageMode(mode)
  }

  function closeManage() {
    setManageMode(null)
    setEditingEvent(null)
  }

  function handleDividendSaved() {
    reloadDividends()
    closeManage()
    setDetailEvent(null)
    setDayDetail(null)
  }

  async function handleDeleteDividend(event) {
    if (isKiwoomEvent(event)) return

    const name = event.fundName || event.symbol || '배당'
    const confirmed = window.confirm(`「${name}」 배당 일정을 삭제할까요?`)
    if (!confirmed) return

    try {
      const response = await apiFetch(`/api/dividends/${encodeURIComponent(event.id)}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        const payload = await response.json()
        if (Array.isArray(payload.events)) {
          saveDividendEvents(payload.events)
          setDividendEvents(payload.events)
        } else {
          deleteDividendEvent(event.id)
          reloadDividends()
        }
      } else {
        deleteDividendEvent(event.id)
        reloadDividends()
      }
    } catch {
      deleteDividendEvent(event.id)
      reloadDividends()
    }

    setDetailEvent(null)
    setDayDetail(null)
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const { rows: assetRows, usingKiwoom } = buildDashboardHoldingsView({
    kiwoomHoldings,
    kiwoomOk: kiwoomStatus === KIWOOM_STATUS.OK,
    assets,
    prices,
  })

  const filteredAssetRows = useMemo(
    () => filterRowsByAccount(assetRows, accountFilter),
    [assetRows, accountFilter],
  )

  const summary = useMemo(() => {
    if (usingKiwoom) {
      const kiwoomOnly = filteredAssetRows.filter((row) => row.source === 'kiwoom')
      return calculateKiwoomPortfolioSummary(kiwoomOnly)
    }
    return calculatePortfolioSummary(filteredAssetRows)
  }, [filteredAssetRows, usingKiwoom])

  const filteredDividends = useMemo(
    () => filterEventsByAccount(dividendEvents, accountFilter),
    [dividendEvents, accountFilter],
  )

  const totalInvested = summary.totalInvested
  const totalHoldingValue = summary.totalHoldingValue
  const totalProfitLoss = summary.totalProfitLoss
  const totalReturnRate = summary.totalReturnRate

  const monthlyDividend = calculateMonthlyDividendSummary(
    filteredDividends,
    year,
    month,
  )
  const thisMonthPaid = monthlyDividend.paid
  const yearPaidDividend = calculateYearPaidDividend(filteredDividends, year)
  const paidCountThisMonth = filteredDividends.filter((event) => {
    if (event?.status !== 'PAID') return false
    const date = parseDividendPaymentDate(event.paymentDate)
    if (!date) return false
    return date.getFullYear() === year && date.getMonth() + 1 === month
  }).length

  const nextDividend = getNextDividendEvent(filteredDividends, now)
  const recentPaid = getRecentPaidDividends(filteredDividends, 5)
  const flowBars = calculateLast12MonthsDividendBars(filteredDividends, now)
  const topMover = pickTopMover(filteredAssetRows)

  const manageTitle =
    manageMode === 'asset'
      ? '자산 추가'
      : manageMode === 'trade'
        ? '거래 기록'
        : manageMode === 'dividend'
          ? editingEvent
            ? '배당 수정'
            : '배당 기록'
          : ''

  const showHoldingsTable = filteredAssetRows.length > 0
  const showKiwoomLoading = kiwoomStatus === KIWOOM_STATUS.LOADING
  const showKiwoomError =
    kiwoomStatus === KIWOOM_STATUS.ERROR && assetRows.length === 0

  const refreshLabel =
    refreshStatus === REFRESH_STATUS.LOADING
      ? syncStep || '동기화 중…'
      : refreshStatus === REFRESH_STATUS.SUCCESS
        ? '동기화 완료'
        : refreshStatus === REFRESH_STATUS.ERROR
          ? '동기화 실패'
          : '↻ 전체 동기화'

  return (
    <div className="simple-dash" aria-label="내 투자 대시보드">
      <header className="simple-dash__header">
        <div className="simple-dash__brand">
          <h1 className="simple-dash__title">ALADDIN</h1>
          <div className="simple-dash__account-tabs" role="tablist" aria-label="계좌 필터">
            {ACCOUNT_FILTERS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={accountFilter === tab.id}
                className={`simple-dash__account-tab${
                  accountFilter === tab.id ? ' is-active' : ''
                }`}
                onClick={() => setAccountFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="simple-dash__header-actions">
          <p className="simple-dash__updated">
            마지막 동기화
            <span>{formatUpdatedAt(syncedAt)}</span>
          </p>
          <div className="simple-dash__quick-actions" aria-label="관리">
            <button
              type="button"
              className="simple-dash__manage-btn"
              onClick={() => openManage('asset')}
            >
              + 자산
            </button>
            <button
              type="button"
              className="simple-dash__manage-btn"
              onClick={() => openManage('trade')}
              disabled={assets.length === 0}
            >
              + 거래
            </button>
            <button
              type="button"
              className="simple-dash__manage-btn"
              onClick={() => openManage('dividend')}
            >
              + 배당
            </button>
          </div>
          <button
            type="button"
            className={`simple-dash__refresh simple-dash__refresh--${refreshStatus}`}
            onClick={handleFullSync}
            disabled={refreshStatus === REFRESH_STATUS.LOADING}
          >
            {refreshLabel}
          </button>
          {onLogout && (
            <button
              type="button"
              className="simple-dash__manage-btn"
              onClick={onLogout}
            >
              로그아웃
            </button>
          )}
        </div>
      </header>

      {(syncStep || syncNotice) && (
        <p className="simple-dash__sync-status" role="status">
          {refreshStatus === REFRESH_STATUS.LOADING ? syncStep : syncNotice}
        </p>
      )}

      <section className="simple-dash__metrics" aria-label="요약">
        <article className="simple-dash__metric simple-dash__metric--primary">
          <p className="simple-dash__metric-label">총 평가자산</p>
          <p className="simple-dash__metric-value">
            {formatCurrency(totalHoldingValue)}
          </p>
        </article>
        <article className="simple-dash__metric simple-dash__metric--primary">
          <p className="simple-dash__metric-label">평가손익</p>
          <p
            className={`simple-dash__metric-value ${getPnlClass(totalProfitLoss)}`}
          >
            {formatProfitLoss(totalProfitLoss)}
          </p>
        </article>
        <article className="simple-dash__metric simple-dash__metric--primary">
          <p className="simple-dash__metric-label">총 수익률</p>
          <p
            className={`simple-dash__metric-value ${getPnlClass(totalReturnRate)}`}
          >
            {formatPercent(totalReturnRate)}
          </p>
        </article>
        <article className="simple-dash__metric simple-dash__metric--primary">
          <p className="simple-dash__metric-label">이번 달 배당</p>
          <p className="simple-dash__metric-value">
            {formatCurrency(thisMonthPaid)}
          </p>
        </article>
      </section>

      <section className="simple-dash__secondary-metrics" aria-label="보조 요약">
        <p>
          투자원금 <strong>{formatCurrency(totalInvested)}</strong>
        </p>
        <p>
          올해 받은 배당 <strong>{formatCurrency(yearPaidDividend)}</strong>
        </p>
        <p>
          보유 종목 수 <strong>{filteredAssetRows.length}</strong>
        </p>
        <p>
          마지막 동기화 <strong>{formatUpdatedAt(syncedAt)}</strong>
        </p>
        <p className="simple-dash__withdrawable" aria-label="출금 가능액">
          출금 가능액{' '}
          <strong>
            ISA{' '}
            {formatCurrency(
              withdrawableByAccount.find((item) => item.accountType === 'isa')
                ?.withdrawableAmount ?? null,
            )}
          </strong>
          {' · '}
          <strong>
            일반{' '}
            {formatCurrency(
              withdrawableByAccount.find((item) => item.accountType === 'general')
                ?.withdrawableAmount ?? null,
            )}
          </strong>
        </p>
        {topMover && (
          <p className="simple-dash__top-mover">
            가장 큰 변동{' '}
            <strong>
              {topMover.name}{' '}
              <span className={getPnlClass(topMover.profitLoss)}>
                {formatProfitLoss(topMover.profitLoss)}
              </span>
              {topMover.profitRate != null && (
                <> ({formatPercent(topMover.profitRate)})</>
              )}
            </strong>
          </p>
        )}
        {usingKiwoom && (
          <p className="simple-dash__source-hint">키움 계좌 잔고 기준 · 조회 전용</p>
        )}
      </section>

      <section className="simple-dash__mid" aria-label="보유 종목과 다음 배당">
        <div className="simple-dash__card simple-dash__holdings">
          <div className="simple-dash__holdings-header">
            <h2 className="simple-dash__section-title">보유 종목</h2>
            <div className="simple-dash__holdings-actions">
              <button
                type="button"
                className="simple-dash__manage-btn"
                onClick={() => openManage('asset')}
              >
                + 자산
              </button>
              <button
                type="button"
                className="simple-dash__manage-btn"
                onClick={() => openManage('trade')}
                disabled={assets.length === 0}
              >
                + 거래
              </button>
              <button
                type="button"
                className="simple-dash__manage-btn"
                onClick={() => openManage('dividend')}
              >
                + 배당
              </button>
            </div>
          </div>

          {showKiwoomLoading && (
            <p className="simple-dash__empty-hint">계좌 불러오는 중...</p>
          )}

          {!showKiwoomLoading && showKiwoomError && (
            <div className="simple-dash__empty-compact">
              <p>키움 계좌 정보를 불러오지 못했습니다.</p>
              <button
                type="button"
                className="simple-dash__manage-btn simple-dash__manage-btn--primary"
                onClick={() => loadKiwoomBalances({ preserveOnFail: false })}
              >
                다시 시도
              </button>
            </div>
          )}

          {!showKiwoomLoading && !showKiwoomError && !showHoldingsTable && (
            <div className="simple-dash__empty-compact">
              <p>아직 표시할 보유 종목이 없습니다.</p>
              <button
                type="button"
                className="simple-dash__manage-btn simple-dash__manage-btn--primary"
                onClick={() => openManage('asset')}
              >
                + 첫 자산 등록
              </button>
            </div>
          )}

          {!showKiwoomLoading && showHoldingsTable && (
            <HoldingsTable
              assetRows={filteredAssetRows}
              onDeleteAsset={handleDeleteAsset}
              hideTitle
              accountFilter="all"
              searchQuery={holdingsSearch}
              onSearchQueryChange={setHoldingsSearch}
            />
          )}
        </div>

        <aside
          className={`simple-dash__card simple-dash__next-dividend${
            nextDividend ? '' : ' simple-dash__next-dividend--empty'
          }`}
        >
          <h2 className="simple-dash__section-title">다음 배당</h2>
          {nextDividend ? (
            <div className="simple-dash__next-body">
              <p className="simple-dash__next-name">
                {nextDividend.fundName || nextDividend.symbol || '—'}
              </p>
              <p className="simple-dash__next-date">
                {formatPaymentDateDot(nextDividend.paymentDate)}
              </p>
              <dl className="simple-dash__next-meta">
                <div>
                  <dt>예상 금액</dt>
                  <dd>{formatCurrency(getDividendEventAmount(nextDividend))}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{getDividendStatusLabel(nextDividend.status)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="simple-dash__empty-hint">예정 정보 없음</p>
          )}
        </aside>
      </section>

      <section className="simple-dash__card simple-dash__dividend-strip" aria-label="배당 요약">
        <div className="simple-dash__dividend-summary">
          <h2 className="simple-dash__section-title">배당</h2>
          <dl className="simple-dash__dividend-stats">
            <div>
              <dt>이번 달</dt>
              <dd>{formatCurrency(thisMonthPaid)}</dd>
            </div>
            <div>
              <dt>올해 누적</dt>
              <dd>{formatCurrency(yearPaidDividend)}</dd>
            </div>
            <div>
              <dt>지급</dt>
              <dd>{paidCountThisMonth}건</dd>
            </div>
          </dl>
        </div>
        <div className="simple-dash__recent-paid">
          <h3 className="simple-dash__recent-title">최근 지급</h3>
          {recentPaid.length === 0 ? (
            <p className="simple-dash__empty-hint">지급 기록 없음</p>
          ) : (
            <ul className="simple-dash__recent-list">
              {recentPaid.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className="simple-dash__recent-row"
                    onClick={() => setDetailEvent(event)}
                  >
                    <span className="simple-dash__recent-date">
                      {formatPaymentDateDot(event.paymentDate)}
                    </span>
                    <span className="simple-dash__recent-name">
                      {event.fundName || event.symbol || '—'}
                    </span>
                    <span className="simple-dash__recent-amount">
                      {formatCurrency(getDividendEventAmount(event))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="simple-dash__card simple-dash__calendar" aria-label="배당 달력">
        <DividendFlowBars bars={flowBars} />
        <DividendCalendar
          events={filteredDividends}
          onEventClick={setDetailEvent}
          onDayClick={(dateKey, dayEvents) => {
            setDayDetail({ dateKey, events: dayEvents })
            setDetailEvent(null)
          }}
        />
      </section>

      {manageMode && (
        <div
          className="simple-dash__modal-backdrop"
          onClick={closeManage}
          role="presentation"
        >
          <div
            className="simple-dash__modal"
            role="dialog"
            aria-modal="true"
            aria-label={manageTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="simple-dash__modal-header">
              <h2 className="simple-dash__modal-title">{manageTitle}</h2>
              <button
                type="button"
                className="simple-dash__modal-close"
                onClick={closeManage}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="simple-dash__modal-body">
              {manageMode === 'asset' && (
                <AssetForm
                  assets={assets}
                  onAssetsChange={() => {
                    onAssetsChange?.()
                    persistManualLedger().catch(() => {})
                    closeManage()
                  }}
                  onAssetAdded={() => {
                    onAssetAdded?.()
                    persistManualLedger().catch(() => {})
                    closeManage()
                  }}
                  hideList
                />
              )}
              {manageMode === 'trade' && (
                <TradeForm
                  assets={assets}
                  onTradesChange={() => {
                    onTradesChange?.()
                    onAssetsChange?.()
                    persistManualLedger().catch(() => {})
                    closeManage()
                  }}
                />
              )}
              {manageMode === 'dividend' && (
                <DividendForm
                  assets={assets}
                  initialEvent={editingEvent}
                  onSaved={handleDividendSaved}
                  onCancel={closeManage}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {dayDetail && !manageMode && (
        <div
          className="simple-dash__modal-backdrop"
          onClick={() => setDayDetail(null)}
          role="presentation"
        >
          <div
            className="simple-dash__modal simple-dash__modal--detail"
            role="dialog"
            aria-modal="true"
            aria-label="일자 배당 상세"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="simple-dash__modal-header">
              <h2 className="simple-dash__modal-title">
                {formatDayTitle(dayDetail.dateKey)}
              </h2>
              <button
                type="button"
                className="simple-dash__modal-close"
                onClick={() => setDayDetail(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="simple-dash__modal-body">
              <ul className="simple-dash__day-list">
                {dayDetail.events.map((event) => (
                  <li key={event.id} className="simple-dash__day-item">
                    <div>
                      <p className="simple-dash__day-name">
                        {event.fundName || event.symbol || '—'}
                      </p>
                      <p className="simple-dash__day-amount">
                        {formatCurrency(getDividendEventAmount(event))}
                      </p>
                      <p className="simple-dash__day-status">
                        {getDividendStatusLabel(event.status)}
                      </p>
                      <p className="simple-dash__day-source">
                        {isKiwoomEvent(event)
                          ? '키움 거래내역에서 자동 확인'
                          : '직접 입력'}
                      </p>
                    </div>
                    {!isKiwoomEvent(event) && (
                      <div className="simple-dash__detail-actions">
                        <button
                          type="button"
                          className="simple-dash__manage-btn"
                          onClick={() => openManage('dividend', event)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="simple-dash__manage-btn simple-dash__manage-btn--danger"
                          onClick={() => handleDeleteDividend(event)}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="simple-dash__day-total">
                합계{' '}
                <strong>
                  {formatCurrency(
                    dayDetail.events.reduce(
                      (sum, event) => sum + getDividendEventAmount(event),
                      0,
                    ),
                  )}
                </strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {detailEvent && !manageMode && !dayDetail && (
        <div
          className="simple-dash__modal-backdrop"
          onClick={() => setDetailEvent(null)}
          role="presentation"
        >
          <div
            className="simple-dash__modal simple-dash__modal--detail"
            role="dialog"
            aria-modal="true"
            aria-label="배당 상세"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="simple-dash__modal-header">
              <h2 className="simple-dash__modal-title">배당 상세</h2>
              <button
                type="button"
                className="simple-dash__modal-close"
                onClick={() => setDetailEvent(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="simple-dash__modal-body">
              <dl className="simple-dash__detail-list">
                <div>
                  <dt>종목명</dt>
                  <dd>{detailEvent.fundName || detailEvent.symbol}</dd>
                </div>
                <div>
                  <dt>지급일</dt>
                  <dd>{detailEvent.paymentDate}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{getDividendStatusLabel(detailEvent.status)}</dd>
                </div>
                <div>
                  <dt>표시 금액</dt>
                  <dd>{formatCurrency(getDividendEventAmount(detailEvent))}</dd>
                </div>
              </dl>
              <p className="simple-dash__day-source">
                {isKiwoomEvent(detailEvent)
                  ? '키움 거래내역에서 자동 확인'
                  : '직접 입력'}
              </p>
              {!isKiwoomEvent(detailEvent) && (
                <div className="simple-dash__detail-actions">
                  <button
                    type="button"
                    className="simple-dash__manage-btn"
                    onClick={() => openManage('dividend', detailEvent)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="simple-dash__manage-btn simple-dash__manage-btn--danger"
                    onClick={() => handleDeleteDividend(detailEvent)}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
