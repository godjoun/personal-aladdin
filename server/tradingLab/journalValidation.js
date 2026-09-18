import { JOURNAL_EMOTIONS, JOURNAL_MARGIN_MODES, JOURNAL_REASON_TAGS, JOURNAL_RECORD_TYPES, JOURNAL_TIMEFRAMES } from '../../shared/tradeJournal.js'

export const JOURNAL_TEXT_LIMITS = {
  journalTitle: 120, scenarioText: 4000, entryReasonText: 4000,
  riskPlanText: 2000, avoidReasonText: 2000, reviewText: 4000,
  mistakeText: 2000, lessonText: 2000,
}
export function validateJournal(body, { create = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body' }
  const allowed = new Set([
    ...Object.keys(JOURNAL_TEXT_LIMITS), 'timeframe', 'reasonTags', 'invalidationPrice',
    'entryPrice', 'takeProfitPrice', 'stopLossPrice',
    'leverage', 'marginMode', 'marginAmount', 'positionSize', 'liquidationPrice',
    'hasStopPlan', 'hasTargetPlan', 'fomo', 'emotionTag', 'reviewed', 'revision',
    ...(create ? ['symbol', 'direction', 'recordType', 'requestId'] : []),
  ])
  const extra = Object.keys(body).find((key) => !allowed.has(key))
  if (extra) return { ok: false, field: 'body' }
  const value = {}
  const fail = (field) => ({ ok: false, field })
  for (const [key, limit] of Object.entries(JOURNAL_TEXT_LIMITS)) {
    if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > limit)) return fail(key)
    value[key] = body[key]?.trim() || null
  }
  if (!JOURNAL_TIMEFRAMES.includes(body.timeframe)) return fail('timeframe')
  value.timeframe = body.timeframe
  if (!Array.isArray(body.reasonTags) || body.reasonTags.length > JOURNAL_REASON_TAGS.length || body.reasonTags.some((tag) => !JOURNAL_REASON_TAGS.includes(tag))) return fail('reasonTags')
  value.reasonTags = [...new Set(body.reasonTags)]
  for (const key of ['hasStopPlan', 'hasTargetPlan', 'fomo']) {
    if (body[key] != null && typeof body[key] !== 'boolean') return fail(key)
    value[key] = body[key] ?? null
  }
  for (const key of ['invalidationPrice', 'entryPrice', 'takeProfitPrice', 'stopLossPrice', 'leverage', 'marginAmount', 'positionSize', 'liquidationPrice']) {
    if (body[key] != null && (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || body[key] <= 0 || body[key] > 1e12)) return fail(key)
    value[key] = body[key] ?? null
  }
  if (body.marginMode != null && !JOURNAL_MARGIN_MODES.includes(body.marginMode)) return fail('marginMode')
  value.marginMode = body.marginMode ?? null
  if (body.emotionTag != null && !JOURNAL_EMOTIONS.includes(body.emotionTag)) return fail('emotionTag')
  value.emotionTag = body.emotionTag ?? null
  if (body.reviewed != null && typeof body.reviewed !== 'boolean') return fail('reviewed')
  value.reviewed = body.reviewed === true
  if (!Number.isInteger(body.revision) || body.revision < 0) return fail('revision')
  value.revision = body.revision
  if (value.reviewed && !value.reviewText && !value.mistakeText && !value.lessonText) return fail('reviewText')
  if (create) {
    if (!['BTCUSDT', 'ETHUSDT'].includes(body.symbol)) return fail('symbol')
    if (!['LONG', 'SHORT'].includes(body.direction)) return fail('direction')
    if (!Object.hasOwn(JOURNAL_RECORD_TYPES, body.recordType)) return fail('recordType')
    if (typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId)) return fail('requestId')
    if (!value.scenarioText) return fail('scenarioText')
    Object.assign(value, { symbol: body.symbol, direction: body.direction, recordType: body.recordType, requestId: body.requestId })
  }
  return { ok: true, value }
}
