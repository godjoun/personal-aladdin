/**
 * StationPanel.jsx — 중앙 서버 연동 · 네트워크 참여
 */

import { useEffect, useState } from 'react'
import {
  registerStation,
  pushVaultToCentral,
  getStationCredentials,
  checkCentralHealth,
  getCentralAdminUrl,
} from '../services/stationClient.js'
import {
  getNetworkParticipationEnabled,
  NETWORK_PARTICIPATION_CHANGED,
  setNetworkParticipationEnabled,
} from '../services/networkParticipation.js'
import NetworkTargetControls from './NetworkTargetControls.jsx'
import {
  getNetworkTargetMode,
  getNetworkWindowDays,
  setNetworkTargetMode,
  setNetworkWindowDays,
} from '../services/rebalanceSettings.js'
import '../styles/StationPanel.css'

function StationPanel() {
  const [online, setOnline] = useState(false)
  const [credentials, setCredentials] = useState(getStationCredentials())
  const [stationName, setStationName] = useState('SECURE_STATION')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [participating, setParticipating] = useState(getNetworkParticipationEnabled)
  const [networkTargetMode, setNetworkTargetModeState] = useState(getNetworkTargetMode)
  const [networkWindowDays, setNetworkWindowDaysState] = useState(getNetworkWindowDays)

  useEffect(() => {
    checkCentralHealth().then(setOnline)
  }, [])

  useEffect(() => {
    function handleParticipationChange() {
      setParticipating(getNetworkParticipationEnabled())
    }

    window.addEventListener(NETWORK_PARTICIPATION_CHANGED, handleParticipationChange)
    return () => {
      window.removeEventListener(NETWORK_PARTICIPATION_CHANGED, handleParticipationChange)
    }
  }, [])

  async function handleRegister() {
    setLoading(true)
    setError('')
    setStatus('')

    try {
      const result = await registerStation(stationName.trim() || 'SECURE_STATION')
      setCredentials(result)
      setStatus('스테이션 등록 완료 — 이제 네트워크 참여를 켤 수 있습니다.')
      checkCentralHealth().then(setOnline)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function uploadToCentral() {
    const result = await pushVaultToCentral({ consentHostMonitoring: true })
    return (
      `업로드 완료 · 대조: ${result.reconciliation?.status ?? '—'}` +
      (result.reconciliation?.mismatchCount
        ? ` (불일치 ${result.reconciliation.mismatchCount}건)`
        : '')
    )
  }

  async function handleParticipationChange(checked) {
    setError('')
    setStatus('')

    if (!checked) {
      setParticipating(false)
      setNetworkParticipationEnabled(false)
      setStatus('네트워크 참여를 끔 — 개인 고정 전략 목표로 돌아갑니다.')
      return
    }

    if (!credentials?.stationKey) {
      setError('먼저 스테이션을 등록해 주세요.')
      return
    }

    if (!online) {
      setError('집계 서버가 꺼져 있어 참여할 수 없습니다.')
      return
    }

    setLoading(true)

    try {
      const message = await uploadToCentral()
      setParticipating(true)
      setNetworkParticipationEnabled(true)
      setStatus(
        `${message} · 그룹 목표 비중이 대시보드·리밸런싱에 자동 반영됩니다.`,
      )
    } catch (err) {
      setParticipating(false)
      setNetworkParticipationEnabled(false)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRetryPush() {
    if (!participating) return

    setLoading(true)
    setError('')
    setStatus('')

    try {
      setStatus(await uploadToCentral())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleNetworkTargetModeChange(mode) {
    setNetworkTargetMode(mode)
    setNetworkTargetModeState(mode)
  }

  function handleNetworkWindowDaysChange(days) {
    setNetworkWindowDays(days)
    setNetworkWindowDaysState(days)
  }

  return (
    <section className="station-panel" aria-label="네트워크 참여">
      <div className="station-panel__header">
        <h2 className="station-panel__title">Network Data Pool</h2>
        <span
          className={`station-panel__status${online ? ' station-panel__status--on' : ''}`}
        >
          {online ? 'HOST ONLINE' : 'HOST OFFLINE'}
        </span>
      </div>

      <p className="station-panel__desc">
        <strong>네트워크 참여</strong>를 켜면 비중 데이터가 그룹에 모이고,{' '}
        <strong>그룹 평균이 리밸런싱 목표로 자동 적용</strong>됩니다. (매매 실행
        없음 · 투자 권유 아님)
      </p>

      {!online && (
        <p className="station-panel__warn">
          서버가 꺼져 있어요. 배포 사이트에서는 보통 이 메시지가 없어야 정상입니다.
        </p>
      )}

      {credentials ? (
        <div className="station-panel__info">
          <p>
            <span className="station-panel__label">스테이션</span>
            {credentials.name}
          </p>
          <p className="station-panel__mono">ID: {credentials.stationId}</p>
        </div>
      ) : (
        <div className="station-panel__register">
          <label className="station-panel__label" htmlFor="station-name">
            스테이션 이름
          </label>
          <input
            id="station-name"
            className="station-panel__input"
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            placeholder="예: FRIEND_A_STATION"
          />
          <button
            type="button"
            className="station-panel__btn"
            onClick={handleRegister}
            disabled={loading || !online}
          >
            스테이션 등록
          </button>
        </div>
      )}

      <div className="station-panel__actions">
        {credentials && (
          <>
            <label className="station-panel__consent station-panel__consent--primary">
              <input
                type="checkbox"
                checked={participating}
                disabled={loading}
                onChange={(e) => handleParticipationChange(e.target.checked)}
              />
              <span>
                <strong>네트워크 참여</strong> — 비중·스냅샷을 익명 집계하고,{' '}
                <strong>그룹 평균 비중을 내 목표로 자동 적용</strong>합니다. 켜면
                즉시 업로드되며 시세 갱신마다 자동 반영됩니다.
              </span>
            </label>

            {participating && (
              <>
                <NetworkTargetControls
                  targetMode={networkTargetMode}
                  windowDays={networkWindowDays}
                  onTargetModeChange={handleNetworkTargetModeChange}
                  onWindowDaysChange={handleNetworkWindowDaysChange}
                />
                <button
                  type="button"
                  className="station-panel__link-btn"
                  onClick={handleRetryPush}
                  disabled={loading || !online}
                >
                  지금 다시 업로드
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
          집계 현황 콘솔 (관리자) →
        </a>
      </div>

      {status && <p className="station-panel__message">{status}</p>}
      {error && <p className="station-panel__error">{error}</p>}
    </section>
  )
}

export default StationPanel
