/**
 * TradingAlertToast.jsx — 매매 계획 가격 알림 toast
 */

import { formatAlertPrice } from '../../utils/tradingAlertUtils.js'

/**
 * @param {{
 *   toasts: Array<import('../../utils/tradingAlertUtils.js').TradingAlertEvent & { toastId?: string }>,
 *   onDismiss: (toastId: string) => void,
 * }} props
 */
export default function TradingAlertToast({ toasts, onDismiss }) {
  if (toasts.length === 0) return null

  return (
    <div className="trading-alert-toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <article key={toast.toastId ?? toast.id} className="trading-alert-toast">
          <div className="trading-alert-toast__body">
            <p className="trading-alert-toast__symbol">{toast.symbol}</p>
            <p className="trading-alert-toast__label">{toast.label}</p>
            <p className="trading-alert-toast__price">
              {formatAlertPrice(toast.triggerPrice)}
            </p>
          </div>
          <button
            type="button"
            className="trading-alert-toast__close"
            aria-label="알림 닫기"
            onClick={() => onDismiss(toast.toastId ?? toast.id)}
          >
            ×
          </button>
        </article>
      ))}
    </div>
  )
}
