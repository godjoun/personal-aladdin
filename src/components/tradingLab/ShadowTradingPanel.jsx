import { useState } from 'react'
import ShadowTradeComposer from './ShadowTradeComposer.jsx'
import {
  createShadowTrade,
  patchShadowTrade,
} from '../../services/tradingLabApi.js'
import {
  NO_DATA_LABEL,
  SHADOW_QUICK_HINT,
  SHADOW_QUICK_SECTION_HINT,
  SHADOW_QUICK_TAGS,
  SHADOW_TRADE_DISCLAIMER,
  formatShadowHorizon,
  formatShadowPrice,
  formatShadowResultShare,
  formatShadowReturnPct,
  getShadowResultLabel,
  getShadowTagLabel,
  splitShadowTrades,
} from '../../utils/tradingLabView.js'

function readMarketPrice(market) {
  return (
    market?.metrics?.price?.value
    ?? market?.ticker?.lastPrice
    ?? market?.ticker?.markPrice
    ?? null
  )
}

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
  const [quickTags, setQuickTags] = useState([])
  const [savingDirection, setSavingDirection] = useState(null)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(null)
  const [editNote, setEditNote] = useState('')
  const [editTags, setEditTags] = useState([])
  const [editSaving, setEditSaving] = useState(false)

  const autoOn = Boolean(settings?.autoRecord)
  const { open, closed } = splitShadowTrades(trades)
  const entryPrice = readMarketPrice(market)
  const warnings = [
    ...(stats?.warnings || []),
    ...open.flatMap((trade) => trade.warnings || []),
  ].filter((item, index, list) => list.indexOf(item) === index)

  function toggleQuickTag(tag) {
    setQuickTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    )
  }

  async function handleQuickRecord(direction) {
    if (savingDirection) return
    setSavingDirection(direction)
    setMessage('')
    try {
      const payload = await createShadowTrade({
        symbol,
        direction,
        entryPrice,
        userTags: quickTags,
        userNote: null,
        quick: true,
      })
      setMessage(`가상 ${direction} 기록 완료`)
      onRefresh()
      return payload
    } catch (saveError) {
      setMessage(saveError.message || '가상 기록을 저장하지 못했습니다.')
    } finally {
      setSavingDirection(null)
    }
  }

  function startEdit(trade, mode) {
    setEditing({ id: trade.id, mode })
    setEditNote(trade.userNote || '')
    setEditTags(Array.isArray(trade.userTags) ? [...trade.userTags] : [])
  }

  async function saveEdit(trade) {
    setEditSaving(true)
    try {
      if (editing?.mode === 'note') {
        await patchShadowTrade(trade.id, { userNote: editNote })
      } else {
        await patchShadowTrade(trade.id, { userTags: editTags })
      }
      setEditing(null)
      onRefresh()
    } catch (saveError) {
      setMessage(saveError.message || '기록을 수정하지 못했습니다.')
    } finally {
      setEditSaving(false)
    }
  }

  function renderCard(trade, showOutcome) {
    const isEditing = editing?.id === trade.id
    return (
      <li key={trade.id} className="trading-lab__shadow-card">
        <p className="trading-lab__shadow-card-title">
          {trade.symbol} {trade.direction}
        </p>
        <p>Entry {formatShadowPrice(trade.entryPrice)}</p>
        {showOutcome ? (
          <>
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
          </>
        ) : (
          <>
            <p>현재 변화 {formatShadowReturnPct(trade.currentReturnPct)}</p>
            <p>
              {formatShadowHorizon(trade.outcome, '1h')} /{' '}
              {formatShadowHorizon(trade.outcome, '4h')} /{' '}
              {formatShadowHorizon(trade.outcome, '12h')} /{' '}
              {formatShadowHorizon(trade.outcome, '24h')}
            </p>
          </>
        )}
        {Array.isArray(trade.userTags) && trade.userTags.length > 0 ? (
          <p>{trade.userTags.map((tag) => getShadowTagLabel(tag)).join(', ')}</p>
        ) : null}
        {trade.userNote ? <p>{trade.userNote}</p> : null}

        <div className="trading-lab__shadow-card-actions">
          <button
            type="button"
            className="trading-lab__action"
            onClick={() => startEdit(trade, 'note')}
          >
            메모 추가
          </button>
          <button
            type="button"
            className="trading-lab__action"
            onClick={() => startEdit(trade, 'tags')}
          >
            태그 수정
          </button>
        </div>

        {isEditing && editing.mode === 'note' ? (
          <div className="trading-lab__shadow-edit">
            <textarea
              rows={3}
              value={editNote}
              onChange={(event) => setEditNote(event.target.value)}
              placeholder="관찰 메모"
            />
            <div className="trading-lab__shadow-card-actions">
              <button
                type="button"
                className="trading-lab__action"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="trading-lab__action trading-lab__action--primary"
                disabled={editSaving}
                onClick={() => saveEdit(trade)}
              >
                메모 저장
              </button>
            </div>
          </div>
        ) : null}

        {isEditing && editing.mode === 'tags' ? (
          <div className="trading-lab__shadow-edit">
            <div className="trading-lab__shadow-chips">
              {SHADOW_QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`trading-lab__shadow-chip${
                    editTags.includes(tag) ? ' is-active' : ''
                  }`}
                  onClick={() =>
                    setEditTags((current) =>
                      current.includes(tag)
                        ? current.filter((item) => item !== tag)
                        : [...current, tag],
                    )
                  }
                >
                  {getShadowTagLabel(tag)}
                </button>
              ))}
            </div>
            <div className="trading-lab__shadow-card-actions">
              <button
                type="button"
                className="trading-lab__action"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="trading-lab__action trading-lab__action--primary"
                disabled={editSaving}
                onClick={() => saveEdit(trade)}
              >
                태그 저장
              </button>
            </div>
          </div>
        ) : null}
      </li>
    )
  }

  return (
    <section className="trading-lab__section" aria-label="Shadow Trading">
      <header className="trading-lab__section-head">
        <h2 className="trading-lab__section-title">Shadow Trading</h2>
        <span className={`trading-lab__badge${autoOn ? ' trading-lab__badge--ok' : ''}`}>
          자동 기록 {autoOn ? 'ON' : 'OFF'}
        </span>
      </header>

      <p className="trading-lab__notice">{SHADOW_QUICK_SECTION_HINT}</p>
      <p className="trading-lab__notice">{SHADOW_TRADE_DISCLAIMER}</p>

      <div className="trading-lab__shadow-quick">
        <button
          type="button"
          className="trading-lab__shadow-quick-btn trading-lab__shadow-quick-btn--long"
          disabled={Boolean(savingDirection)}
          onClick={() => handleQuickRecord('LONG')}
        >
          {savingDirection === 'LONG' ? '저장 중' : '가상 LONG 1초 기록'}
        </button>
        <button
          type="button"
          className="trading-lab__shadow-quick-btn trading-lab__shadow-quick-btn--short"
          disabled={Boolean(savingDirection)}
          onClick={() => handleQuickRecord('SHORT')}
        >
          {savingDirection === 'SHORT' ? '저장 중' : '가상 SHORT 1초 기록'}
        </button>
      </div>
      <p className="trading-lab-drawer__hint">{SHADOW_QUICK_HINT}</p>

      <div className="trading-lab__shadow-chips" aria-label="빠른 태그">
        {SHADOW_QUICK_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`trading-lab__shadow-chip${
              quickTags.includes(tag) ? ' is-active' : ''
            }`}
            onClick={() => toggleQuickTag(tag)}
          >
            {getShadowTagLabel(tag)}
          </button>
        ))}
      </div>

      {message ? <p className="trading-lab__shadow-toast">{message}</p> : null}

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
          className="trading-lab__action"
          onClick={() => setComposer('LONG')}
        >
          상세 LONG 기록
        </button>
        <button
          type="button"
          className="trading-lab__action"
          onClick={() => setComposer('SHORT')}
        >
          상세 SHORT 기록
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

      {stats?.resultsByTag && Object.keys(stats.resultsByTag).length > 0 ? (
        <div>
          <h3 className="trading-lab__reason-title">태그별 결과</h3>
          <ul className="trading-lab__shadow-state-results">
            {Object.entries(stats.resultsByTag).map(([tag, counts]) => (
              <li key={tag}>
                {getShadowTagLabel(tag)}: WIN {counts.WIN} · LOSS {counts.LOSS} · NEUTRAL{' '}
                {counts.NEUTRAL}
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
            {open.map((trade) => renderCard(trade, false))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="trading-lab__reason-title">완료</h3>
        {closed.length === 0 ? (
          <p className="trading-lab__reason-empty">완료된 가상 결과 없음</p>
        ) : (
          <ul className="trading-lab__shadow-list">
            {closed.map((trade) => renderCard(trade, true))}
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
