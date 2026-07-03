/**
 * NetworkParticipationNudge.jsx — 네트워크 참여 유도 배너
 */

import { getStationCredentials } from '../services/stationClient.js'
import '../styles/NetworkParticipationNudge.css'

function NetworkParticipationNudge({ visible, onDismiss }) {
  if (!visible) {
    return null
  }

  const hasStation = Boolean(getStationCredentials()?.stationKey)

  return (
    <div className="network-nudge" role="alert" aria-live="polite">
      <div className="network-nudge__content">
        <p className="network-nudge__title">네트워크 데이터 수집 동의</p>
        <p className="network-nudge__text">
          {hasStation ? (
            <>
              자산·거래가 저장되었습니다. 그룹 비중 집계에 참여하려면 헤더 우측{' '}
              <strong>Network Data Pool</strong>에서 <strong>네트워크 참여</strong>를 켜 주세요.
              비중·스냅샷이 익명으로 업로드되며, 그룹 평균이 리밸런싱 목표로 적용됩니다.
            </>
          ) : (
            <>
              자산·거래가 저장되었습니다. 네트워크 데이터 수집에 참여하려면 헤더 우측{' '}
              <strong>Network Data Pool</strong>에서 스테이션을 등록한 뒤{' '}
              <strong>네트워크 참여</strong>를 켜 주세요.
            </>
          )}
        </p>
      </div>
      <div className="network-nudge__actions">
        <a className="network-nudge__link" href="#network-data-pool">
          설정으로 이동
        </a>
        <button type="button" className="network-nudge__dismiss" onClick={onDismiss}>
          닫기
        </button>
      </div>
    </div>
  )
}

export default NetworkParticipationNudge
