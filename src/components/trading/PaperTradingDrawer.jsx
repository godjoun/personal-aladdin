/**
 * PaperTradingDrawer.jsx — PAPER 모의투자 side panel
 */

import { useEffect, useState } from 'react'
import {
  createPaperAccount,
  executePaperBuy,
  executePaperSell,
  getPaperAccount,
} from '../../services/paperTradingStorage.js'
import {
  validatePaperBuyInput,
  validatePaperInitialCapital,
  validatePaperSellInput,
} from '../../utils/paperTradingCalculator.js'

const EMPTY_BUY_FORM = {
  symbol: '',
  entryPrice: '',
  investedAmount: '',
}

const EMPTY_SELL_FORM = {
  exitPrice: '',
}

/**
 * @param {'start' | 'buy' | 'sell'} mode
 */
function getDrawerTitle(mode) {
  if (mode === 'start') return 'PAPER 모의투자 시작'
  if (mode === 'buy') return 'PAPER 가상 매수'
  return 'PAPER 가상 매도'
}

export default function PaperTradingDrawer({ open, mode, onClose, onChanged }) {
  const [initialCapital, setInitialCapital] = useState('1000000')
  const [buyForm, setBuyForm] = useState(EMPTY_BUY_FORM)
  const [sellForm, setSellForm] = useState(EMPTY_SELL_FORM)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!open) return undefined

    setErrors({})
    setSubmitError('')

    if (mode === 'start') {
      setInitialCapital('1000000')
    } else if (mode === 'buy') {
      setBuyForm(EMPTY_BUY_FORM)
    } else if (mode === 'sell') {
      setSellForm(EMPTY_SELL_FORM)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, mode, onClose])

  if (!open) return null

  const title = getDrawerTitle(mode)
  const account = getPaperAccount()
  const position = account?.position ?? null

  function handleStartSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    const validation = validatePaperInitialCapital(initialCapital)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    try {
      createPaperAccount(Number(initialCapital))
      onChanged?.()
      onClose?.()
    } catch {
      setSubmitError('PAPER 계좌를 만들지 못했습니다. 금액을 확인해 주세요.')
    }
  }

  function handleBuySubmit(event) {
    event.preventDefault()
    setSubmitError('')
    setErrors({})

    const validation = validatePaperBuyInput({
      ...buyForm,
      availableCash: account?.cash,
    })
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    const result = executePaperBuy({
      symbol: buyForm.symbol,
      entryPrice: Number(buyForm.entryPrice),
      investedAmount: Number(buyForm.investedAmount),
    })

    if (!result.ok) {
      if (result.errors) {
        setErrors(result.errors)
        return
      }
      setSubmitError(result.message ?? '가상 매수에 실패했습니다.')
      return
    }

    onChanged?.()
    onClose?.()
  }

  function handleSellSubmit(event) {
    event.preventDefault()
    setSubmitError('')
    setErrors({})

    const validation = validatePaperSellInput(sellForm)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    const result = executePaperSell({
      exitPrice: Number(sellForm.exitPrice),
    })

    if (!result.ok) {
      if (result.errors) {
        setErrors(result.errors)
        return
      }
      setSubmitError(result.message ?? '가상 매도에 실패했습니다.')
      return
    }

    onChanged?.()
    onClose?.()
  }

  return (
    <div
      className="trading-drawer-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="trading-drawer trading-drawer--paper"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="trading-drawer__header">
          <div>
            <p className="trading-drawer__paper-badge">모의투자 · PAPER</p>
            <h2 className="trading-drawer__title">{title}</h2>
          </div>
          <button
            type="button"
            className="trading-drawer__close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        {mode === 'start' ? (
          <form className="trading-drawer__form" onSubmit={handleStartSubmit}>
            <p className="trading-drawer__paper-note">
              실제 주문이나 거래소 연동 없이 가상자금으로만 매매를 연습합니다.
            </p>

            <label className="trading-drawer__field">
              <span>초기 가상자금 *</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={initialCapital}
                onChange={(event) => {
                  setInitialCapital(event.target.value)
                  setErrors((prev) => {
                    if (!prev.initialCapital) return prev
                    const next = { ...prev }
                    delete next.initialCapital
                    return next
                  })
                }}
              />
              {errors.initialCapital ? (
                <span className="trading-drawer__error">{errors.initialCapital}</span>
              ) : null}
            </label>

            {submitError ? (
              <p className="trading-drawer__error trading-drawer__error--submit">
                {submitError}
              </p>
            ) : null}

            <div className="trading-drawer__actions">
              <button type="button" className="trading-desk__action" onClick={onClose}>
                취소
              </button>
              <button
                type="submit"
                className="trading-desk__action trading-desk__action--primary"
              >
                시작
              </button>
            </div>
          </form>
        ) : null}

        {mode === 'buy' ? (
          <form className="trading-drawer__form" onSubmit={handleBuySubmit}>
            <p className="trading-drawer__paper-note">
              PAPER 계좌 현금:{' '}
              {account
                ? new Intl.NumberFormat('ko-KR', {
                    style: 'currency',
                    currency: 'KRW',
                    maximumFractionDigits: 0,
                  }).format(account.cash)
                : '—'}
            </p>

            <label className="trading-drawer__field">
              <span>코인 *</span>
              <input
                type="text"
                value={buyForm.symbol}
                onChange={(event) =>
                  setBuyForm((prev) => ({ ...prev, symbol: event.target.value }))
                }
                placeholder="BTC"
                autoComplete="off"
                maxLength={32}
              />
              {errors.symbol ? (
                <span className="trading-drawer__error">{errors.symbol}</span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>매수가 *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={buyForm.entryPrice}
                onChange={(event) =>
                  setBuyForm((prev) => ({ ...prev, entryPrice: event.target.value }))
                }
              />
              {errors.entryPrice ? (
                <span className="trading-drawer__error">{errors.entryPrice}</span>
              ) : null}
            </label>

            <label className="trading-drawer__field">
              <span>투자 금액 *</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={buyForm.investedAmount}
                onChange={(event) =>
                  setBuyForm((prev) => ({
                    ...prev,
                    investedAmount: event.target.value,
                  }))
                }
              />
              {errors.investedAmount ? (
                <span className="trading-drawer__error">{errors.investedAmount}</span>
              ) : null}
            </label>

            {submitError ? (
              <p className="trading-drawer__error trading-drawer__error--submit">
                {submitError}
              </p>
            ) : null}

            <div className="trading-drawer__actions">
              <button type="button" className="trading-desk__action" onClick={onClose}>
                취소
              </button>
              <button
                type="submit"
                className="trading-desk__action trading-desk__action--primary"
              >
                매수
              </button>
            </div>
          </form>
        ) : null}

        {mode === 'sell' && position ? (
          <form className="trading-drawer__form" onSubmit={handleSellSubmit}>
            <dl className="trading-drawer__detail-list trading-drawer__detail-list--compact">
              <div>
                <dt>보유 코인</dt>
                <dd>{position.symbol}</dd>
              </div>
              <div>
                <dt>진입가</dt>
                <dd>
                  {new Intl.NumberFormat('ko-KR', {
                    style: 'currency',
                    currency: 'KRW',
                    maximumFractionDigits: 0,
                  }).format(position.entryPrice)}
                </dd>
              </div>
              <div>
                <dt>투자 금액</dt>
                <dd>
                  {new Intl.NumberFormat('ko-KR', {
                    style: 'currency',
                    currency: 'KRW',
                    maximumFractionDigits: 0,
                  }).format(position.investedAmount)}
                </dd>
              </div>
            </dl>

            <p className="trading-drawer__paper-note">
              보유 포지션 전체를 매도합니다. 실시간 시세가 없으므로 매도가를 직접
              입력해 주세요.
            </p>

            <label className="trading-drawer__field">
              <span>매도가 *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={sellForm.exitPrice}
                onChange={(event) =>
                  setSellForm({ exitPrice: event.target.value })
                }
              />
              {errors.exitPrice ? (
                <span className="trading-drawer__error">{errors.exitPrice}</span>
              ) : null}
            </label>

            {submitError ? (
              <p className="trading-drawer__error trading-drawer__error--submit">
                {submitError}
              </p>
            ) : null}

            <div className="trading-drawer__actions">
              <button type="button" className="trading-desk__action" onClick={onClose}>
                취소
              </button>
              <button
                type="submit"
                className="trading-desk__action trading-desk__action--primary"
              >
                매도
              </button>
            </div>
          </form>
        ) : null}
      </aside>
    </div>
  )
}
