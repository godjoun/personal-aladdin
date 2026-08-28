/**
 * TradingAlertSettings.jsx — 매매 계획 가격 알림 설정
 */

/**
 * @param {{
 *   enabled: boolean,
 *   onToggle: () => void,
 * }} props
 */
export default function TradingAlertSettings({ enabled, onToggle }) {
  return (
    <div className="trading-alert-settings">
      <button
        type="button"
        className={`trading-alert-settings__toggle${
          enabled ? ' trading-alert-settings__toggle--on' : ''
        }`}
        onClick={onToggle}
        aria-pressed={enabled}
      >
        가격 알림 {enabled ? 'ON' : '켜기'}
      </button>
      <p className="trading-alert-settings__hint">
        ALADDIN 실행 중에 가격을 감시합니다.
      </p>
    </div>
  )
}
