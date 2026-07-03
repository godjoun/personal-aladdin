/**
 * rebalanceEngine.js — 리밸런싱 점검 엔진
 * ─────────────────────────────────────────────────────────
 * 현재 자산군 비중과 "목표 비중"을 비교해
 * 어느 자산군을 점검해야 하는지 알려 줍니다.
 *
 * 점검 기준:
 *   |현재 비중 − 목표 비중| ≥ 5%p  →  "점검 필요"
 *
 * ※ 실제 매매 주문을 실행하지 않습니다. 참고용 점검 도구입니다.
 */

/**
 * 기본 목표 자산군 비중 (%)
 * 합계 = 100%
 */
export const DEFAULT_TARGET_ALLOCATION = {
  주식: 40,
  채권: 30,
  현금: 10,
  금: 10,
  부동산: 5,
  암호화폐: 0,
  기타: 5,
}

/**
 * 점검 필요 판단 임계값 (percentage point, %p)
 * 현재−목표 차이의 절댓값이 이 값 이상이면 점검 필요
 */
export const REBALANCE_THRESHOLD = 5

/**
 * 현재 비중과 목표 비중의 차이를 계산합니다.
 *
 * @param {number} currentWeight - 현재 비중 (%)
 * @param {number} targetWeight - 목표 비중 (%)
 * @returns {number} 차이 (%p). 양수=초과 보유, 음수=부족
 */
export function calculateWeightDifference(currentWeight, targetWeight) {
  return currentWeight - targetWeight
}

/**
 * 차이가 점검 임계값을 넘는지 판단합니다.
 *
 * @param {number} difference - 현재−목표 차이 (%p)
 * @param {number} [threshold=REBALANCE_THRESHOLD]
 * @returns {boolean}
 */
export function needsRebalanceReview(difference, threshold = REBALANCE_THRESHOLD) {
  return Math.abs(difference) >= threshold
}

/**
 * 자산군 비중(allocation)을 목표 비중과 비교해 리밸런싱 점검 결과를 만듭니다.
 *
 * @param {Object} allocation - calculateAssetClassAllocation() 결과
 * @returns {{
 *   items: Array<{
 *     assetClass: string,
 *     currentWeight: number,
 *     targetWeight: number,
 *     difference: number,
 *     needsReview: boolean
 *   }>,
 *   reviewCount: number,
 *   threshold: number
 * }}
 */
export function analyzeRebalancing(allocation, targetAllocation = DEFAULT_TARGET_ALLOCATION) {
  const groups = allocation?.groups ?? []

  // 현재 비중을 Map 으로 변환 — 빠른 조회용
  const currentWeightMap = new Map()
  for (const group of groups) {
    currentWeightMap.set(group.assetClass, group.weight)
  }

  // 목표에 정의된 자산군 + 현재 보유 중인 자산군을 모두 포함
  const allAssetClasses = new Set([
    ...Object.keys(targetAllocation),
    ...currentWeightMap.keys(),
  ])

  const items = Array.from(allAssetClasses).map((assetClass) => {
    const currentWeight = currentWeightMap.get(assetClass) ?? 0
    const targetWeight = targetAllocation[assetClass] ?? 0
    const difference = calculateWeightDifference(currentWeight, targetWeight)
    const needsReview = needsRebalanceReview(difference)

    return {
      assetClass,
      currentWeight,
      targetWeight,
      difference,
      needsReview,
    }
  })

  // 정렬: 점검 필요 항목 먼저 → 차이 절댓값 큰 순
  items.sort((a, b) => {
    if (a.needsReview !== b.needsReview) {
      return a.needsReview ? -1 : 1
    }
    return Math.abs(b.difference) - Math.abs(a.difference)
  })

  const reviewCount = items.filter((item) => item.needsReview).length

  return {
    items,
    reviewCount,
    threshold: REBALANCE_THRESHOLD,
  }
}

/**
 * 네트워크 집계 비중 → 리밸런싱 목표 맵 (%)
 * @param {Array<{ assetClass: string, weight: number }>} networkAllocation
 */
export function networkAllocationToTargets(networkAllocation) {
  const targets = {}

  for (const row of networkAllocation ?? []) {
    targets[row.assetClass] = row.weight
  }

  return targets
}

/**
 * 목표 비중 합계가 100%인지 점검
 */
export function getTargetWeightSum(targetAllocation = DEFAULT_TARGET_ALLOCATION) {
  return Object.values(targetAllocation).reduce((sum, weight) => sum + weight, 0)
}
