/**
 * StockBriefingDrawer.jsx — 종목 브리핑 (drawer/modal)
 */

import { useEffect, useMemo, useState } from 'react'
import { fetchStockBriefing, peekBriefingCache } from '../../services/stockBriefingApi.js'
import {
  formatCurrency,
  formatEokWon,
  formatPercent,
  formatProfitLoss,
  getPnlClass,
} from '../../utils/formatters.js'

function Metric({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="briefing__metric">
      <span className="briefing__metric-label">{label}</span>
      <span className="briefing__metric-value">{value}</span>
    </div>
  )
}

function formatNum(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return null
  return new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: digits,
  }).format(Number(value))
}

function StockBriefingDrawer({
  open,
  symbol,
  stockName,
  holdings = [],
  onClose,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [briefing, setBriefing] = useState(null)

  const holdingsPayload = useMemo(
    () =>
      (holdings || []).map((row) => ({
        accountType: row.accountType,
        quantity: row.quantity,
        averageBuyPrice: row.averageBuyPrice,
        latestPrice: row.latestPrice,
        holdingValue: row.holdingValue,
        profitLoss: row.profitLoss,
        profitRate: row.profitRate,
      })),
    [holdings],
  )

  useEffect(() => {
    if (!open || !symbol) return undefined

    let cancelled = false
    setError('')

    const cached = peekBriefingCache(symbol)
    if (cached?.payload) {
      setBriefing(cached.payload)
      setLoading(false)
    } else {
      setBriefing(null)
      setLoading(true)
    }

    fetchStockBriefing(symbol, {
      name: stockName,
      holdings: holdingsPayload,
      forceRefresh: Boolean(cached && !cached.fresh),
    })
      .then((payload) => {
        if (!cancelled) setBriefing(payload)
      })
      .catch(() => {
        if (!cancelled && !cached?.payload) {
          setError('종목 브리핑을 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, symbol, stockName, holdingsPayload])

  useEffect(() => {
    if (!open) return undefined
    function onKey(event) {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const info = briefing?.info?.data
  const isEtf = Boolean(info?.isEtf)

  return (
    <div
      className="simple-dash__modal-backdrop briefing-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="simple-dash__modal briefing-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="종목 브리핑"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="simple-dash__modal-header">
          <h2 className="simple-dash__modal-title">종목 브리핑</h2>
          <button
            type="button"
            className="simple-dash__modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="simple-dash__modal-body briefing-body">
          <header className="briefing__hero">
            <p className="briefing__name">{stockName || info?.name || symbol}</p>
            <p className="briefing__symbol">{symbol}</p>
          </header>

          {loading && <p className="briefing__muted">불러오는 중…</p>}
          {error && <p className="briefing__error">{error}</p>}

          {!loading && (
            <>
              <section className="briefing__section" aria-label="내 보유">
                <h3>내 보유</h3>
                {(holdings || []).length === 0 ? (
                  <p className="briefing__muted">보유 정보 없음</p>
                ) : (
                  <ul className="briefing__holding-list">
                    {holdings.map((row) => (
                      <li key={`${row.accountType}-${row.id || row.symbol}`}>
                        <strong>
                          {row.accountLabel ||
                            (row.accountType === 'isa'
                              ? 'ISA'
                              : row.accountType === 'general'
                                ? '일반'
                                : '보유')}
                        </strong>
                        <span>수량 {row.quantity ?? '—'}</span>
                        <span>평단 {formatCurrency(row.averageBuyPrice)}</span>
                        <span>현재가 {formatCurrency(row.latestPrice)}</span>
                        <span className={getPnlClass(row.profitRate)}>
                          {row.profitRate != null
                            ? formatPercent(row.profitRate)
                            : '—'}
                        </span>
                        <span className={getPnlClass(row.profitLoss)}>
                          {row.profitLoss != null
                            ? formatProfitLoss(row.profitLoss)
                            : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="briefing__section" aria-label="주의 신호">
                <h3>주의 신호</h3>
                {(briefing?.signals || []).length === 0 ? (
                  <p className="briefing__muted">현재 확인된 주요 주의사항 없음</p>
                ) : (
                  <ul className="briefing__signals">
                    {(briefing?.signals || []).map((signal) => (
                      <li key={signal.id} className="briefing__signal">
                        <span className="briefing__signal-level">{signal.level}</span>
                        <div>
                          {signal.link ? (
                            <a
                              className="briefing__signal-title briefing__title-link"
                              href={signal.link}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {signal.title}
                            </a>
                          ) : (
                            <p className="briefing__signal-title">{signal.title}</p>
                          )}
                          {signal.evidence && (
                            <p className="briefing__signal-evidence">{signal.evidence}</p>
                          )}
                          {signal.detail && (
                            <p className="briefing__muted">{signal.detail}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="briefing__section" aria-label="기업/ETF 정보">
                <h3>{isEtf ? 'ETF 정보' : '기업 정보'}</h3>
                {!briefing?.info?.ok && (
                  <p className="briefing__muted">
                    {briefing?.info?.message || '종목정보를 가져오지 못했습니다.'}
                  </p>
                )}
                {briefing?.info?.ok && info && (
                  <div className="briefing__metrics">
                    <Metric label="현재가" value={formatCurrency(info.currentPrice)} />
                    <Metric
                      label="시가총액"
                      value={formatEokWon(info.marketCap)}
                    />
                    <Metric label="연중 최고" value={formatCurrency(info.yearHigh)} />
                    <Metric label="연중 최저" value={formatCurrency(info.yearLow)} />
                    <Metric label="250일 최고" value={formatCurrency(info.high250)} />
                    <Metric label="250일 최저" value={formatCurrency(info.low250)} />
                    <Metric
                      label="외인소진률"
                      value={
                        info.foreignExhaustionRate != null
                          ? `${formatNum(info.foreignExhaustionRate)}%`
                          : null
                      }
                    />
                    {!isEtf && (
                      <>
                        <Metric label="PER" value={formatNum(info.per)} />
                        <Metric label="PBR" value={formatNum(info.pbr)} />
                        <Metric
                          label="ROE"
                          value={
                            info.roe != null ? `${formatNum(info.roe)}%` : null
                          }
                        />
                        <Metric label="EPS" value={formatCurrency(info.eps)} />
                        <Metric label="BPS" value={formatCurrency(info.bps)} />
                        <Metric label="매출액" value={formatEokWon(info.revenue)} />
                        <Metric
                          label="영업이익"
                          value={formatEokWon(info.operatingProfit)}
                        />
                        <Metric
                          label="당기순이익"
                          value={formatEokWon(info.netIncome)}
                        />
                      </>
                    )}
                  </div>
                )}
              </section>

              <section className="briefing__section" aria-label="최근 공시">
                <h3>최근 공시</h3>
                {!briefing?.disclosures?.configured ? (
                  <p className="briefing__muted">
                    {briefing?.disclosures?.message ||
                      '공시 연동이 아직 설정되지 않았습니다.'}
                  </p>
                ) : (briefing?.disclosures?.items || []).length === 0 ? (
                  <p className="briefing__muted">
                    {briefing?.disclosures?.message ||
                      '최근 90일 내 공시가 없습니다.'}
                  </p>
                ) : (
                  <ul className="briefing__disclosure-list">
                    {(briefing.disclosures.items || []).slice(0, 10).map((item) => {
                      const dateLabel = (() => {
                        const raw = String(item.submittedAt || '').trim()
                        if (/^\d{8}$/.test(raw)) {
                          return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
                        }
                        return raw || '—'
                      })()
                      return (
                        <li
                          key={`${item.title}-${item.submittedAt}`}
                          className="briefing__disclosure"
                        >
                          <div className="briefing__disclosure-title-row">
                            {item.important && (
                              <span className="briefing__badge">확인 필요</span>
                            )}
                            {item.link ? (
                              <a
                                className="briefing__title-link"
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {item.title}
                              </a>
                            ) : (
                              <span>{item.title}</span>
                            )}
                          </div>
                          <p className="briefing__disclosure-date">{dateLabel}</p>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="briefing__section" aria-label="최근 뉴스">
                <h3>최근 뉴스</h3>
                {!briefing?.news?.configured ? (
                  <p className="briefing__muted">
                    {briefing?.news?.message ||
                      '뉴스 연동이 아직 설정되지 않았습니다.'}
                  </p>
                ) : (briefing?.news?.items || []).length === 0 ? (
                  <p className="briefing__muted">표시할 뉴스가 없습니다.</p>
                ) : (
                  <ul className="briefing__list">
                    {(briefing.news.items || []).map((item) => (
                      <li key={`${item.title}-${item.publishedAt}`}>
                        {item.attention && (
                          <span className="briefing__badge">
                            {item.attention.level} · {item.attention.matched}
                          </span>
                        )}
                        {item.link ? (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <span>{item.title}</span>
                        )}
                        <span className="briefing__muted">
                          {item.publishedAt || ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default StockBriefingDrawer
