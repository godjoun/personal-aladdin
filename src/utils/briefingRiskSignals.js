/**
 * briefingRiskSignals.js — 데이터 기반 주의 신호 (투자판단 표현 금지)
 */

export const BRIEFING_RISK_THRESHOLDS = Object.freeze({
  /** 250일 고가 대비 하락률(%) — 이상이면 주의 */
  DRAWDOWN_FROM_250_HIGH_PCT: 25,
  /** 연중 고가 대비 하락률(%) */
  DRAWDOWN_FROM_YEAR_HIGH_PCT: 30,
  /** 보유 손실률(%) — 이상이면 확인 필요 */
  HOLDING_LOSS_PCT: 20,
  /** 당일 등락률 절대값(%) — 변동성 확대 */
  DAY_CHANGE_ABS_PCT: 8,
})

/**
 * @param {number | null | undefined} current
 * @param {number | null | undefined} reference
 * @returns {number | null} 음수 = 하락
 */
export function percentChange(current, reference) {
  if (current == null || reference == null || current === '' || reference === '') {
    return null
  }
  const c = Number(current)
  const r = Number(reference)
  if (!Number.isFinite(c) || !Number.isFinite(r) || r === 0) return null
  return ((c - r) / Math.abs(r)) * 100
}

/**
 * @typedef {{
 *   id: string,
 *   level: '주의' | '확인 필요' | '변동성 확대',
 *   title: string,
 *   detail: string,
 *   evidence: string,
 *   priority: number,
 * }} BriefingRiskSignal
 */

/**
 * 종목정보·보유정보 기반 주의 신호
 *
 * @param {{
 *   info?: {
 *     currentPrice?: number | null,
 *     high250?: number | null,
 *     low250?: number | null,
 *     yearHigh?: number | null,
 *     yearLow?: number | null,
 *     changeRate?: number | null,
 *     foreignExhaustionRate?: number | null,
 *     isEtf?: boolean,
 *   } | null,
 *   holdings?: Array<{
 *     accountType?: string | null,
 *     profitRate?: number | null,
 *   }>,
 *   thresholds?: typeof BRIEFING_RISK_THRESHOLDS,
 * }} input
 * @returns {BriefingRiskSignal[]}
 */
export function buildBriefingRiskSignals(input = {}) {
  const thresholds = { ...BRIEFING_RISK_THRESHOLDS, ...(input.thresholds || {}) }
  const info = input.info || {}
  /** @type {BriefingRiskSignal[]} */
  const signals = []

  const dd250 = percentChange(info.currentPrice, info.high250)
  if (dd250 != null && dd250 <= -thresholds.DRAWDOWN_FROM_250_HIGH_PCT) {
    signals.push({
      id: 'drawdown_250',
      level: '주의',
      title: '250일 고가 대비 하락',
      detail: '최근 고점 대비 가격 괴리가 큽니다.',
      evidence: `250일 최고가 대비 ${dd250.toFixed(1)}%`,
      priority: 80,
    })
  }

  const ddYear = percentChange(info.currentPrice, info.yearHigh)
  if (ddYear != null && ddYear <= -thresholds.DRAWDOWN_FROM_YEAR_HIGH_PCT) {
    signals.push({
      id: 'drawdown_year',
      level: '주의',
      title: '연중 고가 대비 하락',
      detail: '연중 고점 대비 하락 폭을 확인하세요.',
      evidence: `연중 최고가 대비 ${ddYear.toFixed(1)}%`,
      priority: 70,
    })
  }

  const dayChange = Number(info.changeRate)
  if (
    Number.isFinite(dayChange) &&
    Math.abs(dayChange) >= thresholds.DAY_CHANGE_ABS_PCT
  ) {
    signals.push({
      id: 'day_volatility',
      level: '변동성 확대',
      title: '당일 가격 변동 확대',
      detail: '하루 등락 폭이 평소보다 큽니다.',
      evidence: `당일 등락률 ${dayChange > 0 ? '+' : ''}${dayChange.toFixed(2)}%`,
      priority: 60,
    })
  }

  for (const holding of input.holdings || []) {
    const rate = Number(holding.profitRate)
    if (!Number.isFinite(rate) || rate > -thresholds.HOLDING_LOSS_PCT) continue
    const account =
      holding.accountType === 'isa'
        ? 'ISA'
        : holding.accountType === 'general'
          ? '일반'
          : '보유'
    signals.push({
      id: `holding_loss_${holding.accountType || 'x'}`,
      level: '확인 필요',
      title: `${account} 보유 손실률`,
      detail: '평가 손실 폭이 임계값을 넘었습니다.',
      evidence: `수익률 ${rate.toFixed(2)}%`,
      priority: 75,
    })
  }

  return signals.sort((a, b) => b.priority - a.priority)
}
