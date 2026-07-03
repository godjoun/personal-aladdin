/**
 * allocationOptimizer.js — 위기 내성 기준 분배 후보 비교·추천
 *
 * 투자 금액과 자산군 비중 후보를 위기 시나리오에 넣어
 * 최악 손실이 가장 작은 배분을 추천합니다. (교육·참고용)
 */

import { STRATEGY_PRESETS } from '../data/strategyPresets.js'
import { CRISIS_SCENARIOS, simulateCrisisScenarios } from './riskEngine.js'

/** @typedef {{ id: string, name: string, desc: string, targets: Record<string, number>, source: 'preset' | 'model' }} AllocationCandidate */

/** 프리셋 외 추가 방어형 후보 */
const MODEL_CANDIDATES = [
  {
    id: 'ultra-defense',
    name: '초방어형',
    desc: '채권·현금·금 비중 확대',
    targets: {
      주식: 15,
      채권: 45,
      금: 15,
      현금: 25,
      부동산: 0,
      암호화폐: 0,
      기타: 0,
    },
  },
  {
    id: 'four-equal',
    name: '4자산 균형',
    desc: '주식·채권·금·현금 25%씩',
    targets: {
      주식: 25,
      채권: 25,
      금: 25,
      현금: 25,
      부동산: 0,
      암호화폐: 0,
      기타: 0,
    },
  },
  {
    id: 'cash-heavy',
    name: '현금 비중 확대',
    desc: '유동성·방어 우선',
    targets: {
      주식: 20,
      채권: 35,
      금: 10,
      현금: 35,
      부동산: 0,
      암호화폐: 0,
      기타: 0,
    },
  },
]

/**
 * @returns {AllocationCandidate[]}
 */
export function getAllocationCandidates() {
  const presets = STRATEGY_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    desc: preset.desc,
    targets: preset.targets,
    source: 'preset',
  }))

  const models = MODEL_CANDIDATES.map((candidate) => ({
    ...candidate,
    source: 'model',
  }))

  return [...presets, ...models]
}

/**
 * 목표 비중 → simulateCrisisScenarios 입력 형식
 *
 * @param {Record<string, number>} targets
 * @param {number} totalAmount
 */
export function allocationFromTargets(targets, totalAmount) {
  const groups = Object.entries(targets)
    .filter(([, weight]) => weight > 0)
    .map(([assetClass, weight]) => ({
      assetClass,
      weight,
      totalValue: totalAmount * (weight / 100),
    }))

  return {
    groups,
    totalValuedAmount: totalAmount,
  }
}

/**
 * 목표 비중별 금액 배분
 *
 * @param {Record<string, number>} targets
 * @param {number} totalAmount
 */
export function amountsFromTargets(targets, totalAmount) {
  /** @type {Record<string, number>} */
  const amounts = {}

  for (const [assetClass, weight] of Object.entries(targets)) {
    if (weight > 0) {
      amounts[assetClass] = Math.round(totalAmount * (weight / 100))
    }
  }

  return amounts
}

/**
 * 최악 시나리오 손실률·평균 손실률·방어 점수 계산
 *
 * @param {ReturnType<typeof simulateCrisisScenarios>} simulation
 */
function summarizeSimulation(simulation) {
  const valued = simulation.scenarios.filter((s) => s.expectedLossRate !== null)

  if (valued.length === 0) {
    return {
      worstLossRate: 0,
      avgLossRate: 0,
      worstScenarioId: null,
      defenseScore: 100,
    }
  }

  const worst = valued.reduce((a, b) =>
    a.expectedLossRate < b.expectedLossRate ? a : b,
  )
  const avgLossRate =
    valued.reduce((sum, s) => sum + s.expectedLossRate, 0) / valued.length

  // 0% 최악 손실 = 100점, -50% = 50점 (단순 참고 지표)
  const defenseScore = Math.max(0, Math.min(100, Math.round(100 + worst.expectedLossRate)))

  return {
    worstLossRate: worst.expectedLossRate,
    avgLossRate,
    worstScenarioId: worst.id,
    worstScenarioName: worst.name,
    worstLossAmount: worst.expectedLossAmount,
    defenseScore,
  }
}

/**
 * 단일 후보 평가
 *
 * @param {AllocationCandidate} candidate
 * @param {number} totalAmount
 */
export function evaluateAllocationCandidate(candidate, totalAmount) {
  const allocation = allocationFromTargets(candidate.targets, totalAmount)
  const simulation = simulateCrisisScenarios(allocation)
  const summary = summarizeSimulation(simulation)

  return {
    ...candidate,
    amounts: amountsFromTargets(candidate.targets, totalAmount),
    scenarios: simulation.scenarios,
    worstScenarioId: simulation.worstScenarioId,
    ...summary,
  }
}

/**
 * 모든 후보를 평가하고 방어 점수 순으로 정렬합니다.
 *
 * @param {number} totalAmount
 */
export function recommendAllocations(totalAmount) {
  const amount = Math.max(0, Number(totalAmount) || 0)

  if (amount <= 0) {
    return {
      totalAmount: 0,
      recommendations: [],
      best: null,
    }
  }

  const recommendations = getAllocationCandidates()
    .map((candidate) => evaluateAllocationCandidate(candidate, amount))
    .sort((a, b) => {
      if (b.defenseScore !== a.defenseScore) {
        return b.defenseScore - a.defenseScore
      }
      if (b.worstLossRate !== a.worstLossRate) {
        return b.worstLossRate - a.worstLossRate
      }
      return b.avgLossRate - a.avgLossRate
    })
    .map((item, index) => ({ ...item, rank: index + 1 }))

  return {
    totalAmount: amount,
    recommendations,
    best: recommendations[0] ?? null,
    scenarioCount: CRISIS_SCENARIOS.length,
    scenarios: CRISIS_SCENARIOS,
  }
}

/**
 * 후보의 특정 시나리오 결과
 *
 * @param {ReturnType<typeof evaluateAllocationCandidate>} candidate
 * @param {string} scenarioId
 */
export function getCandidateScenarioResult(candidate, scenarioId) {
  return candidate.scenarios?.find((scenario) => scenario.id === scenarioId) ?? null
}

/**
 * 화면 표시용 순위 (전체=방어 점수 순, 특정 시나리오=해당 손실률 순)
 *
 * @param {ReturnType<typeof evaluateAllocationCandidate>[]} recommendations
 * @param {'all' | string} scenarioId
 */
export function rankRecommendationsForView(recommendations, scenarioId = 'all') {
  if (!recommendations?.length) {
    return []
  }

  if (scenarioId === 'all') {
    return recommendations.map((row) => ({
      ...row,
      viewRank: row.rank,
      isViewBest: row.rank === 1,
    }))
  }

  return [...recommendations]
    .map((row) => {
      const viewScenario = getCandidateScenarioResult(row, scenarioId)
      return {
        ...row,
        viewScenario,
        viewLossRate: viewScenario?.expectedLossRate ?? 0,
        viewLossAmount: viewScenario?.expectedLossAmount ?? 0,
      }
    })
    .sort((a, b) => b.viewLossRate - a.viewLossRate)
    .map((row, index) => ({
      ...row,
      viewRank: index + 1,
      isViewBest: index === 0,
    }))
}
