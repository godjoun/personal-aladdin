/**
 * strategyPresets.js — 리밸런싱 전략 프리셋 정의
 */

import { setRebalanceMode } from '../services/rebalanceSettings.js'

const PRESET_KEY = 'aladdin_active_preset'
const TARGETS_KEY = 'aladdin_fixed_targets'

/** @typedef {{ id: string, name: string, desc: string, accent: string, targets: Record<string, number> }} StrategyPreset */

/** @type {StrategyPreset[]} */
export const STRATEGY_PRESETS = [
  {
    id: 'dalio',
    name: 'Ray Dalio Classic',
    desc: 'All-Weather · 4자산 방어형',
    accent: 'gold',
    targets: {
      주식: 30,
      채권: 55,
      금: 7.5,
      기타: 7.5,
      현금: 0,
      부동산: 0,
      암호화폐: 0,
    },
  },
  {
    id: 'defense',
    name: '3-Asset Defense',
    desc: '주식·채권·현금 3축 방어',
    accent: 'orange',
    targets: {
      주식: 33,
      채권: 33,
      현금: 34,
      금: 0,
      부동산: 0,
      암호화폐: 0,
      기타: 0,
    },
  },
  {
    id: 'classic',
    name: 'Classic 60/40',
    desc: '주식 60% · 채권 40%',
    accent: 'gray',
    targets: {
      주식: 60,
      채권: 40,
      현금: 0,
      금: 0,
      부동산: 0,
      암호화폐: 0,
      기타: 0,
    },
  },
]

export function getActivePresetId() {
  return localStorage.getItem(PRESET_KEY) || 'classic'
}

export function getPresetById(presetId) {
  return STRATEGY_PRESETS.find((preset) => preset.id === presetId) ?? null
}

/**
 * @returns {Record<string, number>}
 */
export function getFixedTargetAllocation() {
  try {
    const raw = localStorage.getItem(TARGETS_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {
    // fall through
  }

  const preset = getPresetById(getActivePresetId())
  return preset?.targets ?? STRATEGY_PRESETS[2].targets
}

/**
 * 프리셋을 고정 전략 목표로 적용합니다.
 *
 * @param {string} presetId
 */
export function applyStrategyPreset(presetId) {
  const preset = getPresetById(presetId)
  if (!preset) {
    return false
  }

  localStorage.setItem(PRESET_KEY, presetId)
  localStorage.setItem(TARGETS_KEY, JSON.stringify(preset.targets))
  setRebalanceMode('fixed')
  return true
}
