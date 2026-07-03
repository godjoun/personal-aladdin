/**
 * StationPanel.jsx — 네트워크 참여 통합 패널 (헤더)
 */

import { getCentralAdminUrl } from '../services/stationClient.js'
import { useStationPanel } from '../hooks/useStationPanel.js'
import { buildNetworkPanelStatus } from '../utils/stationPanelStatus.js'
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

  const panelStatus = buildNetworkPanelStatus({ online, credentials, participating })

  return (
    <section
      className={`station-panel station-panel--unified station-panel--${panelStatus.tone}`}
      id="network-data-pool"
      aria-label="네트워크 데이터 풀"
    >
      <div className="station-panel__main">
        <div className="station-panel__identity">
          <span className="station-panel__title">네트워크</span>
          <span
            className={`station-panel__state station-panel__state--${panelStatus.tone}`}
            title={panelStatus.detail}
          >
            {panelStatus.label}
          </span>
        </div>

        <div className="station-panel__actions">
          {!credentials ? (
            <>
              <input
                id="station-name"
                className="station-panel__input"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                placeholder="스테이션 이름"
                aria-label="스테이션 이름"
                disabled={!online || loading}
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
            <label
              className={`station-panel__participation${
                participating ? ' station-panel__participation--on' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={participating}
                disabled={loading || !online}
                onChange={(e) => handleParticipationChange(e.target.checked)}
              />
              <span>{participating ? '참여 중' : '참여하기'}</span>
            </label>
          )}

          {participating && (
            <details className="station-panel__details">
              <summary className="station-panel__details-summary">설정</summary>
              <div className="station-panel__details-body">
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
                  지금 업로드
                </button>
              </div>
            </details>
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
