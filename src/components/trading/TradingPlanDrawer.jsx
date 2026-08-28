/**
 * TradingPlanDrawer.jsx — 매매 계획 side panel
 */

import { useEffect, useMemo, useState } from 'react'
import {
  addTradingPlan,
  cancelTradingPlan,
  deleteTradingPlan,
  recordPlanEntry,
  recordPlanExit,
  updateTradingPlan,
} from '../../services/tradingPlanStorage.js'
import {
  calculateTradingPlanMetrics,
  formatRiskRewardRatio,
  formatTradingPlanStatus,
  validatePlanEntryInput,
  validatePlanExitInput,
  validateTradingPlanInput,
} from '../../utils/tradingPlanCalculator.js'
import {
  buildTradingPlanMonitorSnapshot,
  getPlanCardStatusLabel,
  isPlanMonitorActive,
} from '../../utils/tradingPlanMonitor.js'
import {
  formatCurrency,
  formatPercent,
  formatProfitLoss,
} from '../../utils/formatters.js'

const EMPTY_FORM = {
  symbol: '',
  entryPrice: '',
  stopPrice: '',
  targetPrice: '',
  investedAmount: '',
  note: '',
}

const EMPTY_ENTRY_FORM = {
  actualEntryPrice: '',
  actualInvestedAmount: '',
  entryNote: '',
}

const EMPTY_EXIT_FORM = {
  actualExitPrice: '',
  exitNote: '',
}

/**
 * @param {import('../../services/tradingPlanStorage.js').TradingPlan} plan
 */
function planToForm(plan) {
  return {
    symbol: plan.symbol,
    entryPrice: String(plan.entryPrice),
    stopPrice: String(plan.stopPrice),
    targetPrice: String(plan.targetPrice),
    investedAmount: String(plan.investedAmount),
    note: plan.note,
  }
}

function getDrawerTitle(panelMode) {
  if (panelMode === 'view') return '매매 계획 상세'
  if (panelMode === 'edit') return '매매 계획 수정'
  if (panelMode === 'entry') return '진입 기록'
  if (panelMode === 'exit') return '청산 기록'
  return '매매 계획'
}

export default function TradingPlanDrawer({
  open,
  mode = 'create',
  plan = null,
  ticker = null,
  onClose,
  onSaved,
  onDeleted,
}) {
  const [panelMode, setPanelMode] = useState(mode)
  const [form, setForm] = useState(EMPTY_FORM)
  const [entryForm, setEntryForm] = useState(EMPTY_ENTRY_FORM)
  const [exitForm, setExitForm] = useState(EMPTY_EXIT_FORM)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!open) return undefined

    setPanelMode(mode)
    setErrors({})
    setSubmitError('')
    setEntryForm(EMPTY_ENTRY_FORM)
    setExitForm(EMPTY_EXIT_FORM)

    if (mode === 'create' || !plan) {
      setForm(EMPTY_FORM)
    } else {
      setForm(planToForm(plan))
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, mode, plan, onClose])

  const previewMetrics = useMemo(() => {
    if (panelMode === 'view' || panelMode === 'entry' || panelMode === 'exit') {
      return null
    }
    const validation = validateTradingPlanInput(form)
    if (!validation.ok) return null
    return calculateTradingPlanMetrics(form)
  }, [form, panelMode])

  const monitorSnapshot = useMemo(() => {
    if (!plan || !ticker || !isPlanMonitorActive(plan)) return null
    if (!['view', 'entry', 'exit'].includes(panelMode)) return null
    return buildTradingPlanMonitorSnapshot(plan, {
      isConnected: ticker.isConnected,
      connectionFailed: ticker.connectionFailed,
      getTickerForMarket: ticker.getTickerForMarket,
      now: ticker.now,
      formatPrice: formatCurrency,
    })
  }, [panelMode, plan, ticker])

  if (!open) return null

  const isView = panelMode === 'view'
  const isEdit = panelMode === 'edit'
  const isCreate = panelMode === 'create'
  const isEntry = panelMode === 'entry'
  const isExit = panelMode === 'exit'
  const title = getDrawerTitle(panelMode)
  const displayPlan = plan && ['view', 'entry', 'exit'].includes(panelMode) ? plan : null

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function openEntryMode() {
    if (!plan) return
    const suggestedPrice =
      monitorSnapshot?.isLiveQuote && monitorSnapshot.currentPrice != null
        ? String(monitorSnapshot.currentPrice)
        : ''
    setEntryForm({
      actualEntryPrice: suggestedPrice,
      actualInvestedAmount: String(plan.investedAmount),
      entryNote: '',
    })
    setErrors({})
    setSubmitError('')
    setPanelMode('entry')
  }

  function openExitMode() {
    if (!plan) return
    const suggestedPrice =
      monitorSnapshot?.isLiveQuote && monitorSnapshot.currentPrice != null
        ? String(monitorSnapshot.currentPrice)
        : ''
    setExitForm({
      actualExitPrice: suggestedPrice,
      exitNote: '',
    })
    setErrors({})
    setSubmitError('')
    setPanelMode('exit')
  }

  function handleCancelEdit() {
    if (mode === 'view' && plan) {
      if (isEntry || isExit) {
        setPanelMode('view')
        setErrors({})
        setSubmitError('')
        return
      }
      if (isEdit) {
        setPanelMode('view')
        setForm(planToForm(plan))
        setErrors({})
        setSubmitError('')
        return
      }
    }
    onClose?.()
  }

  function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    const validation = validateTradingPlanInput(form)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    const payload = {
      symbol: form.symbol,
      entryPrice: Number(form.entryPrice),
      stopPrice: Number(form.stopPrice),
      targetPrice: Number(form.targetPrice),
      investedAmount: Number(form.investedAmount),
      note: form.note,
    }

    try {
      if (isCreate) {
        addTradingPlan(payload)
      } else if (plan?.id) {
        const updated = updateTradingPlan(plan.id, payload)
        if (!updated) {
          setSubmitError('매매 계획을 찾을 수 없습니다. 목록을 새로고침해 주세요.')
          return
        }
      }
      onSaved?.()
    } catch (error) {
      if (error instanceof Error && error.message.includes('WAITING')) {
        setSubmitError('진입 대기 상태의 계획만 수정할 수 있습니다.')
        return
      }
      setSubmitError('매매 계획을 저장하지 못했습니다. 입력값을 확인해 주세요.')
    }
  }

  function handleEntrySubmit(event) {
    event.preventDefault()
    setSubmitError('')

    const validation = validatePlanEntryInput(entryForm)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    if (!plan?.id) return

    try {
      const updated = recordPlanEntry(plan.id, {
        actualEntryPrice: Number(entryForm.actualEntryPrice),
        actualInvestedAmount: Number(entryForm.actualInvestedAmount),
        entryNote: entryForm.entryNote,
      })
      if (!updated) {
        setSubmitError('매매 계획을 찾을 수 없습니다.')
        return
      }
      onSaved?.()
    } catch {
      setSubmitError('진입 기록을 저장하지 못했습니다. 입력값을 확인해 주세요.')
    }
  }

  function handleExitSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    const validation = validatePlanExitInput(exitForm)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    if (!plan?.id) return

    try {
      const result = recordPlanExit(plan.id, {
        actualExitPrice: Number(exitForm.actualExitPrice),
        exitNote: exitForm.exitNote,
      })
      if (!result?.plan) {
        setSubmitError('매매 계획을 찾을 수 없습니다.')
        return
      }
      if (result.tradeSync.status === 'failed') {
        setSubmitError(
          '청산 기록은 저장되었지만 매매일지 생성에 실패했습니다.',
        )
      }
      onSaved?.(result)
    } catch {
      setSubmitError('청산 기록을 저장하지 못했습니다. 입력값을 확인해 주세요.')
    }
  }

  function handleCancelPlan() {
    if (!plan?.id) return
    if (!window.confirm('이 매매 계획을 취소할까요?')) return

    try {
      const cancelled = cancelTradingPlan(plan.id)
      if (!cancelled) {
        setSubmitError('매매 계획을 취소하지 못했습니다.')
        return
      }
      onSaved?.()
    } catch {
      setSubmitError('진입 대기 상태의 계획만 취소할 수 있습니다.')
    }
  }

  function handleDelete() {
    if (!plan?.id) return

    const message =
      plan.status === 'ENTERED'
        ? '보유 중인 계획을 삭제하면 진입·청산 기록이 함께 삭제됩니다. 정말 삭제할까요?'
        : '이 매매 계획을 삭제할까요?'

    if (!window.confirm(message)) return

    const deleted = deleteTradingPlan(plan.id)
    if (!deleted) {
      setSubmitError('매매 계획을 찾을 수 없습니다. 목록을 새로고침해 주세요.')
      return
    }
    onDeleted?.()
  }

  const lossClass = 'trading-desk__pnl--loss'
  const profitClass = 'trading-desk__pnl--profit'

  return (
    <div
      className="trading-drawer-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="trading-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="trading-drawer__header">
          <h2 className="trading-drawer__title">{title}</h2>
          <button
            type="button"
            className="trading-drawer__close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        {isView && displayPlan ? (
          <div className="trading-drawer__detail">
            <dl className="trading-drawer__detail-list">
              <div>
                <dt>코인</dt>
                <dd>{displayPlan.symbol}</dd>
              </div>
              <div>
                <dt>상태</dt>
                <dd>
                  {monitorSnapshot
                    ? getPlanCardStatusLabel(displayPlan, monitorSnapshot)
                    : formatTradingPlanStatus(displayPlan.status)}
                </dd>
              </div>

              {monitorSnapshot && displayPlan.status !== 'CLOSED' && displayPlan.status !== 'CANCELLED' ? (
                <>
                  <div>
                    <dt>현재가</dt>
                    <dd>
                      {monitorSnapshot.currentPriceLabel}
                      {monitorSnapshot.showStaleBadge ? ' (갱신 지연)' : ''}
                    </dd>
                  </div>
                  {displayPlan.status === 'WAITING' &&
                  monitorSnapshot.supported &&
                  monitorSnapshot.quoteState !== 'unsupported' ? (
                    <div>
                      <dt>진입 거리</dt>
                      <dd>{monitorSnapshot.entryDistanceLabel}</dd>
                    </div>
                  ) : null}
                  {displayPlan.status === 'ENTERED' &&
                  monitorSnapshot.supported &&
                  monitorSnapshot.quoteState !== 'unsupported' ? (
                    <>
                      <div>
                        <dt>손절 거리</dt>
                        <dd>{monitorSnapshot.stopDistanceLabel}</dd>
                      </div>
                      <div>
                        <dt>목표 거리</dt>
                        <dd>{monitorSnapshot.targetDistanceLabel}</dd>
                      </div>
                      <div>
                        <dt>평가수익률</dt>
                        <dd>{monitorSnapshot.unrealizedReturnLabel}</dd>
                      </div>
                      <div>
                        <dt>평가손익</dt>
                        <dd>{monitorSnapshot.unrealizedProfitLabel}</dd>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}

              <div>
                <dt>계획 진입가</dt>
                <dd>{formatCurrency(displayPlan.entryPrice)}</dd>
              </div>
              <div>
                <dt>손절가</dt>
                <dd>{formatCurrency(displayPlan.stopPrice)}</dd>
              </div>
              <div>
                <dt>목표가</dt>
                <dd>{formatCurrency(displayPlan.targetPrice)}</dd>
              </div>
              <div>
                <dt>계획 투자 금액</dt>
                <dd>{formatCurrency(displayPlan.investedAmount)}</dd>
              </div>

              {displayPlan.actualEntryPrice != null ? (
                <>
                  <div>
                    <dt>실제 진입가</dt>
                    <dd>{formatCurrency(displayPlan.actualEntryPrice)}</dd>
                  </div>
                  <div>
                    <dt>실제 투자금액</dt>
                    <dd>{formatCurrency(displayPlan.actualInvestedAmount)}</dd>
                  </div>
                  <div>
                    <dt>진입 메모</dt>
                    <dd>{displayPlan.entryNote || '—'}</dd>
                  </div>
                </>
              ) : null}

              {displayPlan.actualExitPrice != null ? (
                <>
                  <div>
                    <dt>실제 청산가</dt>
                    <dd>{formatCurrency(displayPlan.actualExitPrice)}</dd>
                  </div>
                  <div>
                    <dt>실제 수익률</dt>
                    <dd>{formatPercent(displayPlan.actualReturnRate)}</dd>
                  </div>
                  <div>
                    <dt>실제 손익</dt>
                    <dd>{formatProfitLoss(displayPlan.actualProfitLoss)}</dd>
                  </div>
                  <div>
                    <dt>청산 메모</dt>
                    <dd>{displayPlan.exitNote || '—'}</dd>
                  </div>
                </>
              ) : null}

              {displayPlan.status === 'WAITING' ? (
                <>
                  <div>
                    <dt>손절률</dt>
                    <dd className={lossClass}>
                      {formatPercent(displayPlan.stopLossRate)}
                    </dd>
                  </div>
                  <div>
                    <dt>예상 손실</dt>
                    <dd className={lossClass}>
                      {formatProfitLoss(-displayPlan.expectedLoss)}
                    </dd>
                  </div>
                  <div>
                    <dt>목표 수익률</dt>
                    <dd className={profitClass}>
                      {formatPercent(displayPlan.targetReturnRate)}
                    </dd>
                  </div>
                  <div>
                    <dt>예상 수익</dt>
                    <dd className={profitClass}>
                      {formatProfitLoss(displayPlan.expectedProfit)}
                    </dd>
                  </div>
                  <div>
                    <dt>손익비</dt>
                    <dd>{formatRiskRewardRatio(displayPlan.riskRewardRatio)}</dd>
                  </div>
                </>
              ) : null}

              <div>
                <dt>계획 메모</dt>
                <dd>{displayPlan.note || '—'}</dd>
              </div>
            </dl>

            {submitError ? (
              <p className="trading-drawer__error trading-drawer__error--submit">
                {submitError}
              </p>
            ) : null}

            <div className="trading-drawer__actions trading-drawer__actions--stack">
              {displayPlan.status === 'WAITING' ? (
                <>
                  <button
                    type="button"
                    className="trading-desk__action trading-desk__action--primary"
                    onClick={openEntryMode}
                  >
                    진입 기록
                  </button>
                  <button
                    type="button"
                    className="trading-desk__action"
                    onClick={() => setPanelMode('edit')}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="trading-desk__action"
                    onClick={handleCancelPlan}
                  >
                    계획 취소
                  </button>
                </>
              ) : null}
              {displayPlan.status === 'ENTERED' ? (
                <button
                  type="button"
                  className="trading-desk__action trading-desk__action--primary"
                  onClick={openExitMode}
                >
                  청산 기록
                </button>
              ) : null}
              <button
                type="button"
                className="trading-desk__action trading-desk__action--danger"
                onClick={handleDelete}
              >
                삭제
              </button>
              <button type="button" className="trading-desk__action" onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        ) : null}

        {isEntry && displayPlan ? (
          <form className="trading-drawer__form" onSubmit={handleEntrySubmit}>
            <p className="trading-drawer__plan-note">
              실제 거래소에서 매수한 사실만 기록합니다. ALADDIN은 주문하지
              않습니다.
            </p>

            <label className="trading-drawer__field">
              <span>실제 진입가 *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={entryForm.actualEntryPrice}
                onChange={(event) =>
                  setEntryForm((prev) => ({
                    ...prev,
                    actualEntryPrice: event.target.value,
                  }))
                }
              />
              {errors.actualEntryPrice ? (
                <span className="trading-drawer__error">{errors.actualEntryPrice}</span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>실제 투자금액 *</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={entryForm.actualInvestedAmount}
                onChange={(event) =>
                  setEntryForm((prev) => ({
                    ...prev,
                    actualInvestedAmount: event.target.value,
                  }))
                }
              />
              {errors.actualInvestedAmount ? (
                <span className="trading-drawer__error">
                  {errors.actualInvestedAmount}
                </span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>진입 메모</span>
              <textarea
                rows={2}
                value={entryForm.entryNote}
                onChange={(event) =>
                  setEntryForm((prev) => ({ ...prev, entryNote: event.target.value }))
                }
                maxLength={500}
              />
            </label>

            {submitError ? (
              <p className="trading-drawer__error trading-drawer__error--submit">
                {submitError}
              </p>
            ) : null}

            <div className="trading-drawer__actions">
              <button type="button" className="trading-desk__action" onClick={handleCancelEdit}>
                취소
              </button>
              <button
                type="submit"
                className="trading-desk__action trading-desk__action--primary"
              >
                저장
              </button>
            </div>
          </form>
        ) : null}

        {isExit && displayPlan ? (
          <form className="trading-drawer__form" onSubmit={handleExitSubmit}>
            <p className="trading-drawer__plan-note">
              실제 거래소에서 청산한 사실만 기록합니다.
            </p>

            <label className="trading-drawer__field">
              <span>실제 청산가 *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={exitForm.actualExitPrice}
                onChange={(event) =>
                  setExitForm((prev) => ({
                    ...prev,
                    actualExitPrice: event.target.value,
                  }))
                }
              />
              {errors.actualExitPrice ? (
                <span className="trading-drawer__error">{errors.actualExitPrice}</span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>청산 메모</span>
              <textarea
                rows={2}
                value={exitForm.exitNote}
                onChange={(event) =>
                  setExitForm((prev) => ({ ...prev, exitNote: event.target.value }))
                }
                maxLength={500}
              />
            </label>

            {submitError ? (
              <p className="trading-drawer__error trading-drawer__error--submit">
                {submitError}
              </p>
            ) : null}

            <div className="trading-drawer__actions">
              <button type="button" className="trading-desk__action" onClick={handleCancelEdit}>
                취소
              </button>
              <button
                type="submit"
                className="trading-desk__action trading-desk__action--primary"
              >
                저장
              </button>
            </div>
          </form>
        ) : null}

        {isCreate || isEdit ? (
          <form className="trading-drawer__form" onSubmit={handleSubmit}>
            <p className="trading-drawer__plan-note">
              ALADDIN은 매수·매도를 추천하지 않습니다. 입력한 계획의 위험과
              보상만 계산합니다.
            </p>

            <label className="trading-drawer__field">
              <span>코인 *</span>
              <input
                type="text"
                value={form.symbol}
                onChange={(event) => updateField('symbol', event.target.value)}
                placeholder="BTC"
                autoComplete="off"
                maxLength={32}
              />
              {errors.symbol ? (
                <span className="trading-drawer__error">{errors.symbol}</span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>진입가 *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.entryPrice}
                onChange={(event) =>
                  updateField('entryPrice', event.target.value)
                }
              />
              {errors.entryPrice ? (
                <span className="trading-drawer__error">{errors.entryPrice}</span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>손절가 *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.stopPrice}
                onChange={(event) =>
                  updateField('stopPrice', event.target.value)
                }
              />
              {errors.stopPrice ? (
                <span className="trading-drawer__error">{errors.stopPrice}</span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>목표가 *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.targetPrice}
                onChange={(event) =>
                  updateField('targetPrice', event.target.value)
                }
              />
              {errors.targetPrice ? (
                <span className="trading-drawer__error">{errors.targetPrice}</span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>투자 금액 *</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={form.investedAmount}
                onChange={(event) =>
                  updateField('investedAmount', event.target.value)
                }
              />
              {errors.investedAmount ? (
                <span className="trading-drawer__error">
                  {errors.investedAmount}
                </span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>계획 메모</span>
              <textarea
                rows={2}
                value={form.note}
                onChange={(event) => updateField('note', event.target.value)}
                maxLength={500}
              />
            </label>

            {previewMetrics ? (
              <dl className="trading-drawer__plan-preview">
                <div>
                  <dt>손절 시</dt>
                  <dd className={lossClass}>
                    {formatPercent(previewMetrics.stopLossRate)}{' '}
                    {formatProfitLoss(-previewMetrics.expectedLoss)}
                  </dd>
                </div>
                <div>
                  <dt>목표 도달 시</dt>
                  <dd className={profitClass}>
                    {formatPercent(previewMetrics.targetReturnRate)}{' '}
                    {formatProfitLoss(previewMetrics.expectedProfit)}
                  </dd>
                </div>
                <div>
                  <dt>손익비</dt>
                  <dd>{formatRiskRewardRatio(previewMetrics.riskRewardRatio)}</dd>
                </div>
              </dl>
            ) : null}

            {submitError ? (
              <p className="trading-drawer__error trading-drawer__error--submit">
                {submitError}
              </p>
            ) : null}

            <div className="trading-drawer__actions">
              <button
                type="button"
                className="trading-desk__action"
                onClick={handleCancelEdit}
              >
                {(isCreate || (isEdit && mode === 'view')) ? '취소' : '닫기'}
              </button>
              <button
                type="submit"
                className="trading-desk__action trading-desk__action--primary"
              >
                저장
              </button>
            </div>
          </form>
        ) : null}
      </aside>
    </div>
  )
}
