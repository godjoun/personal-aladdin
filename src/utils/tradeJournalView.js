import { JOURNAL_IMAGE_MAX_BYTES, JOURNAL_IMAGE_TYPES, JOURNAL_REASON_TAGS } from '../../shared/tradeJournal.js'

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
export function journalForm(journal, trade, timeframe = '1h') {
  return {
    journalTitle: journal?.journalTitle || '', scenarioText: journal?.scenarioText || trade?.userNote || '',
    entryReasonText: journal?.entryReasonText || trade?.entryReason || '', timeframe: journal?.timeframe || timeframe,
    reasonTags: journal?.reasonTags || (trade?.userTags || []).filter((tag) => JOURNAL_REASON_TAGS.includes(tag)),
    invalidationPrice: journal?.invalidationPrice ?? '', hasStopPlan: journal?.hasStopPlan ?? null,
    hasTargetPlan: journal?.hasTargetPlan ?? null, fomo: journal?.fomo ?? null,
    riskPlanText: journal?.riskPlanText || '', avoidReasonText: journal?.avoidReasonText || '',
    reviewText: journal?.reviewText || '', mistakeText: journal?.mistakeText || '', lessonText: journal?.lessonText || '',
    emotionTag: journal?.emotionTag || null, reviewed: Boolean(journal?.reviewedAt), revision: journal?.revision || 0,
  }
}
export function validateImageFile(file) {
  const ext = file.name.split('.').at(-1)?.toLowerCase()
  if (!JOURNAL_IMAGE_TYPES[file.type]?.includes(ext)) return 'PNG, JPG, JPEG, WebP 이미지만 첨부할 수 있습니다.'
  if (file.size > JOURNAL_IMAGE_MAX_BYTES || file.size === 0) return '이미지는 5MB 이하여야 합니다.'
  return null
}
