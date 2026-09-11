import { useState } from 'react'
import { createAnalysisScreenshot } from '../../services/tradingLabApi.js'

const TIMEFRAME_OPTIONS = ['15m', '1h', '4h', '12h', '1d']

/**
 * 차트 이미지 추가 영역 (준비 단계).
 *
 * 이번 단계에서는 이미지 파일을 업로드하거나 AI 분석을 호출하지 않는다.
 * symbol / timeframe / capturedAt / note metadata 만 기록해 두고,
 * 실제 이미지 분석은 다음 단계에서 이 영역에 연결한다.
 */
export default function ChartCaptureSlot({ symbol, analysisId, onSaved }) {
  const [open, setOpen] = useState(false)
  const [timeframe, setTimeframe] = useState('1h')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  const canRecord = Boolean(analysisId)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canRecord) return

    setSaving(true)
    setError('')

    try {
      await createAnalysisScreenshot(analysisId, {
        symbol,
        timeframe,
        capturedAt: new Date().toISOString(),
        note: note.trim() || null,
      })
      setNote('')
      setOpen(false)
      setSavedCount((prev) => prev + 1)
      onSaved?.()
    } catch (submitError) {
      setError(submitError.message || '캡처 정보를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="trading-lab__section" aria-label="차트 이미지">
      <header className="trading-lab__section-head">
        <h2 className="trading-lab__section-title">차트 이미지</h2>
        <button
          type="button"
          className="trading-lab__action"
          onClick={() => setOpen((prev) => !prev)}
          disabled={!canRecord}
          aria-expanded={open}
        >
          + 차트 이미지 추가
        </button>
      </header>

      <div className="trading-lab__capture-slot">
        <p className="trading-lab__capture-text">
          차트 캡처를 붙여 분석하는 기능은 다음 단계에서 연결됩니다. 현재는 캡처
          정보(종목 · 타임프레임 · 시각 · 메모)만 기록해 둘 수 있습니다.
        </p>
        {!canRecord ? (
          <p className="trading-lab__reason-empty">
            먼저 분석을 기록하면 캡처 정보를 연결할 수 있습니다.
          </p>
        ) : null}
        {savedCount > 0 ? (
          <p className="trading-lab__reason-empty">
            캡처 정보 {savedCount}건이 최근 분석에 연결되었습니다.
          </p>
        ) : null}
      </div>

      {open && canRecord ? (
        <form className="trading-lab__capture-form" onSubmit={handleSubmit}>
          <label className="trading-lab-drawer__field">
            <span>타임프레임</span>
            <select
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value)}
            >
              {TIMEFRAME_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="trading-lab-drawer__field">
            <span>메모</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="예: 레인지 상단 이탈 시도"
            />
          </label>

          {error ? <p className="trading-lab-drawer__error">{error}</p> : null}

          <button
            type="submit"
            className="trading-lab__action trading-lab__action--primary"
            disabled={saving}
          >
            {saving ? '저장 중…' : '캡처 정보 저장'}
          </button>
        </form>
      ) : null}
    </section>
  )
}
