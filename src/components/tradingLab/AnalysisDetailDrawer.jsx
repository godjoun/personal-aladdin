import { useCallback, useEffect, useState } from 'react'
import {
  deleteAnalysis,
  fetchAnalysisDetail,
  saveAnalysisOutcome,
} from '../../services/tradingLabApi.js'
import {
  NO_DATA_LABEL,
  formatAnalysisTimestamp,
  formatConfidence,
  formatPriceValue,
  formatSignedValue,
  getBiasLabel,
  getBiasModifier,
  getOutcomeLabel,
  getStructureLabel,
} from '../../utils/tradingLabView.js'

const SNAPSHOT_ROWS = [
  { id: 'volume', label: 'Volume' },
  { id: 'volumeZScore', label: 'Volume Z-Score', signed: true },
  { id: 'openInterest', label: 'Open Interest' },
  { id: 'openInterestChange', label: 'OI 변화', signed: true },
  { id: 'fundingRate', label: 'Funding', signed: true, digits: 4 },
  { id: 'cvd', label: 'CVD', signed: true },
  { id: 'liquidationAbove', label: '청산 추정 구간 (위)' },
  { id: 'liquidationBelow', label: '청산 추정 구간 (아래)' },
]

const RESULT_OPTIONS = [
  { id: 'UNRESOLVED', label: '미확정' },
  { id: 'SUCCESS', label: '성공' },
  { id: 'FAILURE', label: '실패' },
  { id: 'NEUTRAL', label: '중립' },
]

const OUTCOME_PRICE_FIELDS = [
  { id: 'price1h', label: '1시간 후' },
  { id: 'price4h', label: '4시간 후' },
  { id: 'price12h', label: '12시간 후' },
  { id: 'price24h', label: '24시간 후' },
]

const EMPTY_OUTCOME = {
  result: 'UNRESOLVED',
  price1h: '',
  price4h: '',
  price12h: '',
  price24h: '',
  maxFavorableMove: '',
  maxAdverseMove: '',
  notes: '',
}

/**
 * @param {string} value
 */
function toNumberOrNull(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

/**
 * @param {object | null} outcome
 */
function outcomeToForm(outcome) {
  if (!outcome) return EMPTY_OUTCOME
  return {
    result: outcome.result || 'UNRESOLVED',
    price1h: outcome.price1h ?? '',
    price4h: outcome.price4h ?? '',
    price12h: outcome.price12h ?? '',
    price24h: outcome.price24h ?? '',
    maxFavorableMove: outcome.maxFavorableMove ?? '',
    maxAdverseMove: outcome.maxAdverseMove ?? '',
    notes: outcome.notes ?? '',
  }
}

/**
 * 분석 상세 — 당시 시장 데이터 / 판단 / 근거 / 무효화 가격 / 향후 결과
 */
export default function AnalysisDetailDrawer({ analysisId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [outcomeForm, setOutcomeForm] = useState(EMPTY_OUTCOME)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!analysisId) return
    setLoading(true)
    setError('')
    try {
      const payload = await fetchAnalysisDetail(analysisId)
      setDetail(payload)
      setOutcomeForm(outcomeToForm(payload.outcome))
    } catch (loadError) {
      setError(loadError.message || '분석을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [analysisId])

  useEffect(() => {
    load()
  }, [load])

  if (!analysisId) return null

  const analysis = detail?.analysis || null

  function updateOutcome(key, value) {
    setOutcomeForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleOutcomeSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await saveAnalysisOutcome(analysisId, {
        result: outcomeForm.result,
        evaluatedAt: new Date().toISOString(),
        price1h: toNumberOrNull(outcomeForm.price1h),
        price4h: toNumberOrNull(outcomeForm.price4h),
        price12h: toNumberOrNull(outcomeForm.price12h),
        price24h: toNumberOrNull(outcomeForm.price24h),
        maxFavorableMove: toNumberOrNull(outcomeForm.maxFavorableMove),
        maxAdverseMove: toNumberOrNull(outcomeForm.maxAdverseMove),
        notes: outcomeForm.notes.trim() || null,
      })
      await load()
      onChanged?.()
    } catch (submitError) {
      setError(submitError.message || '결과를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteAnalysis(analysisId)
      onChanged?.()
      onClose()
    } catch (deleteError) {
      setError(deleteError.message || '삭제하지 못했습니다.')
      setSaving(false)
    }
  }

  return (
    <div className="trading-lab-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="trading-lab-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="분석 상세"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="trading-lab-drawer__header">
          <h2 className="trading-lab-drawer__title">분석 상세</h2>
          <button
            type="button"
            className="trading-lab-drawer__close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        <div className="trading-lab-drawer__form">
          {loading ? <p className="trading-lab__reason-empty">불러오는 중…</p> : null}
          {error ? <p className="trading-lab-drawer__error">{error}</p> : null}

          {analysis ? (
            <>
              <div className="trading-lab__verdict">
                <span className="trading-lab__analysis-symbol">
                  {analysis.symbol}
                </span>
                <span
                  className={`trading-lab__bias trading-lab__bias--${getBiasModifier(
                    analysis.bias,
                  )}`}
                >
                  {getBiasLabel(analysis.bias)}
                </span>
                <span className="trading-lab__confidence">
                  Confidence {formatConfidence(analysis.confidence)}
                </span>
              </div>

              <p className="trading-lab__analysis-date">
                {formatAnalysisTimestamp(analysis.createdAt)}
              </p>

              <dl className="trading-lab__data-grid">
                <div className="trading-lab__data-item">
                  <dt>기준 가격</dt>
                  <dd>{formatPriceValue(analysis.referencePrice)}</dd>
                </div>
                <div className="trading-lab__data-item">
                  <dt>Invalidation</dt>
                  <dd>{formatPriceValue(analysis.invalidationPrice)}</dd>
                </div>
                <div className="trading-lab__data-item">
                  <dt>15m</dt>
                  <dd>{getStructureLabel(analysis.timeframe15m)}</dd>
                </div>
                <div className="trading-lab__data-item">
                  <dt>1h</dt>
                  <dd>{getStructureLabel(analysis.timeframe1h)}</dd>
                </div>
                <div className="trading-lab__data-item">
                  <dt>4h</dt>
                  <dd>{getStructureLabel(analysis.timeframe4h)}</dd>
                </div>
              </dl>

              <div>
                <h3 className="trading-lab__reason-title">근거</h3>
                {analysis.reasoning?.length > 0 ? (
                  <ul className="trading-lab__reason-list">
                    {analysis.reasoning.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="trading-lab__reason-empty">{NO_DATA_LABEL}</p>
                )}
              </div>

              <div>
                <h3 className="trading-lab__reason-title">주의</h3>
                {analysis.cautions?.length > 0 ? (
                  <ul className="trading-lab__reason-list">
                    {analysis.cautions.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="trading-lab__reason-empty">{NO_DATA_LABEL}</p>
                )}
              </div>

              <div>
                <h3 className="trading-lab__reason-title">당시 시장 데이터</h3>
                <dl className="trading-lab__data-grid">
                  {SNAPSHOT_ROWS.map((row) => {
                    const value = analysis.marketSnapshot?.[row.id]
                    return (
                      <div key={row.id} className="trading-lab__data-item">
                        <dt>{row.label}</dt>
                        <dd>
                          {row.signed
                            ? formatSignedValue(value, { digits: row.digits ?? 2 })
                            : formatPriceValue(value)}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </div>

              {analysis.notes ? (
                <div>
                  <h3 className="trading-lab__reason-title">메모</h3>
                  <p className="trading-lab__note-text">{analysis.notes}</p>
                </div>
              ) : null}

              {detail.screenshots?.length > 0 ? (
                <div>
                  <h3 className="trading-lab__reason-title">차트 캡처 기록</h3>
                  <ul className="trading-lab__reason-list">
                    {detail.screenshots.map((shot) => (
                      <li key={shot.id}>
                        {shot.timeframe} · {formatAnalysisTimestamp(shot.capturedAt)}
                        {shot.note ? ` · ${shot.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <form
                className="trading-lab-drawer__outcome"
                onSubmit={handleOutcomeSubmit}
              >
                <h3 className="trading-lab__reason-title">
                  향후 결과 (현재 {getOutcomeLabel(detail.outcome?.result)})
                </h3>

                <label className="trading-lab-drawer__field">
                  <span>판정</span>
                  <select
                    value={outcomeForm.result}
                    onChange={(event) => updateOutcome('result', event.target.value)}
                  >
                    {RESULT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="trading-lab-drawer__row">
                  {OUTCOME_PRICE_FIELDS.map((field) => (
                    <label key={field.id} className="trading-lab-drawer__field">
                      <span>{field.label}</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={outcomeForm[field.id]}
                        onChange={(event) =>
                          updateOutcome(field.id, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>

                <div className="trading-lab-drawer__row">
                  <label className="trading-lab-drawer__field">
                    <span>최대 유리 움직임(%)</span>
                    <input
                      type="number"
                      step="any"
                      value={outcomeForm.maxFavorableMove}
                      onChange={(event) =>
                        updateOutcome('maxFavorableMove', event.target.value)
                      }
                    />
                  </label>
                  <label className="trading-lab-drawer__field">
                    <span>최대 불리 움직임(%)</span>
                    <input
                      type="number"
                      step="any"
                      value={outcomeForm.maxAdverseMove}
                      onChange={(event) =>
                        updateOutcome('maxAdverseMove', event.target.value)
                      }
                    />
                  </label>
                </div>

                <label className="trading-lab-drawer__field">
                  <span>복기 메모</span>
                  <textarea
                    rows={2}
                    value={outcomeForm.notes}
                    onChange={(event) => updateOutcome('notes', event.target.value)}
                  />
                </label>

                <div className="trading-lab-drawer__actions">
                  <button
                    type="button"
                    className="trading-lab__action trading-lab__action--danger"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    분석 삭제
                  </button>
                  <button
                    type="submit"
                    className="trading-lab__action trading-lab__action--primary"
                    disabled={saving}
                  >
                    {saving ? '저장 중…' : '결과 저장'}
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
