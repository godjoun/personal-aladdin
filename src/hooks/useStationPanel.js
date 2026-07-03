/**
 * useStationPanel.js — 스테이션 등록·네트워크 참여 상태
 */

import { useCallback, useEffect, useState } from 'react'
import {
  registerStation,
  pushVaultToCentral,
  getStationCredentials,
  checkCentralHealth,
  verifyStationCredentials,
  STALE_STATION_MESSAGE,
  STATION_CREDENTIALS_INVALIDATED,
} from '../services/stationClient.js'
import {
  getNetworkParticipationEnabled,
  NETWORK_PARTICIPATION_CHANGED,
  setNetworkParticipationEnabled,
} from '../services/networkParticipation.js'
import {
  getNetworkTargetMode,
  getNetworkWindowDays,
  setNetworkTargetMode,
  setNetworkWindowDays,
} from '../services/rebalanceSettings.js'

export function useStationPanel() {
  const [online, setOnline] = useState(false)
  const [credentials, setCredentials] = useState(getStationCredentials)
  const [stationName, setStationName] = useState(
    () => getStationCredentials()?.name || 'SECURE_STATION',
  )
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [participating, setParticipating] = useState(getNetworkParticipationEnabled)
  const [networkTargetMode, setNetworkTargetModeState] = useState(getNetworkTargetMode)
  const [networkWindowDays, setNetworkWindowDaysState] = useState(getNetworkWindowDays)

  const handleStaleCredentials = useCallback(() => {
    setCredentials(null)
    setParticipating(false)
    setNetworkParticipationEnabled(false)
    setError(STALE_STATION_MESSAGE)
  }, [])

  useEffect(() => {
    async function bootstrap() {
      const health = await checkCentralHealth()
      setOnline(health)

      if (!getStationCredentials()?.stationKey) {
        return
      }

      const verification = await verifyStationCredentials()
      if (!verification.valid && verification.reason === 'invalid_key') {
        handleStaleCredentials()
      }
    }

    bootstrap()
  }, [handleStaleCredentials])

  useEffect(() => {
    function handleParticipationChange() {
      setParticipating(getNetworkParticipationEnabled())
    }

    function handleCredentialsInvalidated() {
      handleStaleCredentials()
    }

    window.addEventListener(NETWORK_PARTICIPATION_CHANGED, handleParticipationChange)
    window.addEventListener(STATION_CREDENTIALS_INVALIDATED, handleCredentialsInvalidated)
    return () => {
      window.removeEventListener(NETWORK_PARTICIPATION_CHANGED, handleParticipationChange)
      window.removeEventListener(STATION_CREDENTIALS_INVALIDATED, handleCredentialsInvalidated)
    }
  }, [handleStaleCredentials])

  const uploadToCentral = useCallback(async () => {
    const result = await pushVaultToCentral({ consentHostMonitoring: true })
    return (
      `업로드 완료 · 대조: ${result.reconciliation?.status ?? '—'}` +
      (result.reconciliation?.mismatchCount
        ? ` (불일치 ${result.reconciliation.mismatchCount}건)`
        : '')
    )
  }, [])

  async function handleRegister() {
    setLoading(true)
    setError('')
    setStatus('')

    try {
      const result = await registerStation(stationName.trim() || 'SECURE_STATION')
      setCredentials(result)
      setStationName(result.name)
      setStatus('스테이션 등록 완료')
      checkCentralHealth().then(setOnline)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleParticipationChange(checked) {
    setError('')
    setStatus('')

    if (!checked) {
      setParticipating(false)
      setNetworkParticipationEnabled(false)
      setStatus('네트워크 참여를 껐습니다.')
      return
    }

    if (!credentials?.stationKey) {
      setError('먼저 스테이션을 등록해 주세요.')
      return
    }

    if (!online) {
      setError('집계 서버에 연결할 수 없습니다.')
      return
    }

    setLoading(true)

    try {
      const verification = await verifyStationCredentials()
      if (!verification.valid) {
        if (verification.reason === 'invalid_key') {
          handleStaleCredentials()
          return
        }
        throw new Error(verification.message || '스테이션 확인에 실패했습니다.')
      }

      const message = await uploadToCentral()
      setParticipating(true)
      setNetworkParticipationEnabled(true)
      setStatus(`${message} · 그룹 목표가 반영됩니다.`)
    } catch (err) {
      setParticipating(false)
      setNetworkParticipationEnabled(false)
      setError(err.message)
      if (!getStationCredentials()) {
        setCredentials(null)
      }
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
      if (!getStationCredentials()) {
        setCredentials(null)
        setParticipating(false)
        setNetworkParticipationEnabled(false)
      }
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

  return {
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
  }
}
