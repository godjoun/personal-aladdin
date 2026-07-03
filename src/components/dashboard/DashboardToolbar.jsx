import { setAutoMarketRefreshEnabled } from '../../services/marketScheduleSettings.js'

const REFRESH_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
}

const REFRESH_BUTTON_LABELS = {
  [REFRESH_STATUS.IDLE]: '시세 갱신',
  [REFRESH_STATUS.LOADING]: '갱신 중…',
  [REFRESH_STATUS.SUCCESS]: '갱신 완료',
  [REFRESH_STATUS.ERROR]: '갱신 실패',
}

function DashboardToolbar({
  assetCount,
  priceCount,
  autoMarketRefresh,
  onAutoMarketRefreshChange,
  refreshStatus,
  onRefresh,
}) {
  return (
    <div className="dashboard__toolbar">
      <span className="dashboard__badge">
        보유 {assetCount}건 · 시세 {priceCount}건
      </span>
      <div className="dashboard__toolbar-actions">
        <label className="dashboard__auto-refresh">
          <input
            type="checkbox"
            checked={autoMarketRefresh}
            onChange={(e) => {
              const checked = e.target.checked
              setAutoMarketRefreshEnabled(checked)
              onAutoMarketRefreshChange?.(checked)
            }}
          />
          <span>
            자동 시세 갱신
            <small>평일 09:05 · 15:35</small>
          </span>
        </label>
        <button
          type="button"
          className={`dashboard__refresh-btn dashboard__refresh-btn--${refreshStatus}`}
          onClick={onRefresh}
          disabled={refreshStatus === REFRESH_STATUS.LOADING}
        >
          {REFRESH_BUTTON_LABELS[refreshStatus]}
        </button>
      </div>
    </div>
  )
}

export { REFRESH_STATUS }
export default DashboardToolbar
