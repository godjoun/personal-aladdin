/**
 * PaperTradingCard.jsx — TRADING 화면 PAPER 카드
 */

import {
  formatCurrency,
  formatProfitLoss,
} from '../../utils/formatters.js'
import { formatPaperQuantity } from '../../utils/paperTradingCalculator.js'
import { resetPaperTrading } from '../../services/paperTradingStorage.js'

function getPnlClassName(value) {
  if (!Number.isFinite(Number(value)) || Number(value) === 0) return ''
  return Number(value) > 0
    ? 'trading-desk__pnl--profit'
    : 'trading-desk__pnl--loss'
}

/**
 * @param {{
 *   account: import('../../services/paperTradingStorage.js').PaperAccount | null,
 *   onStart: () => void,
 *   onBuy: () => void,
 *   onSell: () => void,
 *   onReset: () => void,
 * }} props
 */
export default function PaperTradingCard({
  account,
  onStart,
  onBuy,
  onSell,
  onReset,
}) {
  const hasAccount = Boolean(account)
  const position = account?.position ?? null
  const pnlClass = account
    ? getPnlClassName(account.realizedProfitLoss)
    : ''

  function handleReset() {
    if (
      !window.confirm(
        'PAPER 계좌를 초기화할까요?\n모든 PAPER 거래 기록이 삭제됩니다.',
      )
    ) {
      return
    }
    resetPaperTrading()
    onReset()
  }

  if (!hasAccount) {
    return (
      <aside
        className="trading-desk__section trading-desk__paper"
        aria-label="PAPER 모의투자"
      >
        <div className="trading-desk__paper-head">
          <h2 className="trading-desk__section-title">PAPER</h2>
          <span className="trading-desk__paper-badge">모의투자</span>
        </div>
        <p className="trading-desk__section-desc">
          가상자금으로 전략을 시험합니다. 실제 주문과 연동되지 않습니다.
        </p>
        <dl className="trading-desk__stats">
          <div>
            <dt>상태</dt>
            <dd>시작 전</dd>
          </div>
        </dl>
        <button
          type="button"
          className="trading-desk__action trading-desk__action--compact"
          onClick={onStart}
        >
          모의투자 시작
        </button>
      </aside>
    )
  }

  return (
    <aside
      className="trading-desk__section trading-desk__paper trading-desk__paper--active"
      aria-label="PAPER 모의투자"
    >
      <div className="trading-desk__paper-head">
        <h2 className="trading-desk__section-title">PAPER</h2>
        <span className="trading-desk__paper-badge">모의투자</span>
      </div>
      <p className="trading-desk__section-desc trading-desk__paper-note-inline">
        실제 거래가 아닌 가상 매매입니다.
      </p>

      <dl className="trading-desk__stats">
        {!position ? (
          <div>
            <dt>총 자산</dt>
            <dd>{formatCurrency(account.cash)}</dd>
          </div>
        ) : null}
        <div>
          <dt>현금</dt>
          <dd>{formatCurrency(account.cash)}</dd>
        </div>
        {position ? (
          <div>
            <dt>투자 중</dt>
            <dd>{formatCurrency(position.investedAmount)}</dd>
          </div>
        ) : null}
        <div>
          <dt>실현 손익</dt>
          <dd className={pnlClass}>{formatProfitLoss(account.realizedProfitLoss)}</dd>
        </div>
        <div>
          <dt>현재 포지션</dt>
          <dd>{position ? position.symbol : '없음'}</dd>
        </div>
        {position ? (
          <>
            <div>
              <dt>진입가</dt>
              <dd>{formatCurrency(position.entryPrice)}</dd>
            </div>
            <div>
              <dt>투자 금액</dt>
              <dd>{formatCurrency(position.investedAmount)}</dd>
            </div>
            <div>
              <dt>보유수량</dt>
              <dd>{formatPaperQuantity(position.quantity)}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {position ? (
        <button
          type="button"
          className="trading-desk__action trading-desk__action--compact"
          onClick={onSell}
        >
          가상 매도
        </button>
      ) : (
        <button
          type="button"
          className="trading-desk__action trading-desk__action--compact"
          onClick={onBuy}
        >
          가상 매수
        </button>
      )}

      <button
        type="button"
        className="trading-desk__paper-reset"
        onClick={handleReset}
      >
        PAPER 초기화
      </button>
    </aside>
  )
}
