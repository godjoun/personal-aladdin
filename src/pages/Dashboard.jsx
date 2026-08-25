/**
 * Dashboard.jsx — 단일 개인 투자 대시보드
 */

import { useEffect, useState } from 'react'
import AssetForm from '../components/AssetForm.jsx'
import TradeForm from '../components/TradeForm.jsx'
import HoldingsTable from '../components/dashboard/HoldingsTable.jsx'
import DividendCalendar from './DividendCalendar.jsx'
import { removeAssetWithTrades } from '../services/tradeService.js'
import { getDividendEvents } from '../services/dividendStorage.js'
import {
  buildAssetRows,
  calculatePortfolioSummary,
} from '../utils/portfolioRows.js'
import {
  calculateMonthlyDividendSummary,
  calculateYearPaidDividend,
  getDividendEventAmount,
  getDividendStatusLabel,
  getNextDividendEvent,
} from '../utils/dividendCalculator.js'
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

const REFRESH_LABELS = {
  [REFRESH_STATUS.IDLE]: '시세 갱신',
  [REFRESH_STATUS.LOADING]: '갱신 중…',
  [REFRESH_STATUS.SUCCESS]: '갱신 완료',
  [REFRESH_STATUS.ERROR]: '갱신 실패',
}

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

function Dashboard({
  prices = [],
  assets = [],
  onRefreshPrices,
  lastUpdatedAt = null,
  onAssetsChange,
  onAssetAdded,
  onTradesChange,
  onTradeRecorded,
}) {
  const [refreshStatus, setRefreshStatus] = useState(REFRESH_STATUS.IDLE)
  const [managePanel, setManagePanel] = useState(null)

  useEffect(() => {
    if (
      refreshStatus === REFRESH_STATUS.SUCCESS ||
      refreshStatus === REFRESH_STATUS.ERROR
    ) {
      const timer = setTimeout(() => setRefreshStatus(REFRESH_STATUS.IDLE), 3000)
      return () => clearTimeout(timer)
    }
  }, [refreshStatus])

  async function handleRefreshPrices() {
    if (refreshStatus === REFRESH_STATUS.LOADING) return

    setRefreshStatus(REFRESH_STATUS.LOADING)
    try {
      await onRefreshPrices()
      setRefreshStatus(REFRESH_STATUS.SUCCESS)
    } catch (error) {
      console.error('[Dashboard] 시세 갱신 실패:', error)
      setRefreshStatus(REFRESH_STATUS.ERROR)
    }
  }

  function handleDeleteAsset(id) {
    removeAssetWithTrades(id)
    onAssetsChange?.()
    onTradesChange?.()
  }

  function toggleManagePanel(panel) {
    setManagePanel((current) => (current === panel ? null : panel))
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const assetRows = buildAssetRows(assets, prices)
  const summary = calculatePortfolioSummary(assetRows)

  const totalHoldingValue = summary.totalHoldingValue
  const totalInvested = summary.totalInvested
  const totalProfitLoss = totalHoldingValue - totalInvested
  const totalReturnRate =
    totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : null

  const dividendEvents = getDividendEvents()
  const monthlyDividend = calculateMonthlyDividendSummary(
    dividendEvents,
    year,
    month,
  )
  const thisMonthDividend =
    monthlyDividend.estimated + monthlyDividend.confirmed + monthlyDividend.paid
  const yearPaidDividend = calculateYearPaidDividend(dividendEvents, year)
  const nextDividend = getNextDividendEvent(dividendEvents, now)

  return (
    <div className="simple-dash" aria-label="내 투자 대시보드">
      <header className="simple-dash__header">
        <div className="simple-dash__brand">
          <h1 className="simple-dash__title">ALADDIN</h1>
          <p className="simple-dash__subtitle">내 투자 대시보드</p>
        </div>
        <div className="simple-dash__header-actions">
          <p className="simple-dash__updated">
            마지막 업데이트
            <span>{formatUpdatedAt(lastUpdatedAt)}</span>
          </p>
          <button
            type="button"
            className={`simple-dash__refresh simple-dash__refresh--${refreshStatus}`}
            onClick={handleRefreshPrices}
            disabled={refreshStatus === REFRESH_STATUS.LOADING}
          >
            {REFRESH_LABELS[refreshStatus]}
          </button>
        </div>
      </header>

      <section className="simple-dash__metrics" aria-label="요약">
        <article className="simple-dash__metric">
          <p className="simple-dash__metric-label">총 평가자산</p>
          <p className="simple-dash__metric-value">
            {formatCurrency(totalHoldingValue)}
          </p>
        </article>
        <article className="simple-dash__metric">
          <p className="simple-dash__metric-label">총 투자원금</p>
          <p className="simple-dash__metric-value">
            {formatCurrency(totalInvested)}
          </p>
        </article>
        <article className="simple-dash__metric">
          <p className="simple-dash__metric-label">총 평가손익</p>
          <p
            className={`simple-dash__metric-value ${getPnlClass(totalProfitLoss)}`}
          >
            {formatProfitLoss(totalProfitLoss)}
          </p>
        </article>
        <article className="simple-dash__metric">
          <p className="simple-dash__metric-label">총 수익률</p>
          <p
            className={`simple-dash__metric-value ${getPnlClass(totalReturnRate)}`}
          >
            {formatPercent(totalReturnRate)}
          </p>
        </article>
        <article className="simple-dash__metric">
          <p className="simple-dash__metric-label">이번 달 배당</p>
          <p className="simple-dash__metric-value">
            {formatCurrency(thisMonthDividend)}
          </p>
        </article>
        <article className="simple-dash__metric">
          <p className="simple-dash__metric-label">올해 누적 배당</p>
          <p className="simple-dash__metric-value">
            {formatCurrency(yearPaidDividend)}
          </p>
        </article>
      </section>

      <section className="simple-dash__mid" aria-label="보유 종목과 다음 배당">
        <div className="simple-dash__card simple-dash__holdings">
          {assets.length === 0 ? (
            <div className="simple-dash__empty">
              <p>등록된 보유 종목이 없습니다.</p>
              <p className="simple-dash__empty-hint">
                아래 관리 영역에서 자산을 추가해 주세요.
              </p>
            </div>
          ) : (
            <HoldingsTable
              assetRows={assetRows}
              onDeleteAsset={handleDeleteAsset}
            />
          )}
        </div>

        <aside className="simple-dash__card simple-dash__next-dividend">
          <h2 className="simple-dash__section-title">다음 배당</h2>
          {nextDividend ? (
            <div className="simple-dash__next-body">
              <p className="simple-dash__next-name">
                {nextDividend.fundName || nextDividend.symbol || '—'}
              </p>
              <dl className="simple-dash__next-meta">
                <div>
                  <dt>지급 예정일</dt>
                  <dd>{nextDividend.paymentDate || '—'}</dd>
                </div>
                <div>
                  <dt>예상/확정 금액</dt>
                  <dd>{formatCurrency(getDividendEventAmount(nextDividend))}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{getDividendStatusLabel(nextDividend.status)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="simple-dash__empty-hint">예정된 배당이 없습니다.</p>
          )}
        </aside>
      </section>

      <section className="simple-dash__card simple-dash__calendar" aria-label="배당 달력">
        <DividendCalendar embedded />
      </section>

      <section className="simple-dash__card simple-dash__manage" aria-label="관리">
        <h2 className="simple-dash__section-title">관리</h2>
        <div className="simple-dash__manage-actions">
          <button
            type="button"
            className={`simple-dash__manage-btn${
              managePanel === 'asset' ? ' simple-dash__manage-btn--active' : ''
            }`}
            onClick={() => toggleManagePanel('asset')}
            aria-expanded={managePanel === 'asset'}
          >
            + 자산 추가
          </button>
          <button
            type="button"
            className={`simple-dash__manage-btn${
              managePanel === 'trade' ? ' simple-dash__manage-btn--active' : ''
            }`}
            onClick={() => toggleManagePanel('trade')}
            aria-expanded={managePanel === 'trade'}
            disabled={assets.length === 0}
          >
            + 거래 기록
          </button>
        </div>

        {managePanel === 'asset' && (
          <div className="simple-dash__manage-panel">
            <AssetForm
              assets={assets}
              onAssetsChange={onAssetsChange}
              onAssetAdded={onAssetAdded}
              hideList
            />
          </div>
        )}

        {managePanel === 'trade' && (
          <div className="simple-dash__manage-panel">
            <TradeForm
              assets={assets}
              onTradesChange={() => {
                onTradesChange?.()
                onAssetsChange?.()
              }}
              onTradeRecorded={onTradeRecorded}
            />
          </div>
        )}
      </section>
    </div>
  )
}

export default Dashboard
