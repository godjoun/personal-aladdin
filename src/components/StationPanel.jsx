/**
 * StationPanel.jsx — 네트워크 참여 (헤더 우측 컴팩트)
 */

import { getCentralAdminUrl } from '../services/stationClient.js'
import { useStationPanel } from '../hooks/useStationPanel.js'
import NetworkTargetControls from './NetworkTargetControls.jsx'
import '../styles/StationPanel.css'

function StationPanel() {
  const {
    online,
    credentials,
    stationName,
    setStationName,
    status,
    error,
    loading,
    participating,
    networkTargetMode,
    networkWindowDays,
    handleRegister,
    handleParticipationChange,
    handleRetryPush,
    handleNetworkTargetModeChange,
    handleNetworkWindowDaysChange,
  } = useStationPanel()

  return (
    <section className="station-panel station-panel--compact" aria-label="네트워크 데이터 풀">
      <div className="station-panel__row">
        <div className="station-panel__brand">
          <span className="station-panel__title">Network Data Pool</span>
          <span
            className={`station-panel__status${online ? ' station-panel__status--on' : ''}`}
          >
            {online ? '연결됨' : '오프라인'}
          </span>
        </div>

        <div className="station-panel__controls">
          {!credentials ? (
            <>
              <input
                id="station-name"
                className="station-panel__input station-panel__input--inline"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                placeholder="스테이션 이름"
                aria-label="스테이션 이름"
              />
              <button
                type="button"
                className="station-panel__btn station-panel__btn--primary"
                onClick={handleRegister}
                disabled={loading || !online}
              >
                등록
              </button>
            </>
          ) : (
            <>
              <span className="station-panel__station" title={credentials.stationId}>
                {credentials.name}
              </span>
              <label className="station-panel__toggle">
                <input
                  type="checkbox"
                  checked={participating}
                  disabled={loading}
                  onChange={(e) => handleParticipationChange(e.target.checked)}
                />
                <span>네트워크 참여</span>
              </label>
              {participating && (
                <>
                  <NetworkTargetControls
                    compact
                    targetMode={networkTargetMode}
                    windowDays={networkWindowDays}
                    onTargetModeChange={handleNetworkTargetModeChange}
                    onWindowDaysChange={handleNetworkWindowDaysChange}
                  />
                  <button
                    type="button"
                    className="station-panel__btn"
                    onClick={handleRetryPush}
                    disabled={loading || !online}
                  >
                    업로드
                  </button>
                </>
              )}
            </>
          )}

          <a
            className="station-panel__link"
            href={getCentralAdminUrl()}
            target="_blank"
            rel="noreferrer"
          >
            관리자
          </a>
        </div>
      </div>

      {(status || error) && (
        <p className={`station-panel__feedback${error ? ' station-panel__feedback--error' : ''}`}>
          {error || status}
        </p>
      )}
    </section>
  )
}

export default StationPanel
