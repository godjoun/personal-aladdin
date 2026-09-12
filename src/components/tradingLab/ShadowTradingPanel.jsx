import { useState } from 'react'
import ShadowTradeComposer from './ShadowTradeComposer.jsx'
import {
  NO_DATA_LABEL,
  SHADOW_TRADE_DISCLAIMER,
  formatShadowHorizon,
  formatShadowPrice,
  formatShadowResultShare,
  formatShadowReturnPct,
  getShadowResultLabel,
  getShadowTagLabel,
  splitShadowTrades,
} from '../../utils/tradingLabView.js'

/**
 * Shadow Trading — 가상 기록과 관찰. 실제 주문/추천이 아니다.
 */
export default function ShadowTradingPanel({
  symbol,
  market,
  trades,
  stats,
  settings,
  candidates,
  loading,
  onToggleAuto,
  onRefresh,
}) {
  const [composer, setComposer] = useState(null)
  const autoOn = Boolean(settings?.autoRecord)
  const { open, closed } = splitShadowTrades(trades)
  const entryPrice = market?.metrics?.price?.value ?? market?.ticker?.lastPrice ?? null
  const warnings = [
    ...(stats?.warnings || []),
    ...open.flatMap((trade) => trade.warnings || []),
  ].filter((item, index, list) => list.indexOf(item) === index)

  return (
    <section className="trading-lab__section" aria-label="Shadow Trading">
      <header className="trading-lab__section-head">
        <h2 className="trading-lab__section-title">Shadow Trading</h2>
        <span className={`trading-lab__badge${autoOn ? ' trading-lab__badge--ok' : ''}`}>
          자동 기록 {autoOn ? 'ON' : 'OFF'}
        </span>
      </header>

      <p className="trading-lab__notice">{SHADOW_TRADE_DISCLAIMER}</p>

      <div className="trading-lab__shadow-toolbar">
        <button
          type="button"
          className="trading-lab__action"
          onClick={() => onToggleAuto(!autoOn)}
        >
          Shadow Trading 자동 기록: {autoOn ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          className="trading-lab__action trading-lab__action--primary"
          onClick={() => setComposer('LONG')}
        >
          가상 LONG 기록
        </button>
        <button
          type="button"
          className="trading-lab__action"
          onClick={() => setComposer('SHORT')}
        >
          가상 SHORT 기록
        </button>
      </div>

      {warnings.length > 0 ? (
        <ul className="trading-lab__shadow-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {stats ? (
        <dl className="trading-lab__data-grid" aria-label="Shadow Trading 통계">
          <div className="trading-lab__data-item">
            <dt>총 shadow trade</dt>
            <dd>{stats.total}</dd>
          </div>
          <div className="trading-lab__data-item">
            <dt>OPEN / CLOSED</dt>
            <dd>
              {stats.open} / {stats.closed}
            </dd>
          </div>
          <div className="trading-lab__data-item">
            <dt>LONG / SHORT</dt>
            <dd>
              {stats.long} / {stats.short}
            </dd>
          </div>
          <div className="trading-lab__data-item">
            <dt>평균 MFE</dt>
            <dd>{formatShadowReturnPct(stats.averageMfe, NO_DATA_LABEL)}</dd>
          </div>
          <div className="trading-lab__data-item">
            <dt>평균 MAE</dt>
            <dd>{formatShadowReturnPct(stats.averageMae, NO_DATA_LABEL)}</dd>
          </div>
          <div className="trading-lab__data-item">
            <dt>완료 결과 비율</dt>
            <dd className="trading-lab__data-hint">{formatShadowResultShare(stats)}</dd>
          </div>
        </dl>
      ) : null}

      {stats?.resultsByState && Object.keys(stats.resultsByState).length > 0 ? (
        <div>
          <h3 className="trading-lab__reason-title">상태별 결과</h3>
          <ul className="trading-lab__shadow-state-results">
            {Object.entries(stats.resultsByState).map(([state, counts]) => (
              <li key={state}>
                {state}: WIN {counts.WIN} · LOSS {counts.LOSS} · NEUTRAL {counts.NEUTRAL}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="trading-lab__reason-title">진행 중</h3>
        {loading ? (
          <p className="trading-lab__reason-empty">불러오는 중</p>
        ) : open.length === 0 ? (
          <p className="trading-lab__reason-empty">진행 중인 가상 기록 없음</p>
        ) : (
          <ul className="trading-lab__shadow-list">
            {open.map((trade) => (
              <li key={trade.id} className="trading-lab__shadow-card">
                <p className="trading-lab__shadow-card-title">
                  {trade.symbol} {trade.direction}
                </p>
                <p>Entry {formatShadowPrice(trade.entryPrice)}</p>
                <p>현재 변화 {formatShadowReturnPct(trade.currentReturnPct)}</p>
                <p>
                  {formatShadowHorizon(trade.outcome, '1h')} /{' '}
                  {formatShadowHorizon(trade.outcome, '4h')} /{' '}
                  {formatShadowHorizon(trade.outcome, '12h')} /{' '}
                  {formatShadowHorizon(trade.outcome, '24h')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="trading-lab__reason-title">완료</h3>
        {closed.length === 0 ? (
          <p className="trading-lab__reason-empty">완료된 가상 결과 없음</p>
        ) : (
          <ul className="trading-lab__shadow-list">
            {closed.map((trade) => (
              <li key={trade.id} className="trading-lab__shadow-card">
                <p className="trading-lab__shadow-card-title">
                  {trade.symbol} {trade.direction}
                </p>
                <p>
                  {formatShadowHorizon(trade.outcome, '1h')} ·{' '}
                  {formatShadowHorizon(trade.outcome, '4h')}
                </p>
                <p>
                  MFE {formatShadowReturnPct(trade.outcome?.maxFavorableMovePct)} · MAE{' '}
                  {formatShadowReturnPct(trade.outcome?.maxAdverseMovePct)}
                </p>
                <p>
                  결과 {getShadowResultLabel(trade.outcome?.result)} · 비용 반영{' '}
                  {formatShadowReturnPct(trade.outcome?.feeAdjustedReturnPct)}
                </p>
                {Array.isArray(trade.userTags) && trade.userTags.length > 0 ? (
                  <p>
                    {trade.userTags.map((tag) => getShadowTagLabel(tag)).join(', ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {Array.isArray(candidates) && candidates.length > 0 ? (
        <div>
          <h3 className="trading-lab__reason-title">후보 관찰</h3>
          <ul className="trading-lab__reason-list">
            {candidates.map((item) => (
              <li key={item.id}>
                {item.symbol} {item.primaryState} · {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ShadowTradeComposer
        open={Boolean(composer)}
        symbol={symbol}
        direction={composer || 'LONG'}
        entryPrice={entryPrice}
        onClose={() => setComposer(null)}
        onSaved={() => {
          setComposer(null)
          onRefresh()
        }}
      />
    </section>
  )
}
