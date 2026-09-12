import React, { useState } from 'react'
import { patchShadowTrade } from '../../services/tradingLabApi.js'
import {
  NO_DATA_LABEL,
  SHADOW_AUTO_MODE_LABEL,
  SHADOW_QUICK_TAGS,
  SHADOW_REVIEW_HINT,
  SHADOW_REVIEW_TITLE,
  SHADOW_TRADE_DISCLAIMER,
  formatShadowDirectionLabel,
  formatShadowHorizon,
  formatShadowPrice,
  formatShadowResultShare,
  formatShadowReturnPct,
  getShadowResultLabel,
  getShadowRecordTypeLabel,
  getShadowTagLabel,
  splitShadowTrades,
  summarizeShadowReview,
  summarizeChartAnnotationReview,
  formatLinkedAnnotationLabels,
  CHART_ANNOTATION_EMPTY_STATS,
} from '../../utils/tradingLabView.js'

/**
 * 가상 기록 / 복기 — 이미 만든 가상 기록과 결과만 본다.
 * 새 진입 기록은 My Strategy v1 에서만 만든다.
 */
export default function ShadowTradingPanel({
  trades,
  stats,
  settings,
  candidates,
  loading,
  onToggleAuto,
  onRefresh,
}) {
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(null)
  const [editNote, setEditNote] = useState('')
  const [editTags, setEditTags] = useState([])
  const [editSaving, setEditSaving] = useState(false)

  const autoOn = Boolean(settings?.autoRecord)
  const { open, closed } = splitShadowTrades(trades)
  const review = summarizeShadowReview(trades, stats)
  const annotationReview = summarizeChartAnnotationReview(trades)
  const warnings = [
    ...(stats?.warnings || []),
    ...open.flatMap((trade) => trade.warnings || []),
  ].filter((item, index, list) => list.indexOf(item) === index)

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
          {trade.symbol} {formatShadowDirectionLabel(trade.direction)}
          {trade.recordType || trade.recordTypeLabel
            ? ` · ${trade.recordTypeLabel || getShadowRecordTypeLabel(trade.recordType)}`
            : ''}
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
        {formatLinkedAnnotationLabels(trade.linkedAnnotations).length > 0 ? (
          <p>
            연결된 차트 근거:{' '}
            {formatLinkedAnnotationLabels(trade.linkedAnnotations).join(' · ')}
          </p>
        ) : null}
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
    <section className="trading-lab__section" aria-label={SHADOW_REVIEW_TITLE}>
      <header className="trading-lab__section-head">
        <h2 className="trading-lab__section-title">{SHADOW_REVIEW_TITLE}</h2>
        <span className={`trading-lab__badge${autoOn ? ' trading-lab__badge--ok' : ''}`}>
          {SHADOW_AUTO_MODE_LABEL} {autoOn ? 'ON' : 'OFF'}
        </span>
      </header>

      <p className="trading-lab__notice">{SHADOW_REVIEW_HINT}</p>
      <p className="trading-lab__notice">{SHADOW_TRADE_DISCLAIMER}</p>

      <div className="trading-lab__review-summary" aria-label="오늘의 복기">
        <h3>오늘의 복기</h3>
        <p>
          복기할 기록 {review.reviewCount}개 · 기준 기록 {review.strategyCount}개 · 충동
          기록 {review.impulseCount}개
        </p>
        {review.fomoCount > 0 ? (
          <p>최근 FOMO 기록 {review.fomoCount}건 결과 확인 필요</p>
        ) : null}
        <div aria-label="차트 근거 복기">
          <h3>차트 근거</h3>
          {annotationReview.empty ? (
            <p>{CHART_ANNOTATION_EMPTY_STATS}</p>
          ) : (
            <>
              {annotationReview.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {annotationReview.outcomeLinkedCount > 0 ? (
                <p>결과 연결된 차트 근거 기록 {annotationReview.outcomeLinkedCount}건</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {message ? <p className="trading-lab__shadow-toast">{message}</p> : null}

      <div className="trading-lab__shadow-toolbar">
        <button
          type="button"
          className="trading-lab__action"
          onClick={() => onToggleAuto(!autoOn)}
        >
          {SHADOW_AUTO_MODE_LABEL}: {autoOn ? 'ON' : 'OFF'}
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
        <dl className="trading-lab__data-grid" aria-label="가상 기록 통계">
          <div className="trading-lab__data-item">
            <dt>총 가상 기록</dt>
            <dd>{stats.total}</dd>
          </div>
          <div className="trading-lab__data-item">
            <dt>기준 / 충동 / 관찰</dt>
            <dd>
              {review.strategyCount} / {review.impulseCount} / {review.observationCount}
            </dd>
          </div>
          <div className="trading-lab__data-item">
            <dt>OPEN / CLOSED</dt>
            <dd>
              {stats.open} / {stats.closed}
            </dd>
          </div>
          <div className="trading-lab__data-item">
            <dt>가상 LONG / 가상 SHORT</dt>
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
    </section>
  )
}
