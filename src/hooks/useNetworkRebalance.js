/**
 * useNetworkRebalance.js — 네트워크 참여 시 벤치마크·목표 비중
 */

import { useCallback, useEffect, useState } from 'react'
import {
  fetchNetworkBenchmark,
  getCachedNetworkBenchmark,
} from '../services/networkBenchmark.js'
import {
  getNetworkTargetMode,
  getNetworkWindowDays,
  NETWORK_TARGET_SETTINGS_CHANGED,
} from '../services/rebalanceSettings.js'
import {
  getNetworkParticipationEnabled,
  NETWORK_PARTICIPATION_CHANGED,
} from '../services/networkParticipation.js'
import { networkAllocationToTargets } from '../utils/rebalanceEngine.js'
import { getFixedTargetAllocation } from '../data/strategyPresets.js'

export function useNetworkRebalance() {
  const [participating, setParticipating] = useState(getNetworkParticipationEnabled)
  const [networkBenchmark, setNetworkBenchmark] = useState(getCachedNetworkBenchmark)
  const [networkLoading, setNetworkLoading] = useState(false)
  const [networkError, setNetworkError] = useState('')

  const refreshNetworkBenchmark = useCallback(async () => {
    if (!getNetworkParticipationEnabled()) {
      return null
    }

    setNetworkLoading(true)
    setNetworkError('')

    try {
      const data = await fetchNetworkBenchmark({
        targetMode: getNetworkTargetMode(),
        windowDays: getNetworkWindowDays(),
      })
      setNetworkBenchmark(data)
      return data
    } catch (error) {
      setNetworkError(error.message)
      return null
    } finally {
      setNetworkLoading(false)
    }
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

  useEffect(() => {
    if (participating) {
      refreshNetworkBenchmark()
    } else {
      setNetworkError('')
    }
  }, [participating, refreshNetworkBenchmark])

  useEffect(() => {
    function handleTargetSettingsChange() {
      if (getNetworkParticipationEnabled()) {
        refreshNetworkBenchmark()
      }
    }

    window.addEventListener(NETWORK_TARGET_SETTINGS_CHANGED, handleTargetSettingsChange)
    return () => {
      window.removeEventListener(NETWORK_TARGET_SETTINGS_CHANGED, handleTargetSettingsChange)
    }
  }, [refreshNetworkBenchmark])

  function getActiveTargets() {
    if (participating && networkBenchmark?.networkAllocation?.length) {
      return networkAllocationToTargets(networkBenchmark.networkAllocation)
    }
    return getFixedTargetAllocation()
  }

  function formatNetworkHint() {
    if (!networkBenchmark) {
      return '그룹 데이터가 쌓이면 목표 비중이 자동 반영됩니다.'
    }

    const modeLabel =
      networkBenchmark.targetMode === 'average'
        ? `최근 ${networkBenchmark.windowDays}일 평균`
        : '최신 업로드'

    return `그룹 ${networkBenchmark.syncedStationCount}명 · ${modeLabel} · ${new Date(networkBenchmark.generatedAt).toLocaleString('ko-KR')}`
  }

  return {
    participating,
    networkBenchmark,
    networkLoading,
    networkError,
    refreshNetworkBenchmark,
    getActiveTargets,
    formatNetworkHint,
    targetSource: participating ? 'network' : 'fixed',
  }
}
