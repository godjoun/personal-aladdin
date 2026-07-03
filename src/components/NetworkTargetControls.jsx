/**
 * NetworkTargetControls.jsx — 네트워크 리밸런싱 목표 방식 선택 (Phase 2)
 */

import '../styles/Dashboard.css'

function NetworkTargetControls({
  targetMode = 'latest',
  windowDays = 30,
  onTargetModeChange,
  onWindowDaysChange,
}) {
  return (
    <div className="dashboard__network-target">
      <div
        className="dashboard__network-target-mode"
        role="group"
        aria-label="네트워크 목표 방식"
      >
        <button
          type="button"
          className={`dashboard__network-target-btn${
            targetMode === 'latest' ? ' dashboard__network-target-btn--active' : ''
          }`}
          onClick={() => onTargetModeChange?.('latest')}
        >
          최신
        </button>
        <button
          type="button"
          className={`dashboard__network-target-btn${
            targetMode === 'average' ? ' dashboard__network-target-btn--active' : ''
          }`}
          onClick={() => onTargetModeChange?.('average')}
        >
          N일 평균
        </button>
      </div>

      {targetMode === 'average' && (
        <label className="dashboard__network-window">
          <span className="dashboard__network-window-label">기간</span>
          <select
            className="dashboard__network-window-select"
            value={windowDays}
            onChange={(event) => onWindowDaysChange?.(Number(event.target.value))}
          >
            <option value={7}>7일</option>
            <option value={14}>14일</option>
            <option value={30}>30일</option>
          </select>
        </label>
      )}
    </div>
  )
}

export default NetworkTargetControls
