/**
 * StationPanel.jsx — 중앙 서버 연동 UI
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
  getHostConsentSaved,
  setAutoUploadEnabled,
  setHostConsentSaved,
} from '../services/rebalanceSettings.js'
import '../styles/StationPanel.css'

function StationPanel() {
  const [online, setOnline] = useState(false)
  const [credentials, setCredentials] = useState(getStationCredentials())
  const [stationName, setStationName] = useState('SECURE_STATION')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [consentChecked, setConsentChecked] = useState(getHostConsentSaved)

  useEffect(() => {
    checkCentralHealth().then(setOnline)
  }, [])

  async function handleRegister() {
    setLoading(true)
    setError('')
    setStatus('')

    try {
      const result = await registerStation(stationName.trim() || 'SECURE_STATION')
      setCredentials(result)
      setStatus('스테이션 등록 완료 — 키가 이 기기에 저장되었습니다.')
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
      `집계 서버 업로드 완료 · 대조: ${result.reconciliation?.status ?? '—'}` +
      (result.reconciliation?.mismatchCount
        ? ` (불일치 ${result.reconciliation.mismatchCount}건)`
        : '')
    )
  }

  async function handleConsentChange(checked) {
    setConsentChecked(checked)
    setHostConsentSaved(checked)
    setAutoUploadEnabled(checked)
    setError('')
    setStatus('')

    if (!checked) {
      return
    }

    if (!credentials?.stationKey) {
      setError('먼저 스테이션을 등록해 주세요.')
      setConsentChecked(false)
      setHostConsentSaved(false)
      setAutoUploadEnabled(false)
      return
    }

    if (!online) {
      setError('집계 서버가 꺼져 있어 업로드할 수 없습니다.')
      setConsentChecked(false)
      setHostConsentSaved(false)
      setAutoUploadEnabled(false)
      return
    }

    setLoading(true)

    try {
      const message = await uploadToCentral()
      setStatus(`${message} · 이후 시세 갱신 시에도 자동 업로드됩니다.`)
    } catch (err) {
      setConsentChecked(false)
      setHostConsentSaved(false)
      setAutoUploadEnabled(false)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRetryPush() {
    if (!consentChecked) return

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

  return (
    <section className="station-panel" aria-label="중앙 서버 연동">
      <div className="station-panel__header">
        <h2 className="station-panel__title">Network Data Pool</h2>
        <span
          className={`station-panel__status${online ? ' station-panel__status--on' : ''}`}
        >
          {online ? 'HOST ONLINE' : 'HOST OFFLINE'}
        </span>
      </div>

      <p className="station-panel__desc">
        <strong>쉽게 말하면:</strong> 참여자들의 포트폴리오 데이터를 모아{' '}
        <strong>네트워크 평균 비중</strong>을 만들고, 그걸 바탕으로 각자 더 나은
        포트폴리오를 점검하는 공간입니다.
      </p>

      <p className="station-panel__purpose">
        데이터를 모으는 이유 — 참여자 전체의 비중·스냅샷을 익명 집계해{' '}
        <strong>더 나은 포트폴리오 전략</strong>(네트워크 리밸런싱 목표 등)을
        만듭니다. 개인 식별·투자 권유·수익 보장 목적이 아닙니다.
      </p>

      {!online && (
        <p className="station-panel__warn">
          서버가 꺼져 있어요. 로컬: <code>npm run central</code> · 배포 후에는 이 메시지가 안 나와야
          정상입니다.
        </p>
      )}

      {credentials ? (
        <div className="station-panel__info">
          <p>
            <span className="station-panel__label">스테이션</span>
            {credentials.name}
          </p>
          <p className="station-panel__mono">
            ID: {credentials.stationId}
          </p>
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
            <label className="station-panel__consent">
              <input
                type="checkbox"
                checked={consentChecked}
                disabled={loading}
                onChange={(e) => handleConsentChange(e.target.checked)}
              />
              <span>
                내 <strong>포트폴리오·거래·스냅샷</strong> 데이터의{' '}
                <strong>수집·익명 집계</strong>에 동의합니다. 동의 시{' '}
                <strong>즉시 집계 서버에 업로드</strong>되며, 이후{' '}
                <strong>시세 갱신할 때마다 자동</strong>으로 반영됩니다. 수집
                데이터는 네트워크 벤치마크·리밸런싱 목표에 사용됩니다.
              </span>
            </label>
            {consentChecked && (
              <button
                type="button"
                className="station-panel__link-btn"
                onClick={handleRetryPush}
                disabled={loading || !online}
              >
                지금 다시 업로드
              </button>
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
