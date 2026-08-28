/**
 * TradingPlanSection.jsx — TRADING 매매 계획 영역
 */

import { useMemo } from 'react'
import {
  formatCurrency,
  formatPercent,
  formatProfitLoss,
} from '../../utils/formatters.js'
import {
  formatRiskRewardRatio,
  getActiveTradingPlans,
  getRecentTradingPlans,
} from '../../utils/tradingPlanCalculator.js'
import { mapSymbolToUpbitMarket } from '../../utils/upbitTickerUtils.js'
import {
  buildTradingPlanMonitorSnapshot,
  getPlanCardStatusLabel,
} from '../../utils/tradingPlanMonitor.js'
import TradingAlertSettings from './TradingAlertSettings.jsx'

/**
 * @param {{
 *   plan: import('../../services/tradingPlanStorage.js').TradingPlan,
 *   monitor: ReturnType<typeof buildTradingPlanMonitorSnapshot>,
 * }} props
 */
function PlanCardMetrics({ plan, monitor }) {
  if (plan.status === 'CLOSED') {
    return (
      <>
        <div>
          <dt>실제 진입</dt>
          <dd>{formatCurrency(plan.actualEntryPrice)}</dd>
        </div>
        <div>
          <dt>실제 청산</dt>
          <dd>{formatCurrency(plan.actualExitPrice)}</dd>
        </div>
        <div>
          <dt>실제 투자</dt>
          <dd>{formatCurrency(plan.actualInvestedAmount)}</dd>
        </div>
        <div>
          <dt>실제 손익</dt>
          <dd className="trading-desk__pnl--profit">{formatProfitLoss(plan.actualProfitLoss)}</dd>
        </div>
        <div>
          <dt>실제 수익률</dt>
          <dd>{formatPercent(plan.actualReturnRate)}</dd>
        </div>
        <div>
          <dt>손익비</dt>
          <dd>{formatRiskRewardRatio(plan.riskRewardRatio)}</dd>
        </div>
      </>
    )
  }

  if (plan.status === 'CANCELLED') {
    return (
      <>
        <div>
          <dt>진입</dt>
          <dd>{formatCurrency(plan.entryPrice)}</dd>
        </div>
        <div>
          <dt>손절</dt>
          <dd>{formatCurrency(plan.stopPrice)}</dd>
        </div>
        <div>
          <dt>목표</dt>
          <dd>{formatCurrency(plan.targetPrice)}</dd>
        </div>
      </>
    )
  }

  if (plan.status === 'ENTERED') {
    return (
      <>
        <div className="trading-desk__plan-grid-span">
          <dt>현재가</dt>
          <dd>
            {monitor.currentPriceLabel}
            {monitor.showStaleBadge ? (
              <span className="trading-desk__plan-stale">갱신 지연</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>계획 진입</dt>
          <dd>{formatCurrency(plan.entryPrice)}</dd>
        </div>
        <div>
          <dt>실제 진입</dt>
          <dd>{formatCurrency(plan.actualEntryPrice)}</dd>
        </div>
        <div>
          <dt>실제 투자</dt>
          <dd>{formatCurrency(plan.actualInvestedAmount)}</dd>
        </div>
        <div>
          <dt>손절</dt>
          <dd>{formatCurrency(plan.stopPrice)}</dd>
        </div>
        <div>
          <dt>목표</dt>
          <dd>{formatCurrency(plan.targetPrice)}</dd>
        </div>
        <div>
          <dt>평가수익률</dt>
          <dd>{monitor.unrealizedReturnLabel}</dd>
        </div>
        <div>
          <dt>평가손익</dt>
          <dd>{monitor.unrealizedProfitLabel}</dd>
        </div>
        {monitor.supported && monitor.quoteState !== 'unsupported' ? (
          <>
            <div>
              <dt>손절 거리</dt>
              <dd>{monitor.stopDistanceLabel}</dd>
            </div>
            <div>
              <dt>목표 거리</dt>
              <dd>{monitor.targetDistanceLabel}</dd>
            </div>
          </>
        ) : null}
      </>
    )
  }

  return (
    <>
      <div className="trading-desk__plan-grid-span">
        <dt>현재가</dt>
        <dd>
          {monitor.currentPriceLabel}
          {monitor.showStaleBadge ? (
            <span className="trading-desk__plan-stale">갱신 지연</span>
          ) : null}
        </dd>
      </div>
      <div>
        <dt>진입</dt>
        <dd>{formatCurrency(plan.entryPrice)}</dd>
      </div>
      <div>
        <dt>손절</dt>
        <dd>{formatCurrency(plan.stopPrice)}</dd>
      </div>
      <div>
        <dt>목표</dt>
        <dd>{formatCurrency(plan.targetPrice)}</dd>
      </div>
      {monitor.supported && monitor.quoteState !== 'unsupported' ? (
        <div>
          <dt>진입 거리</dt>
          <dd>{monitor.entryDistanceLabel}</dd>
        </div>
      ) : null}
      <div>
        <dt>예상손실</dt>
        <dd className="trading-desk__pnl--loss">
          {formatProfitLoss(-plan.expectedLoss)}
        </dd>
      </div>
      <div>
        <dt>예상수익</dt>
        <dd className="trading-desk__pnl--profit">
          {formatProfitLoss(plan.expectedProfit)}
        </dd>
      </div>
      <div>
        <dt>손익비</dt>
        <dd>{formatRiskRewardRatio(plan.riskRewardRatio)}</dd>
      </div>
    </>
  )
}

/**
 * @param {{
 *   plans: import('../../services/tradingPlanStorage.js').TradingPlan[],
 *   ticker: ReturnType<import('../../hooks/useUpbitTicker.js').useUpbitTicker>,
 *   alertEnabled: boolean,
 *   onToggleAlerts: () => void,
 *   onCreate: () => void,
 *   onOpenPlan: (plan: import('../../services/tradingPlanStorage.js').TradingPlan) => void,
 * }} props
 */
export default function TradingPlanSection({
  plans,
  ticker,
  alertEnabled,
  onToggleAlerts,
  onCreate,
  onOpenPlan,
}) {
  const recentPlans = getRecentTradingPlans(plans, 3)
  const hasPlans = recentPlans.length > 0
  const activePlans = getActiveTradingPlans(plans)

  const tickerContext = useMemo(
    () => ({
      isConnected: ticker.isConnected,
      connectionFailed: ticker.connectionFailed,
      getTickerForMarket: ticker.getTickerForMarket,
      now: ticker.now,
      formatPrice: formatCurrency,
    }),
    [
      ticker.isConnected,
      ticker.connectionFailed,
      ticker.getTickerForMarket,
      ticker.now,
    ],
  )

  const showConnectionStatus = activePlans.some((plan) =>
    Boolean(mapSymbolToUpbitMarket(plan.symbol)),
  )

  return (
    <section className="trading-desk__section trading-desk__plans" aria-label="매매 계획">
      <div className="trading-desk__plans-head">
        <div>
          <h2 className="trading-desk__section-title">매매 계획</h2>
          <p className="trading-desk__section-desc">
            매수하기 전에 진입·손절·목표를 정하고 예상 위험을 확인합니다.
          </p>
          {showConnectionStatus ? (
            <p
              className={`trading-desk__ticker-status trading-desk__ticker-status--${ticker.connectionState.toLowerCase()}`}
              role="status"
            >
              {ticker.connectionLabel}
            </p>
          ) : null}
          <TradingAlertSettings enabled={alertEnabled} onToggle={onToggleAlerts} />
        </div>
        {hasPlans ? (
          <button
            type="button"
            className="trading-desk__action trading-desk__action--primary"
            onClick={onCreate}
          >
            + 매매 계획
          </button>
        ) : null}
      </div>

      {!hasPlans ? (
        <div className="trading-desk__empty trading-desk__empty--center trading-desk__plans-empty">
          <button
            type="button"
            className="trading-desk__cta-btn"
            onClick={onCreate}
          >
            + 매매 계획
          </button>
        </div>
      ) : (
        <ul className="trading-desk__plan-list">
          {recentPlans.map((plan) => {
            const monitor = buildTradingPlanMonitorSnapshot(plan, tickerContext)
            const statusLabel = getPlanCardStatusLabel(plan, monitor)

            return (
              <li key={plan.id}>
                <button
                  type="button"
                  className="trading-desk__plan-card"
                  onClick={() => onOpenPlan(plan)}
                >
                  <div className="trading-desk__plan-card-head">
                    <span className="trading-desk__plan-symbol">{plan.symbol}</span>
                    <span className="trading-desk__plan-status">{statusLabel}</span>
                  </div>

                  <dl className="trading-desk__plan-grid">
                    <PlanCardMetrics plan={plan} monitor={monitor} />
                  </dl>

                  <span className="trading-desk__plan-link">상세/수정</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
