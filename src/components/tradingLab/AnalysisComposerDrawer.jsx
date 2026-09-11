import { useEffect, useState } from 'react'
import { createAnalysis } from '../../services/tradingLabApi.js'

const BIAS_OPTIONS = [
  { id: 'LONG', label: 'LONG BIAS' },
  { id: 'SHORT', label: 'SHORT BIAS' },
  { id: 'NEUTRAL', label: 'NEUTRAL' },
]

const STRUCTURE_OPTIONS = [
  { id: '', label: '미입력' },
  { id: 'BULLISH', label: '상승 구조' },
  { id: 'BEARISH', label: '하락 구조' },
  { id: 'RANGE', label: '횡보' },
  { id: 'UNKNOWN', label: '확인 필요' },
]

const MARKET_FIELDS = [
  { id: 'volume', label: 'Volume' },
  { id: 'volumeZScore', label: 'Volume Z-Score' },
  { id: 'openInterest', label: 'Open Interest' },
  { id: 'openInterestChange', label: 'OI 변화(%)' },
  { id: 'fundingRate', label: 'Funding Rate' },
  { id: 'cvd', label: 'CVD' },
  { id: 'liquidationAbove', label: '청산 추정 구간 (위)' },
  { id: 'liquidationBelow', label: '청산 추정 구간 (아래)' },
]

const EMPTY_FORM = {
  bias: 'NEUTRAL',
  confidence: '',
  referencePrice: '',
  timeframe15m: '',
  timeframe1h: '',
  timeframe4h: '',
  reasoning: '',
  cautions: '',
  invalidationPrice: '',
  notes: '',
}

const EMPTY_MARKET = Object.fromEntries(MARKET_FIELDS.map((f) => [f.id, '']))

/**
 * 빈 문자열은 null 로 보낸다 (시장 지표는 없을 수 있음)
 *
 * @param {string} value
 */
function toNumberOrNull(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

/**
 * @param {string} value
 */
function toLines(value) {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
}

/**
 * 분석 기록 side panel.
 * 시장 데이터 provider 가 없으므로 지표는 직접 입력할 수 있게 열어둔다.
 */
export default function AnalysisComposerDrawer({ open, symbol, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [market, setMarket] = useState(EMPTY_MARKET)
  const [showMarket, setShowMarket] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY_FORM)
    setMarket(EMPTY_MARKET)
    setShowMarket(false)
    setError('')
    setSaving(false)
  }, [open])

  if (!open) return null

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateMarket(key, value) {
    setMarket((prev) => ({ ...prev, [key]: value }))
  }

  function validate() {
    if (!BIAS_OPTIONS.some((option) => option.id === form.bias)) {
      return '판단(bias)을 선택해 주세요.'
    }
    if (form.confidence !== '') {
      const num = Number(form.confidence)
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        return 'Confidence는 0~100 사이 숫자로 입력해 주세요.'
      }
    }
    for (const key of ['referencePrice', 'invalidationPrice']) {
      if (form[key] !== '' && !(Number(form[key]) >= 0)) {
        return '가격은 0 이상 숫자로 입력해 주세요.'
      }
    }
    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const message = validate()
    if (message) {
      setError(message)
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        symbol,
        bias: form.bias,
        confidence: form.confidence === '' ? null : Number(form.confidence),
        referencePrice: toNumberOrNull(form.referencePrice),
        timeframe15m: form.timeframe15m || null,
        timeframe1h: form.timeframe1h || null,
        timeframe4h: form.timeframe4h || null,
        reasoning: toLines(form.reasoning),
        cautions: toLines(form.cautions),
        invalidationPrice: toNumberOrNull(form.invalidationPrice),
        notes: form.notes.trim() || null,
        marketSnapshot: Object.fromEntries(
          MARKET_FIELDS.map((field) => [field.id, toNumberOrNull(market[field.id])]),
        ),
        marketDataSource: 'MANUAL',
      }

      const result = await createAnalysis(payload)
      onSaved?.(result.analysis)
    } catch (submitError) {
      setError(submitError.message || '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="trading-lab-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="trading-lab-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="분석 기록"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="trading-lab-drawer__header">
          <h2 className="trading-lab-drawer__title">분석 기록 · {symbol}</h2>
          <button
            type="button"
            className="trading-lab-drawer__close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        <form className="trading-lab-drawer__form" onSubmit={handleSubmit}>
          <fieldset className="trading-lab-drawer__group">
            <legend>판단</legend>
            <div className="trading-lab-drawer__segment">
              {BIAS_OPTIONS.map((option) => (
                <label key={option.id} className="trading-lab-drawer__segment-item">
                  <input
                    type="radio"
                    name="bias"
                    value={option.id}
                    checked={form.bias === option.id}
                    onChange={() => updateField('bias', option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="trading-lab-drawer__field">
            <span>Confidence (0~100)</span>
            <input
              type="number"
              min="0"
              max="100"
              value={form.confidence}
              onChange={(event) => updateField('confidence', event.target.value)}
              placeholder="예: 63"
            />
          </label>

          <label className="trading-lab-drawer__field">
            <span>기준 가격</span>
            <input
              type="number"
              step="any"
              min="0"
              value={form.referencePrice}
              onChange={(event) => updateField('referencePrice', event.target.value)}
              placeholder="분석 시점 가격"
            />
          </label>

          <div className="trading-lab-drawer__row">
            {[
              { key: 'timeframe15m', label: '15m' },
              { key: 'timeframe1h', label: '1h' },
              { key: 'timeframe4h', label: '4h' },
            ].map((item) => (
              <label key={item.key} className="trading-lab-drawer__field">
                <span>{item.label} 구조</span>
                <select
                  value={form[item.key]}
                  onChange={(event) => updateField(item.key, event.target.value)}
                >
                  {STRUCTURE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <label className="trading-lab-drawer__field">
            <span>근거 (한 줄에 하나)</span>
            <textarea
              rows={3}
              value={form.reasoning}
              onChange={(event) => updateField('reasoning', event.target.value)}
              placeholder={'거래량 증가\nOI 증가\n시장 구조 상승'}
            />
          </label>

          <label className="trading-lab-drawer__field">
            <span>주의 (한 줄에 하나)</span>
            <textarea
              rows={2}
              value={form.cautions}
              onChange={(event) => updateField('cautions', event.target.value)}
              placeholder={'데이터 부족\n청산 밀집 추정 구간 접근'}
            />
          </label>

          <label className="trading-lab-drawer__field">
            <span>Invalidation 가격</span>
            <input
              type="number"
              step="any"
              min="0"
              value={form.invalidationPrice}
              onChange={(event) =>
                updateField('invalidationPrice', event.target.value)
              }
              placeholder="이 가격을 지나면 판단 근거가 약해짐"
            />
          </label>

          <label className="trading-lab-drawer__field">
            <span>메모</span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
            />
          </label>

          <button
            type="button"
            className="trading-lab-drawer__toggle"
            onClick={() => setShowMarket((prev) => !prev)}
            aria-expanded={showMarket}
          >
            {showMarket ? '− ' : '+ '}시장 지표 직접 입력 (선택)
          </button>

          {showMarket ? (
            <div className="trading-lab-drawer__market">
              {MARKET_FIELDS.map((field) => (
                <label key={field.id} className="trading-lab-drawer__field">
                  <span>{field.label}</span>
                  <input
                    type="number"
                    step="any"
                    value={market[field.id]}
                    onChange={(event) => updateMarket(field.id, event.target.value)}
                  />
                </label>
              ))}
              <p className="trading-lab-drawer__hint">
                비워두면 저장되지 않습니다. 거래소 provider 연결 후에는 자동으로
                채워집니다.
              </p>
            </div>
          ) : null}

          {error ? <p className="trading-lab-drawer__error">{error}</p> : null}

          <div className="trading-lab-drawer__actions">
            <button type="button" className="trading-lab__action" onClick={onClose}>
              취소
            </button>
            <button
              type="submit"
              className="trading-lab__action trading-lab__action--primary"
              disabled={saving}
            >
              {saving ? '저장 중…' : '분석 저장'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
