import { JOURNAL_HORIZONS, JOURNAL_IMAGE_MAX_BYTES, JOURNAL_IMAGE_TYPES, JOURNAL_REASON_TAGS, JOURNAL_RECORD_TYPES } from '../../shared/tradeJournal.js'

export const REVIEW_UNFOLD_MARK = '[실제 전개]'
export const journalNumber = (value, suffix = '') => typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}${suffix}` : '데이터 없음'
export const journalDate = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '미기록'
export function journalReturn(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '추적 대기'
}
export function journalOutcomeLabel(trade, horizon, now = Date.now()) {
  const value = trade?.outcome?.[`return${horizon}Pct`]
  if (typeof value === 'number' && Number.isFinite(value)) return journalReturn(value)
  const due = Date.parse(trade?.createdAt) + Number.parseInt(horizon) * 3600000
  return now >= due ? '데이터 대기' : '추적 대기'
}
export function journalHorizonResult(trade, horizon, now = Date.now()) {
  const value = trade?.outcome?.[`return${horizon}Pct`]
  if (typeof value === 'number' && Number.isFinite(value)) return `${horizon} 후 ${journalReturn(value)}`
  return journalOutcomeLabel(trade, horizon, now)
}
export function splitReviewNotes(reviewText = '') {
  const text = String(reviewText || '')
  const match = text.match(/(?:^|\n)\[실제 전개\]\n?/)
  if (!match) return { judgment: text, unfold: '' }
  const index = match.index
  return { judgment: text.slice(0, index).trim(), unfold: text.slice(index + match[0].length).trim() }
}
export function joinReviewNotes(judgment, unfold) {
  const a = String(judgment || '').trim()
  const b = String(unfold || '').trim()
  if (!b) return a
  return a ? `${a}\n\n${REVIEW_UNFOLD_MARK}\n${b}` : `${REVIEW_UNFOLD_MARK}\n${b}`
}
export function journalSnippet(text, fallback = '') {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value || fallback
}
export function journalTitle(trade) {
  return journalSnippet(trade?.journal?.journalTitle, journalSnippet(trade?.journal?.scenarioText, journalSnippet(trade?.userNote, '제목 없는 시나리오')))
}
export function journalRecordTypeLabel(recordType) {
  return `${JOURNAL_RECORD_TYPES[recordType] || '관찰'} 기록`
}
export function journalDirectionLabel(direction) {
  return direction === 'SHORT' ? '가상 SHORT' : '가상 LONG'
}
export function journalRiskSummary(journal) {
  if (!journal) return '리스크 계획 없음'
  const parts = []
  if (journal.takeProfitPrice) parts.push(`TP ${journalNumber(journal.takeProfitPrice)}`)
  if (journal.stopLossPrice) parts.push(`SL ${journalNumber(journal.stopLossPrice)}`)
  else parts.push(journal.hasStopPlan == null ? '손절 기준 부족' : journal.hasStopPlan ? '손절 기준 있음' : '손절 기준 없음')
  parts.push(journal.invalidationPrice ? `무효화 ${journalNumber(journal.invalidationPrice)}` : '무효화 가격 미입력')
  if (journal.riskPlanText) parts.push(journalSnippet(journal.riskPlanText))
  return parts.join(' · ')
}
export function journalReviewSummary(journal) {
  if (!journal) return '아직 복기 메모 없음'
  const judgment = splitReviewNotes(journal.reviewText).judgment
  return journalSnippet(judgment, journalSnippet(journal.mistakeText, journalSnippet(journal.lessonText, '아직 복기 메모 없음')))
}
export function journalLatestReadyHorizon(trade) {
  return [...JOURNAL_HORIZONS].reverse().find((horizon) => Number.isFinite(trade?.outcome?.[`return${horizon}Pct`])) || null
}
export function journalNextPendingHorizon(trade, now = Date.now()) {
  return JOURNAL_HORIZONS.find((horizon) => !Number.isFinite(trade?.outcome?.[`return${horizon}Pct`]) && Date.parse(trade?.createdAt) + Number.parseInt(horizon) * 3600000 > now) || null
}
export function journalStatusLabel(trade, now = Date.now()) {
  if (trade?.journal?.reviewedAt) return '복기 완료'
  const ready = journalLatestReadyHorizon(trade)
  if (ready) return trade.journal ? '복기 필요' : `${ready} 결과 확인`
  const pending = journalNextPendingHorizon(trade, now)
  if (pending) return `${pending} 추적 대기`
  return '시간별 결과 추적 중'
}
export function journalMaeSummary(trade) {
  const mae = trade?.outcome?.maxAdverseMovePct
  return typeof mae === 'number' && Number.isFinite(mae) ? `먼저 ${journalReturn(mae)}까지 흔들림` : ''
}
/** Reward/risk metrics from Entry · TP · SL. Missing or invalid legs stay null — never invent numbers. */
export function calculateEntryPlanMetrics({ direction, entryPrice, takeProfitPrice, stopLossPrice }) {
  const entry = Number(entryPrice)
  const target = Number(takeProfitPrice)
  const stop = Number(stopLossPrice)
  const hasEntry = Number.isFinite(entry) && entry > 0
  const hasTarget = Number.isFinite(target) && target > 0
  const hasStop = Number.isFinite(stop) && stop > 0
  let structureWarning = null
  if (hasEntry && hasTarget) {
    if (direction === 'SHORT' && !(target < entry)) structureWarning = '가격 구조 확인 필요'
    if (direction !== 'SHORT' && !(target > entry)) structureWarning = '가격 구조 확인 필요'
  }
  if (hasEntry && hasStop) {
    if (direction === 'SHORT' && !(stop > entry)) structureWarning = '가격 구조 확인 필요'
    if (direction !== 'SHORT' && !(stop < entry)) structureWarning = '가격 구조 확인 필요'
  }
  let rewardPct = null
  let riskPct = null
  if (hasEntry && hasTarget) {
    if (direction === 'SHORT') rewardPct = ((entry - target) / entry) * 100
    else rewardPct = ((target - entry) / entry) * 100
    if (!(rewardPct > 0)) rewardPct = null
  }
  if (hasEntry && hasStop) {
    if (direction === 'SHORT') riskPct = ((stop - entry) / entry) * 100
    else riskPct = ((entry - stop) / entry) * 100
    if (!(riskPct > 0)) riskPct = null
  }
  const rewardRiskRatio = rewardPct != null && riskPct != null && riskPct > 0 ? rewardPct / riskPct : null
  return {
    entryPrice: hasEntry ? entry : null,
    takeProfitPrice: hasTarget ? target : null,
    stopLossPrice: hasStop ? stop : null,
    rewardPct,
    riskPct,
    rewardRiskRatio,
    structureWarning,
    hasPlan: hasEntry || hasTarget || hasStop,
  }
}
export function formatRewardRisk(ratio) {
  return typeof ratio === 'number' && Number.isFinite(ratio) ? `1:${ratio.toFixed(2)}` : null
}
export function formatPlanPct(value, { signed = false, loss = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (loss) return `-${Math.abs(value).toFixed(2)}%`
  const text = `${value.toFixed(2)}%`
  return signed && value > 0 ? `+${text}` : text
}
export function journalPricePlanSummary(trade) {
  const journal = trade?.journal
  const hasJournalPlan = journal?.entryPrice != null || journal?.takeProfitPrice != null || journal?.stopLossPrice != null
  if (!hasJournalPlan) return '가격 계획 미입력'
  const plan = calculateEntryPlanMetrics({
    direction: trade?.direction,
    entryPrice: journal?.entryPrice ?? trade?.entryPrice,
    takeProfitPrice: journal?.takeProfitPrice,
    stopLossPrice: journal?.stopLossPrice,
  })
  const parts = []
  if (plan.entryPrice != null) parts.push(`Entry ${journalNumber(plan.entryPrice)}`)
  if (plan.takeProfitPrice != null) parts.push(`TP ${journalNumber(plan.takeProfitPrice)}`)
  if (plan.stopLossPrice != null) parts.push(`SL ${journalNumber(plan.stopLossPrice)}`)
  const rr = formatRewardRisk(plan.rewardRiskRatio)
  if (rr) parts.push(`RR ${rr}`)
  return parts.join(' · ') || '가격 계획 미입력'
}
export function journalForm(journal, trade, timeframe = '1h') {
  const notes = splitReviewNotes(journal?.reviewText)
  return {
    journalTitle: journal?.journalTitle || '', scenarioText: journal?.scenarioText || trade?.userNote || '',
    entryReasonText: journal?.entryReasonText || trade?.entryReason || '', timeframe: journal?.timeframe || timeframe,
    reasonTags: journal?.reasonTags || (trade?.userTags || []).filter((tag) => JOURNAL_REASON_TAGS.includes(tag)),
    invalidationPrice: journal?.invalidationPrice ?? '',
    entryPrice: journal?.entryPrice ?? trade?.entryPrice ?? '',
    takeProfitPrice: journal?.takeProfitPrice ?? '', stopLossPrice: journal?.stopLossPrice ?? '',
    hasStopPlan: journal?.hasStopPlan ?? null,
    hasTargetPlan: journal?.hasTargetPlan ?? null, fomo: journal?.fomo ?? null,
    riskPlanText: journal?.riskPlanText || '', avoidReasonText: journal?.avoidReasonText || '',
    reviewText: notes.judgment, unfoldText: notes.unfold, mistakeText: journal?.mistakeText || '', lessonText: journal?.lessonText || '',
    emotionTag: journal?.emotionTag || null, reviewed: Boolean(journal?.reviewedAt), revision: journal?.revision || 0,
  }
}
export function validateImageFile(file) {
  const ext = file.name.split('.').at(-1)?.toLowerCase()
  if (!JOURNAL_IMAGE_TYPES[file.type]?.includes(ext)) return 'PNG, JPG, JPEG, WebP 이미지만 첨부할 수 있습니다.'
  if (file.size > JOURNAL_IMAGE_MAX_BYTES || file.size === 0) return '이미지는 5MB 이하여야 합니다.'
  return null
}
