import { useEffect, useState } from 'react'
import { createShadowTrade } from '../../services/tradingLabApi.js'
import {
  SHADOW_TRADE_DISCLAIMER,
  formatShadowPrice,
  getShadowTagLabel,
} from '../../utils/tradingLabView.js'

const TAGS = [
  'support',
  'resistance',
  'support_ob',
  'resistance_ob',
  'fvg',
  'trendline',
  'fakeout',
  'liquidity_sweep',
  'volume_divergence',
]

const SYMBOLS = ['BTCUSDT', 'ETHUSDT']

/**
 * 가상 LONG/SHORT 기록 modal. 실제 주문은 보내지 않는다.
 */
export default function ShadowTradeComposer({
  open,
  symbol,
  direction,
  entryPrice,
  onClose,
  onSaved,
}) {
  const [formSymbol, setFormSymbol] = useState(symbol)
  const [formDirection, setFormDirection] = useState(direction)
  const [tags, setTags] = useState([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setFormSymbol(symbol)
    setFormDirection(direction)
    setTags([])
    setNote('')
    setError('')
  }, [open, symbol, direction])

  if (!open) return null

  function toggleTag(tag) {
    setTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = await createShadowTrade({
        symbol: formSymbol,
        direction: formDirection,
        entryPrice,
        userTags: tags,
        userNote: note,
      })
      onSaved(payload.trade)
    } catch (saveError) {
      setError(saveError.message || '가상 기록을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="trading-lab-drawer-backdrop" role="presentation">
      <aside
        className="trading-lab-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="가상 포지션 기록"
      >
        <header className="trading-lab-drawer__header">
          <h2 className="trading-lab-drawer__title">
            가상 {formDirection} 기록
          </h2>
          <button
            type="button"
            className="trading-lab-drawer__close"
            onClick={onClose}
          >
            닫기
          </button>
        </header>

        <form className="trading-lab-drawer__form" onSubmit={handleSubmit}>
          <p className="trading-lab-drawer__hint">{SHADOW_TRADE_DISCLAIMER}</p>

          <label className="trading-lab-drawer__field">
            종목
            <select
              value={formSymbol}
              onChange={(event) => setFormSymbol(event.target.value)}
            >
              {SYMBOLS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="trading-lab-drawer__group">
            <legend>방향</legend>
            <div className="trading-lab-drawer__segment">
              {['LONG', 'SHORT'].map((item) => (
                <label key={item} className="trading-lab-drawer__segment-item">
                  <input
                    type="radio"
                    name="shadow-direction"
                    checked={formDirection === item}
                    onChange={() => setFormDirection(item)}
                  />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="trading-lab-drawer__hint">
            진입가 {formatShadowPrice(entryPrice)} · 현재가 기준 자동 입력
          </p>

          <fieldset className="trading-lab-drawer__group">
            <legend>태그</legend>
            <div className="trading-lab__shadow-tags">
              {TAGS.map((tag) => (
                <label key={tag} className="trading-lab__shadow-tag">
                  <input
                    type="checkbox"
                    checked={tags.includes(tag)}
                    onChange={() => toggleTag(tag)}
                  />
                  {getShadowTagLabel(tag)}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="trading-lab-drawer__field">
            메모
            <textarea
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="지지/저항, OB, FVG, 추세선 등 관찰 메모"
            />
          </label>
          {!note.trim() ? (
            <p className="trading-lab-drawer__hint">진입 이유가 비어 있습니다</p>
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
              {saving ? '저장 중' : `가상 ${formDirection} 기록`}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
