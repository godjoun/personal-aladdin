/**
 * tradingPlanMonitor.js — 매매 계획 실시간 가격 모니터링 계산
 */

import { calculateUnrealizedMetrics } from './tradingPlanCalculator.js'
import { formatProfitLoss } from './formatters.js'
import {
  formatCurrentPriceLabel,
  mapSymbolToUpbitMarket,
  resolveConnectionState,
  resolveQuoteState,
} from './upbitTickerUtils.js'

/**
 * @typedef {'WAITING' | 'ENTRY_REACHED'} WaitingPriceState
 * @typedef {'HOLDING' | 'STOP_REACHED' | 'TARGET_REACHED'} EnteredPriceState
 */

/**
 * @param {number | null | undefined} currentPrice
 * @param {number | null | undefined} referencePrice
 * @returns {number | null}
 */
export function calculatePriceDistanceRate(currentPrice, referencePrice) {
  const current = Number(currentPrice)
  const reference = Number(referencePrice)
  if (!Number.isFinite(current) || !Number.isFinite(reference) || reference <= 0) {
    return null
  }
  const rate = ((current - reference) / reference) * 100
  return Number.isFinite(rate) ? rate : null
}

/**
 * @param {number | null | undefined} currentPrice
 * @param {number | null | undefined} referencePrice
 * @param {string} label
 */
export function formatPriceDistanceLabel(currentPrice, referencePrice, label) {
  const rate = calculatePriceDistanceRate(currentPrice, referencePrice)
  if (rate == null) return '—'

  const abs = Math.abs(rate).toFixed(2)
  if (Math.abs(rate) < 0.0001) return `${label} 도달`
  if (rate > 0) return `${label}까지 ${abs}% 위`
  return `${label}까지 ${abs}% 아래`
}

/**
 * @param {{
 *   currentPrice: unknown,
 *   entryPrice: unknown,
 * }} input
 * @returns {WaitingPriceState | null}
 */
export function deriveWaitingPriceState(input) {
  const currentPrice = Number(input.currentPrice)
  const entryPrice = Number(input.entryPrice)

  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0
  ) {
    return null
  }

  if (currentPrice <= entryPrice) return 'ENTRY_REACHED'
  return 'WAITING'
}

/**
 * @param {{
 *   currentPrice: unknown,
 *   stopPrice: unknown,
 *   targetPrice: unknown,
 * }} input
 * @returns {EnteredPriceState | null}
 */
export function deriveEnteredPriceState(input) {
  const currentPrice = Number(input.currentPrice)
  const stopPrice = Number(input.stopPrice)
  const targetPrice = Number(input.targetPrice)

  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(stopPrice) ||
    !Number.isFinite(targetPrice)
  ) {
    return null
  }

  if (currentPrice <= stopPrice) return 'STOP_REACHED'
  if (currentPrice >= targetPrice) return 'TARGET_REACHED'
  return 'HOLDING'
}

/**
 * @deprecated v0.3부터 deriveWaitingPriceState / deriveEnteredPriceState 사용
 * @param {{
 *   currentPrice: unknown,
 *   entryPrice: unknown,
 *   stopPrice: unknown,
 *   targetPrice: unknown,
 * }} input
 */
export function deriveTradingPlanPriceState(input) {
  const waiting = deriveWaitingPriceState(input)
  if (waiting === 'ENTRY_REACHED') return 'ENTRY_REACHED'
  const entered = deriveEnteredPriceState(input)
  if (entered === 'STOP_REACHED') return 'STOP_REACHED'
  if (entered === 'TARGET_REACHED') return 'TARGET_REACHED'
  return 'WAITING'
}

/**
 * @param {WaitingPriceState | null | undefined} state
 */
export function formatWaitingPriceStateLabel(state) {
  if (state === 'ENTRY_REACHED') return '진입가 도달'
  return '진입 대기'
}

/**
 * @param {EnteredPriceState | null | undefined} state
 */
export function formatEnteredPriceStateLabel(state) {
  if (state === 'STOP_REACHED') return '손절가 하회'
  if (state === 'TARGET_REACHED') return '목표가 도달'
  return '보유 중'
}

/**
 * @param {import('./tradingPlanMonitor.js').WaitingPriceState | import('./tradingPlanMonitor.js').EnteredPriceState | 'WAITING' | 'ENTRY_REACHED' | 'STOP_REACHED' | 'TARGET_REACHED' | null | undefined} state
 */
export function formatTradingPlanPriceStateLabel(state) {
  if (state === 'ENTRY_REACHED') return '진입가 도달'
  if (state === 'STOP_REACHED') return '손절가 하회'
  if (state === 'TARGET_REACHED') return '목표가 도달'
  if (state === 'HOLDING') return '보유 중'
  return '진입 대기'
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan} plan
 * @param {ReturnType<typeof buildTradingPlanMonitorSnapshot>} snapshot
 */
export function getPlanCardStatusLabel(plan, snapshot) {
  if (plan.status === 'CLOSED') return '거래 종료'
  if (plan.status === 'CANCELLED') return '계획 취소'
  if (plan.status === 'ENTERED') {
    return formatEnteredPriceStateLabel(snapshot?.enteredPriceState)
  }
  if (plan.status === 'WAITING' && snapshot?.waitingPriceState) {
    return formatWaitingPriceStateLabel(snapshot.waitingPriceState)
  }
  return '진입 대기'
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan} plan
 */
export function isPlanMonitorActive(plan) {
  return plan.status === 'WAITING' || plan.status === 'ENTERED'
}

/**
 * @param {import('../services/tradingPlanStorage.js').TradingPlan} plan
 * @param {{
 *   isConnected: boolean,
 *   connectionFailed: boolean,
 *   getTickerForMarket: (market: string) => { tradePrice: number, receivedAt: number } | null,
 *   now?: number,
 *   formatPrice?: (value: number) => string,
 * }} tickerContext
 */
export function buildTradingPlanMonitorSnapshot(plan, tickerContext) {
  const now = tickerContext.now ?? Date.now()
  const formatPrice =
    tickerContext.formatPrice ??
    ((value) =>
      new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        maximumFractionDigits: 0,
      }).format(value))

  if (!isPlanMonitorActive(plan)) {
    return {
      supported: false,
      market: null,
      quoteState: 'unsupported',
      currentPrice: null,
      currentPriceLabel: '—',
      showStaleBadge: false,
      isLiveQuote: false,
      waitingPriceState: null,
      enteredPriceState: null,
      priceStateLabel: plan.status === 'CLOSED' ? '거래 종료' : '계획 취소',
      entryDistanceLabel: '—',
      stopDistanceLabel: '—',
      targetDistanceLabel: '—',
      unrealizedReturnRate: null,
      unrealizedProfitLoss: null,
      unrealizedReturnLabel: '—',
      unrealizedProfitLabel: '—',
    }
  }

  const market = mapSymbolToUpbitMarket(plan.symbol)
  const supported = Boolean(market)
  const ticker = market ? tickerContext.getTickerForMarket(market) : null
  const quoteState = resolveQuoteState({
    supported,
    isConnected: tickerContext.isConnected,
    connectionFailed: tickerContext.connectionFailed,
    lastReceivedAt: ticker?.receivedAt ?? null,
    now,
  })

  const tradePrice = Number.isFinite(ticker?.tradePrice) ? ticker.tradePrice : null
  const isLiveQuote = quoteState === 'live'
  const canComparePrice =
    isLiveQuote || (quoteState === 'stale' && tradePrice != null)
  const currentPrice = canComparePrice ? tradePrice : null

  const waitingPriceState =
    plan.status === 'WAITING' && currentPrice != null
      ? deriveWaitingPriceState({
          currentPrice,
          entryPrice: plan.entryPrice,
        })
      : null

  const enteredPriceState =
    plan.status === 'ENTERED' && currentPrice != null
      ? deriveEnteredPriceState({
          currentPrice,
          stopPrice: plan.stopPrice,
          targetPrice: plan.targetPrice,
        })
      : null

  let unrealizedReturnRate = null
  let unrealizedProfitLoss = null
  if (
    plan.status === 'ENTERED' &&
    isLiveQuote &&
    currentPrice != null &&
    plan.actualEntryPrice != null &&
    plan.actualInvestedAmount != null
  ) {
    const unrealized = calculateUnrealizedMetrics(
      currentPrice,
      plan.actualEntryPrice,
      plan.actualInvestedAmount,
    )
    if (unrealized) {
      unrealizedReturnRate = unrealized.returnRate
      unrealizedProfitLoss = unrealized.profitLoss
    }
  }

  const priceStateLabel =
    plan.status === 'ENTERED'
      ? formatEnteredPriceStateLabel(enteredPriceState)
      : formatWaitingPriceStateLabel(waitingPriceState)

  return {
    supported,
    market,
    quoteState,
    currentPrice,
    currentPriceLabel: formatCurrentPriceLabel(quoteState, tradePrice, formatPrice),
    showStaleBadge: quoteState === 'stale',
    isLiveQuote,
    waitingPriceState,
    enteredPriceState,
    priceStateLabel,
    entryDistanceLabel:
      currentPrice != null
        ? formatPriceDistanceLabel(currentPrice, plan.entryPrice, '진입가')
        : '—',
    stopDistanceLabel:
      plan.status === 'ENTERED' && currentPrice != null
        ? formatPriceDistanceLabel(currentPrice, plan.stopPrice, '손절가')
        : '—',
    targetDistanceLabel:
      plan.status === 'ENTERED' && currentPrice != null
        ? formatPriceDistanceLabel(currentPrice, plan.targetPrice, '목표가')
        : '—',
    unrealizedReturnRate,
    unrealizedProfitLoss,
    unrealizedReturnLabel:
      unrealizedReturnRate != null
        ? `${unrealizedReturnRate > 0 ? '+' : ''}${unrealizedReturnRate.toFixed(2)}%`
        : isLiveQuote
          ? '—'
          : '확인할 수 없음',
    unrealizedProfitLabel:
      unrealizedProfitLoss != null
        ? formatProfitLoss(unrealizedProfitLoss)
        : isLiveQuote
          ? '—'
          : '확인할 수 없음',
  }
}

/**
 * @param {{
 *   isConnected: boolean,
 *   connectionFailed: boolean,
 *   tickers: Record<string, { receivedAt?: number }>,
 *   markets: string[],
 *   now?: number,
 * }} input
 */
export function resolveSectionConnectionState(input) {
  if (input.markets.length === 0) return 'DISCONNECTED'

  const receivedTimes = input.markets
    .map((market) => input.tickers[market]?.receivedAt)
    .filter((value) => Number.isFinite(value))

  return resolveConnectionState({
    isConnected: input.isConnected,
    connectionFailed: input.connectionFailed,
    lastReceivedAt:
      receivedTimes.length > 0 ? Math.max(...receivedTimes) : null,
    now: input.now,
  })
}
