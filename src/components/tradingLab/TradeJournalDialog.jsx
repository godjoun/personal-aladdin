import React, { useEffect, useRef, useState } from 'react'
import { JOURNAL_EMOTIONS, JOURNAL_IMAGE_MAX_COUNT, JOURNAL_REASON_TAGS, JOURNAL_RECORD_TYPES, JOURNAL_TIMEFRAMES } from '../../../shared/tradeJournal.js'
import { createTradeJournal, fetchTradeJournal, removeJournalImage, saveTradeJournal, uploadJournalImage } from '../../services/tradingLabApi.js'
import { journalDate, journalForm, journalNumber, validateImageFile } from '../../utils/tradeJournalView.js'
import { JournalOutcome, JournalSnapshot } from './JournalOutcome.jsx'

const TEXT_FIELDS = { journalTitle: 120, scenarioText: 4000, entryReasonText: 4000, riskPlanText: 2000, avoidReasonText: 2000, reviewText: 4000, mistakeText: 2000, lessonText: 2000 }
const FIELD_ERRORS = { entryPrice: '현재 기준 가격이 없습니다. 차트에서 본 가상 기준 가격을 직접 입력해주세요.', scenarioText: '남기고 싶은 시나리오를 한 줄 이상 적어주세요.', reviewText: '복기를 완료하려면 메모나 다음에 고칠 점을 남겨주세요.', image: '이미지 형식이나 크기를 확인해주세요.' }
function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** The native modal supplies focus containment and restoration. No external image host. */
export default function TradeJournalDialog({ tradeId, symbol, timeframe = '1h', onClose, onSaved }) {
  const dialogRef = useRef(null)
  const fileRef = useRef(null)
  const requestId = useRef(null)
  const busyRef = useRef(false)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(() => journalForm(null, null, timeframe))
  const [direction, setDirection] = useState('LONG')
  const [recordType, setRecordType] = useState('OBSERVATION')
  const [entryPrice, setEntryPrice] = useState('')
  const [images, setImages] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(Boolean(tradeId))
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; dialog?.close() }
  }, [])
  useEffect(() => {
    if (!tradeId) return
    let cancelled = false
    fetchTradeJournal(tradeId).then((payload) => {
      if (cancelled) return
      setDetail(payload)
      setForm(journalForm(payload.journal, payload.trade, timeframe))
      setImages(payload.journal?.images || [])
      setDirection(payload.trade.direction)
    }).catch(() => { if (!cancelled) setError('일지를 불러오지 못했습니다. 닫은 뒤 다시 열어주세요.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tradeId, timeframe])
  // Outcomes refresh independently: polling must never replace unsaved notes or images.
  useEffect(() => {
    const id = detail?.trade?.id
    if (!id) return
    let cancelled = false
    const timer = setInterval(() => {
      fetchTradeJournal(id).then((payload) => {
        if (!cancelled) setDetail((current) => ({ ...current, trade: payload.trade }))
      }).catch(() => {})
    }, 30000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [detail?.trade?.id])
  useEffect(() => {
    if (!dirty && !pending.length) return
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, pending.length])

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true); setMessage('')
  }
  function close() {
    if (busyRef.current) return
    if (dirty || pending.length) setDiscard(true)
    else onClose()
  }
  async function addFiles(files) {
    if (busyRef.current) return
    const list = Array.from(files)
    if (!list.length) return
    if (images.length + pending.length + list.length > JOURNAL_IMAGE_MAX_COUNT) { setError('캡처는 최대 4장까지 첨부할 수 있습니다.'); return }
    const invalid = list.map(validateImageFile).find(Boolean)
    if (invalid) { setError(invalid); return }
    busyRef.current = true; setBusy(true)
    try {
      const prepared = await Promise.all(list.map(async (file) => ({ id: crypto.randomUUID(), file, preview: await readImage(file) })))
      setPending((current) => [...current, ...prepared]); setError('')
    } catch { setError('이미지를 읽지 못했습니다.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  function paste(event) {
    const files = Array.from(event.clipboardData?.items || []).filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter(Boolean)
    if (!files.length) return
    event.preventDefault(); void addFiles(files)
  }
  async function save(event) {
    event.preventDefault()
    if (busyRef.current || (tradeId && !detail)) return
    busyRef.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const payload = { ...form, invalidationPrice: form.invalidationPrice === '' ? null : Number(form.invalidationPrice) }
      let saved
      if (detail?.trade) saved = await saveTradeJournal(detail.trade.id, payload)
      else {
        requestId.current ||= crypto.randomUUID()
        saved = await createTradeJournal({ ...payload, symbol, direction, recordType, requestId: requestId.current, entryPrice: entryPrice === '' ? null : Number(entryPrice) })
      }
      setDetail(saved); setForm(journalForm(saved.journal, saved.trade)); setDirty(false)
      setImages(saved.journal.images || [])
      onSaved?.(saved.trade)
      for (const image of pending) {
        const result = await uploadJournalImage(saved.journal.id, image.file, image.id)
        setImages(result.images)
        setPending((current) => current.filter((item) => item.id !== image.id))
      }
      setMessage('일지를 저장했습니다. 시간별 결과는 이 기록에 이어서 쌓입니다.')
    } catch (err) {
      setError(FIELD_ERRORS[err.field] || (err.message && err.status ? err.message : '저장하지 못했습니다. 작성 내용은 유지됩니다. 다시 시도해주세요.'))
    } finally { busyRef.current = false; setBusy(false) }
  }
  async function removeImage(image) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const result = await removeJournalImage(detail.journal.id, image.id)
      setImages(result.images); onSaved?.(detail.trade)
    } catch { setError('이미지를 삭제하지 못했습니다.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  function textField(key, label, placeholder, rows = 3) {
    return <label className="journal-field" key={key}>{label}<textarea value={form[key]} maxLength={TEXT_FIELDS[key]} rows={rows} onChange={(event) => change(key, event.target.value)} placeholder={placeholder} required={key === 'scenarioText' && !detail?.trade} /></label>
  }
  const currentSymbol = detail?.trade?.symbol || symbol
  return (
    <dialog ref={dialogRef} className="journal-dialog" aria-labelledby="journal-dialog-title" onCancel={(event) => { event.preventDefault(); close() }} onPaste={paste}>
      <header className="journal-dialog__header">
        <div><div className="lab-eyebrow">TRADE JOURNAL</div><h2 id="journal-dialog-title">{detail?.trade ? '나의 시나리오 · 복기' : '지금 본 시나리오 남기기'}</h2><p className="lab-muted">{currentSymbol}{detail?.trade ? ` · 가상 ${direction} · ${journalDate(detail.trade.createdAt)}` : ' · 차트 캡처와 내 판단을 한곳에'}</p></div>
        <button type="button" className="lab-button" onClick={close} disabled={busy}>닫기</button>
      </header>
      {loading ? <p className="journal-loading" role="status">일지를 불러오는 중…</p> : (
        <form onSubmit={save} className="journal-dialog__body">
          <fieldset disabled={busy || Boolean(tradeId && !detail)} className="journal-form-fields">
            {!detail?.trade && <div className="journal-entry-fields">
              <label className="journal-field">내가 관찰한 방향<select value={direction} onChange={(e) => { setDirection(e.target.value); setDirty(true) }}><option value="LONG">가상 LONG</option><option value="SHORT">가상 SHORT</option></select></label>
              <label className="journal-field">기록 유형<select value={recordType} onChange={(e) => { setRecordType(e.target.value); setDirty(true) }}>{Object.entries(JOURNAL_RECORD_TYPES).map(([value, label]) => <option key={value} value={value}>{label} 기록</option>)}</select></label>
              <label className="journal-field">가상 기준 가격 · USDT<input type="number" min="0.00000001" max="1000000000000" step="any" value={entryPrice} onChange={(e) => { setEntryPrice(e.target.value); setDirty(true) }} placeholder="비우면 저장 시 현재가" /></label>
            </div>}
            {detail?.trade && <div className="journal-entry-fact">가상 기준 가격 <strong>{journalNumber(detail.trade.entryPrice)} USDT</strong><span>실제 주문 없음</span></div>}
            <div className="journal-two-fields">
              <label className="journal-field">일지 제목 · 선택<input maxLength={120} value={form.journalTitle} onChange={(e) => change('journalTitle', e.target.value)} placeholder="예: 저항 구간 재확인" /></label>
              <label className="journal-field">관찰 시간봉<select value={form.timeframe} onChange={(e) => change('timeframe', e.target.value)}>{JOURNAL_TIMEFRAMES.map((tf) => <option value={tf} key={tf}>{tf}</option>)}</select></label>
            </div>
            <section className="journal-upload" aria-label="차트 캡처 첨부">
              <div className="journal-upload__heading"><h3>차트 캡처</h3><span className="lab-muted">{images.length + pending.length} / 4</span></div>
              <div className="journal-upload__drop" tabIndex={0} role="group" aria-label="이미지 붙여넣기 영역" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files) }}>
                <strong>TradingView에서 본 그대로 남겨두세요.</strong><p>이미지를 끌어놓거나 이 화면에서 ⌘V / Ctrl+V로 붙여넣기</p>
                <button type="button" className="lab-button" disabled={images.length + pending.length >= 4} onClick={() => fileRef.current?.click()}>차트 이미지 추가</button><small>PNG · JPG · WebP / 장당 5MB / 로컬 저장</small>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
              </div>
              <div className="journal-images">{images.map((image) => <figure key={image.id}><a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt="저장한 차트 캡처" /></a><figcaption>저장됨 <button type="button" onClick={() => removeImage(image)}>이미지 삭제</button></figcaption></figure>)}{pending.map((image) => <figure key={image.id}><img src={image.preview} alt="저장할 차트 캡처 미리보기" /><figcaption>저장 대기 <button type="button" onClick={() => setPending((current) => current.filter((item) => item.id !== image.id))}>첨부 취소</button></figcaption></figure>)}</div>
            </section>
            <section className="journal-section"><div className="lab-eyebrow">01 / SCENARIO</div><h3>무엇을 보고, 왜 그렇게 생각했나요?</h3>
              {textField('scenarioText', '진입 시나리오', '예: 4H 저항 구간에서 1H FVG를 다시 확인. 유동성 스윕 이후 반응을 관찰한다.')}
              {textField('entryReasonText', '내 진입 근거', '어떤 반응을 확인하면 내 시나리오에 힘이 실릴까요?', 2)}
              <fieldset className="journal-tag-group"><legend>근거 태그</legend><div>{JOURNAL_REASON_TAGS.map((tag) => <button type="button" key={tag} aria-pressed={form.reasonTags.includes(tag)} className={`lab-tag${form.reasonTags.includes(tag) ? ' is-selected' : ''}`} onClick={() => change('reasonTags', form.reasonTags.includes(tag) ? form.reasonTags.filter((v) => v !== tag) : [...form.reasonTags, tag])}>{tag}</button>)}</div></fieldset>
            </section>
            <section className="journal-section"><div className="lab-eyebrow">02 / RISK PLAN</div><h3>이 생각이 틀렸다고 볼 기준</h3>
              <label className="journal-field">무효화 가격 · 선택<input type="number" min="0.00000001" step="any" max="1000000000000" value={form.invalidationPrice} onChange={(e) => change('invalidationPrice', e.target.value)} placeholder="이 가격을 지나면 시나리오 재검토" /></label>
              <div className="journal-entry-fields">{[['hasStopPlan', '손절 기준'], ['hasTargetPlan', '목표 기준'], ['fomo', 'FOMO 여부']].map(([key, label]) => <label className="journal-field" key={key}>{label}<select value={form[key] == null ? '' : String(form[key])} onChange={(e) => change(key, e.target.value === '' ? null : e.target.value === 'true')}><option value="">아직 기록 안 함</option><option value="true">있음</option><option value="false">없음</option></select></label>)}</div>
              {textField('riskPlanText', '리스크 계획', '가격 이탈, 봉 마감, 목표 구간 등 내가 확인할 기준', 2)}
              {textField('avoidReasonText', '들어가면 안 되는 이유', '반대 근거, 늦은 추격, 조급함 등', 2)}
            </section>
            <JournalSnapshot snapshot={detail?.journal?.indicatorSnapshot} entryPlan={detail?.journal?.entryPlanSnapshot} />
            {detail?.trade && <JournalOutcome trade={detail.trade} />}
            <details className="journal-review" open={Boolean(detail?.trade)}><summary>03 / REVIEW · 나중의 내가 남기는 복기</summary>
              {textField('reviewText', '내 판단은 어땠나요?', '예상했던 반응과 실제 움직임을 비교해보세요.')}
              {textField('mistakeText', '틀렸다면, 무엇을 놓쳤나요?', '진입 근거와 충돌 신호를 다시 살펴보세요.', 2)}
              {textField('lessonText', '다음에 고칠 한 가지', '다음 기록에서 실천할 구체적인 기준', 2)}
              <label className="journal-field">지금의 감정<select value={form.emotionTag || ''} onChange={(e) => change('emotionTag', e.target.value || null)}><option value="">선택 안 함</option>{JOURNAL_EMOTIONS.map((emotion) => <option key={emotion}>{emotion}</option>)}</select></label>
              <label className="journal-review__done"><input type="checkbox" checked={form.reviewed} onChange={(e) => change('reviewed', e.target.checked)} />이 기록의 복기를 마쳤습니다</label>
            </details>
          </fieldset>
          <footer className="journal-dialog__footer">
            {error && <p className="lab-error" role="alert">{error}{detail?.journal && pending.length > 0 ? ' 일지 본문은 저장되어 있습니다. 남은 이미지만 다시 저장할 수 있습니다.' : ''}</p>}
            {message && <p className="lab-success" role="status">{message}</p>}
            {discard ? <div className="journal-discard"><p>저장하지 않은 내용이 있습니다.</p><button type="button" className="lab-button" onClick={() => setDiscard(false)}>계속 작성</button><button type="button" className="lab-button" onClick={onClose}>작성 내용 버리고 닫기</button></div> : <div><p className="lab-muted">{detail?.journal ? '메모를 수정해도 처음 저장한 근거는 유지됩니다.' : '저장하면 가상 기록과 당시 근거를 함께 남깁니다.'}</p><button type="submit" className="lab-button lab-button--primary" disabled={busy || Boolean(tradeId && !detail)}>{busy ? '저장 중…' : detail?.trade ? '일지 저장' : '가상 기록으로 저장'}</button></div>}
          </footer>
        </form>
      )}
    </dialog>
  )
}
