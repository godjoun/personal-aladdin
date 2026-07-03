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
  getAutoUploadEnabled,
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
  const [autoUpload, setAutoUpload] = useState(getAutoUploadEnabled)

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

  async function handlePush() {
    if (!consentChecked) {
      setError('업로드 전 동의 체크박스를 선택해 주세요.')
      return
    }

    setLoading(true)
    setError('')
    setStatus('')

    try {
      const result = await pushVaultToCentral({ consentHostMonitoring: true })
      setHostConsentSaved(true)
      setStatus(
        `중앙 업로드 완료 · 대조: ${result.reconciliation?.status ?? '—'}` +
          (result.reconciliation?.mismatchCount
            ? ` (불일치 ${result.reconciliation.mismatchCount}건)`
            : ''),
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="station-panel" aria-label="중앙 서버 연동">
      <div className="station-panel__header">
        <h2 className="station-panel__title">Central Host Link</h2>
        <span
          className={`station-panel__status${online ? ' station-panel__status--on' : ''}`}
        >
          {online ? 'HOST ONLINE' : 'HOST OFFLINE'}
        </span>
      </div>

      <p className="station-panel__desc">
        <strong>쉽게 말하면:</strong> 내 자산 정보를 인터넷 서버에 보내 두는 버튼입니다.
        친구도 같은 사이트에서 등록·업로드하면, 관리자 화면에서 모아 볼 수 있어요.
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
                onChange={(e) => {
                  const checked = e.target.checked
                  setConsentChecked(checked)
                  setHostConsentSaved(checked)
                  if (!checked) {
                    setAutoUpload(false)
                    setAutoUploadEnabled(false)
                  }
                  setError('')
                }}
              />
              <span>
                호스트가 내 <strong>포트폴리오·거래·스냅샷</strong>을 관리자 화면에서
                조회·분석하는 것에 동의합니다. (투자 권유·수익 보장 아님)
              </span>
            </label>
            <label className="station-panel__consent">
              <input
                type="checkbox"
                checked={autoUpload}
                disabled={!consentChecked}
                onChange={(e) => {
                  const checked = e.target.checked
                  setAutoUpload(checked)
                  setAutoUploadEnabled(checked)
                  setError('')
                }}
              />
              <span>
                <strong>가격 갱신 후 자동 업로드</strong> — 시세 새로고침할 때마다
                중앙 서버·네트워크 리밸런싱 목표가 함께 갱신됩니다.
              </span>
            </label>
            <button
              type="button"
              className="station-panel__btn station-panel__btn--primary"
              onClick={handlePush}
              disabled={loading || !online || !consentChecked}
            >
              {loading ? '처리 중...' : '중앙 서버에 업로드'}
            </button>
          </>
        )}
        <a
          className="station-panel__link"
          href={getCentralAdminUrl()}
          target="_blank"
          rel="noreferrer"
        >
          호스트 콘솔 열기 →
        </a>
      </div>

      {status && <p className="station-panel__message">{status}</p>}
      {error && <p className="station-panel__error">{error}</p>}
    </section>
  )
}

export default StationPanel
