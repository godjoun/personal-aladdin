import React from 'react'
import {
  calculateEntryPlanMetrics,
  formatPlanPct,
  formatRewardRisk,
  journalDirectionLabel,
  journalNumber,
  journalRecordTypeLabel,
  journalSnippet,
} from '../../utils/tradeJournalView.js'

function Metric({ label, value }) {
  return <div className="journal-entry-summary__metric"><span>{label}</span><strong>{value ?? '—'}</strong></div>
}

/** Compact Entry · TP · SL card under the chart for 3-second review. */
export default function JournalEntrySummary({
  direction,
  recordType,
  form,
  onChange,
}) {
  const metrics = calculateEntryPlanMetrics({
    direction,
    entryPrice: form.entryPrice,
    takeProfitPrice: form.takeProfitPrice,
    stopLossPrice: form.stopLossPrice,
  })
  const rr = formatRewardRisk(metrics.rewardRiskRatio)
  return (
    <section className="journal-entry-summary" aria-label="진입 요약">
      <div className="journal-entry-summary__head">
        <h3>진입 요약</h3>
        <span className="journal-entry-summary__meta">
          <span className={`lab-direction lab-direction--${String(direction || 'LONG').toLowerCase()}`}>{journalDirectionLabel(direction)}</span>
          <span>{journalRecordTypeLabel(recordType)}</span>
        </span>
      </div>
      <div className="journal-entry-summary__prices">
        <label className="journal-field">Entry<input type="number" min="0.00000001" max="1000000000000" step="any" value={form.entryPrice} onChange={(e) => onChange('entryPrice', e.target.value)} placeholder="진입 가격" /></label>
        <label className="journal-field">TP<input type="number" min="0.00000001" max="1000000000000" step="any" value={form.takeProfitPrice} onChange={(e) => onChange('takeProfitPrice', e.target.value)} placeholder="목표가" /></label>
        <label className="journal-field">SL<input type="number" min="0.00000001" max="1000000000000" step="any" value={form.stopLossPrice} onChange={(e) => onChange('stopLossPrice', e.target.value)} placeholder="손절가 · SL / SP" /></label>
      </div>
      <div className="journal-entry-summary__metrics" aria-label="자동 계산">
        <Metric label="RR" value={rr} />
        <Metric label="예상 이익" value={formatPlanPct(metrics.rewardPct, { signed: true })} />
        <Metric label="예상 손실" value={formatPlanPct(metrics.riskPct, { loss: true })} />
      </div>
      {metrics.structureWarning && <p className="journal-entry-summary__warn" role="status">{metrics.structureWarning}</p>}
      <dl className="journal-entry-summary__notes">
        <div><dt>시나리오</dt><dd>{journalSnippet(form.scenarioText, '시나리오를 남겨주세요')}</dd></div>
        <div><dt>근거</dt><dd>{form.reasonTags?.length ? form.reasonTags.join(' · ') : '태그 없음'}</dd></div>
        <div><dt>리스크</dt><dd>{journalSnippet(form.riskPlanText, '리스크 계획 없음')}</dd></div>
        <div><dt>들어가면 안 되는 이유</dt><dd>{journalSnippet(form.avoidReasonText, '기록 없음')}</dd></div>
      </dl>
      {(metrics.entryPrice != null || metrics.takeProfitPrice != null || metrics.stopLossPrice != null) && (
        <p className="lab-muted journal-entry-summary__preview">
          Entry {journalNumber(metrics.entryPrice)} · TP {journalNumber(metrics.takeProfitPrice)} · SL {journalNumber(metrics.stopLossPrice)}
          {rr ? ` · RR ${rr}` : ''}
        </p>
      )}
    </section>
  )
}
