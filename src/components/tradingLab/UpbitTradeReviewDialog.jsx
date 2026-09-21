import React, { useEffect, useRef, useState } from 'react'
import {
  UPBIT_EXIT_REASONS,
  UPBIT_EXIT_REASON_KEYS,
  UPBIT_REVIEW_REASON_TAGS,
  UPBIT_REVIEW_TEXT_LIMITS,
} from '../../../shared/upbitTradeReview.js'

function marketLabel(market) {
  const [quote, base] = String(market || '').split('-')
  return quote && base ? `${base}/${quote}` : market
}

/** Compact review form for closed Upbit episodes — no auto TP/SL inference. */
export default function UpbitTradeReviewDialog({ trade, review, busy = false, onClose, onSave }) {
  const dialogRef = useRef(null)
  const [entryReasonText, setEntryReasonText] = useState(review?.entryReasonText || '')
  const [reasonTags, setReasonTags] = useState(review?.reasonTags || [])
  const [exitReason, setExitReason] = useState(review?.exitReason || '')
  const [reviewText, setReviewText] = useState(review?.reviewText || '')
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { dialog?.close() }
  }, [])

  function toggleTag(tag) {
    setReasonTags((current) => (
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]
    ))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      await onSave({
        entryReasonText,
        reasonTags,
        exitReason: exitReason || null,
        reviewText,
      })
    } catch (saveError) {
      setError(saveError?.field ? '입력 내용을 확인해주세요.' : '복기를 저장하지 못했습니다. 다시 시도해주세요.')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="lab-upbit-review-dialog"
      aria-labelledby="upbit-review-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
    >
      <header className="lab-upbit-review-dialog__head">
        <div>
          <div className="lab-eyebrow">UPBIT · REVIEW</div>
          <h3 id="upbit-review-title">{marketLabel(trade.market)} 매매 복기</h3>
          <p className="lab-muted">종료된 실전 거래의 근거를 직접 남깁니다. 자동 추정은 하지 않습니다.</p>
        </div>
        <button type="button" className="lab-button" onClick={onClose} disabled={busy}>닫기</button>
      </header>
      <form onSubmit={submit} className="lab-upbit-review-dialog__body">
        <label className="journal-field">
          왜 진입했나요?
          <textarea
            value={entryReasonText}
            maxLength={UPBIT_REVIEW_TEXT_LIMITS.entryReasonText}
            rows={3}
            onChange={(event) => setEntryReasonText(event.target.value)}
            placeholder="예: 4H 지지 구간 재테스트 후 15m에서 반등 확인"
          />
        </label>
        <fieldset className="journal-tag-group">
          <legend>진입 근거</legend>
          <div>
            {UPBIT_REVIEW_REASON_TAGS.map((tag) => (
              <button
                type="button"
                key={tag}
                aria-pressed={reasonTags.includes(tag)}
                className={`lab-tag${reasonTags.includes(tag) ? ' is-selected' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="journal-field">
          왜 청산했나요?
          <select value={exitReason} onChange={(event) => setExitReason(event.target.value)}>
            <option value="">선택 안 함</option>
            {UPBIT_EXIT_REASON_KEYS.map((key) => (
              <option key={key} value={key}>{UPBIT_EXIT_REASONS[key]}</option>
            ))}
          </select>
        </label>
        <label className="journal-field">
          한 줄 복기
          <textarea
            value={reviewText}
            maxLength={UPBIT_REVIEW_TEXT_LIMITS.reviewText}
            rows={3}
            onChange={(event) => setReviewText(event.target.value)}
            placeholder="예: 진입은 괜찮았지만 저항 바로 아래에서 추격한 것이 아쉬움."
          />
        </label>
        {error ? <p className="lab-error" role="alert">{error}</p> : null}
        <footer className="lab-upbit-review-dialog__footer">
          <button type="button" className="lab-button" onClick={onClose} disabled={busy}>취소</button>
          <button type="submit" className="lab-button lab-button--primary" disabled={busy}>
            {busy ? '저장 중…' : review?.reminderState === 'COMPLETED' ? '복기 수정 저장' : '복기 저장'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
