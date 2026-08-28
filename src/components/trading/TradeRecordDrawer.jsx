/**
 * TradeRecordDrawer.jsx — 거래 기록 side panel (생성 / 상세 / 수정)
 */

import { useEffect, useState } from 'react'
import {
  TRADING_TRADE_TAGS,
  addTradingTrade,
  deleteTradingTrade,
  updateTradingTrade,
} from '../../services/tradingTradeStorage.js'
import {
  formatTradeDateTime,
  validateTradeInput,
} from '../../utils/tradingTradeCalculator.js'
import {
  formatCurrency,
  formatPercent,
  formatProfitLoss,
} from '../../utils/formatters.js'

const EMPTY_FORM = {
  symbol: '',
  entryPrice: '',
  exitPrice: '',
  investedAmount: '',
  entryReason: '',
  review: '',
  tags: [],
}

/**
 * @param {import('../../services/tradingTradeStorage.js').TradingTrade} trade
 */
function tradeToForm(trade) {
  return {
    symbol: trade.symbol,
    entryPrice: String(trade.entryPrice),
    exitPrice: String(trade.exitPrice),
    investedAmount: String(trade.investedAmount),
    entryReason: trade.entryReason,
    review: trade.review,
    tags: [...trade.tags],
  }
}

function getDrawerTitle(mode) {
  if (mode === 'view') return '거래 상세'
  if (mode === 'edit') return '거래 수정'
  return '거래 기록'
}

function getPnlClassName(value) {
  if (!Number.isFinite(Number(value)) || Number(value) === 0) return ''
  return Number(value) > 0
    ? 'trading-desk__pnl--profit'
    : 'trading-desk__pnl--loss'
}

export default function TradeRecordDrawer({
  open,
  mode = 'create',
  trade = null,
  onClose,
  onSaved,
  onDeleted,
}) {
  const [panelMode, setPanelMode] = useState(mode)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!open) return undefined

    setPanelMode(mode)
    setErrors({})
    setSubmitError('')

    if (mode === 'create' || !trade) {
      setForm(EMPTY_FORM)
    } else {
      setForm(tradeToForm(trade))
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, mode, trade, onClose])

  if (!open) return null

  const isView = panelMode === 'view'
  const isEdit = panelMode === 'edit'
  const isCreate = panelMode === 'create'
  const title = getDrawerTitle(panelMode)

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function toggleTag(tag) {
    setForm((prev) => {
      const has = prev.tags.includes(tag)
      return {
        ...prev,
        tags: has ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
      }
    })
  }

  function handleCancelEdit() {
    if (mode === 'view' && trade) {
      setPanelMode('view')
      setForm(tradeToForm(trade))
      setErrors({})
      setSubmitError('')
      return
    }
    onClose?.()
  }

  function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    const validation = validateTradeInput(form)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    const payload = {
      symbol: form.symbol,
      entryPrice: Number(form.entryPrice),
      exitPrice: Number(form.exitPrice),
      investedAmount: Number(form.investedAmount),
      entryReason: form.entryReason,
      review: form.review,
      tags: form.tags,
    }

    try {
      if (isCreate) {
        addTradingTrade(payload)
      } else if (trade?.id) {
        const updated = updateTradingTrade(trade.id, payload)
        if (!updated) {
          setSubmitError('거래를 찾을 수 없습니다. 목록을 새로고침해 주세요.')
          return
        }
      }
      onSaved?.()
    } catch {
      setSubmitError('거래를 저장하지 못했습니다. 입력값을 확인해 주세요.')
    }
  }

  function handleDelete() {
    if (!trade?.id) return
    if (!window.confirm('이 거래 기록을 삭제할까요?')) return

    const deleted = deleteTradingTrade(trade.id)
    if (!deleted) {
      setSubmitError('거래를 찾을 수 없습니다. 목록을 새로고침해 주세요.')
      return
    }
    onDeleted?.()
  }

  const pnlClass = trade ? getPnlClassName(trade.profitLoss) : ''

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

        {isView && trade ? (
          <div className="trading-drawer__detail">
            <dl className="trading-drawer__detail-list">
              <div>
                <dt>코인</dt>
                <dd>{trade.symbol}</dd>
              </div>
              <div>
                <dt>거래 날짜</dt>
                <dd>{formatTradeDateTime(trade.tradedAt)}</dd>
              </div>
              <div>
                <dt>진입 가격</dt>
                <dd>{formatCurrency(trade.entryPrice)}</dd>
              </div>
              <div>
                <dt>청산 가격</dt>
                <dd>{formatCurrency(trade.exitPrice)}</dd>
              </div>
              <div>
                <dt>투자 금액</dt>
                <dd>{formatCurrency(trade.investedAmount)}</dd>
              </div>
              <div>
                <dt>수익률</dt>
                <dd className={pnlClass}>{formatPercent(trade.returnRate)}</dd>
              </div>
              <div>
                <dt>손익</dt>
                <dd className={pnlClass}>{formatProfitLoss(trade.profitLoss)}</dd>
              </div>
              <div>
                <dt>진입 이유</dt>
                <dd>{trade.entryReason || '—'}</dd>
              </div>
              <div>
                <dt>복기</dt>
                <dd>{trade.review || '—'}</dd>
              </div>
              <div>
                <dt>태그</dt>
                <dd>{trade.tags.length > 0 ? trade.tags.join(', ') : '—'}</dd>
              </div>
            </dl>

            {submitError ? (
              <p className="trading-drawer__error trading-drawer__error--submit">
                {submitError}
              </p>
            ) : null}

            <div className="trading-drawer__actions">
              <button
                type="button"
                className="trading-desk__action trading-desk__action--danger"
                onClick={handleDelete}
              >
                삭제
              </button>
              <button
                type="button"
                className="trading-desk__action"
                onClick={onClose}
              >
                닫기
              </button>
              <button
                type="button"
                className="trading-desk__action trading-desk__action--primary"
                onClick={() => setPanelMode('edit')}
              >
                수정
              </button>
            </div>
          </div>
        ) : (
          <form className="trading-drawer__form" onSubmit={handleSubmit}>
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
              <span>진입 가격 *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.entryPrice}
                onChange={(event) => updateField('entryPrice', event.target.value)}
              />
              {errors.entryPrice ? (
                <span className="trading-drawer__error">{errors.entryPrice}</span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>청산 가격 *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.exitPrice}
                onChange={(event) => updateField('exitPrice', event.target.value)}
              />
              {errors.exitPrice ? (
                <span className="trading-drawer__error">{errors.exitPrice}</span>
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
              <span>진입 이유</span>
              <textarea
                rows={2}
                value={form.entryReason}
                onChange={(event) =>
                  updateField('entryReason', event.target.value)
                }
                maxLength={500}
              />
            </label>

            <label className="trading-drawer__field">
              <span>복기</span>
              <textarea
                rows={3}
                value={form.review}
                onChange={(event) => updateField('review', event.target.value)}
                maxLength={1000}
              />
            </label>

            <fieldset className="trading-drawer__tags">
              <legend>태그</legend>
              <div className="trading-drawer__tag-list">
                {TRADING_TRADE_TAGS.map((tag) => (
                  <label key={tag} className="trading-drawer__tag">
                    <input
                      type="checkbox"
                      checked={form.tags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                    />
                    <span>{tag}</span>
                  </label>
                ))}
              </div>
            </fieldset>

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
        )}
      </aside>
    </div>
  )
}
