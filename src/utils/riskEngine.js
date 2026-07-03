/**
 * riskEngine.js — 위기 시나리오 리스크 엔진
 * ─────────────────────────────────────────────────────────
 * 현재 자산군 비중(allocation)을 기준으로
 * 위기 상황별 "포트폴리오 예상 손실률"을 계산합니다.
 *
 * 계산 공식 (가중 평균):
 *   예상 손실률 = Σ (자산군 비중% × 자산군 충격값%) / 100
 *
 * 예시:
 *   주식 60%, 충격 -35%  →  60 × (-35) / 100 = -21%p 기여
 *   채권 40%, 충격 -10%  →  40 × (-10) / 100 = -4%p 기여
 *   합계 예상 손실률     =  -25%
 *
 * ※ 교육·참고용 단순 모델이며, 실제 시장 결과와 다를 수 있습니다.
 */

/**
 * 자산군별 기본 충격값 (%)
 * 음수 = 하락, 양수 = 상승(안전자산 등)
 */
export const DEFAULT_ASSET_SHOCKS = {
  주식: -35,
  채권: -10,
  현금: 0,
  금: 5,
  부동산: -20,
  암호화폐: -50,
  기타: -15,
}

/**
 * 위기 시나리오 정의
 * 각 시나리오는 역사적 위기 유형을 단순화한 가상 충격값을 가집니다.
 */
export const CRISIS_SCENARIOS = [
  {
    id: 'crisis-2008',
    name: '2008 금융위기형',
    description: '글로벌 금융시스템 동결·신용경색에 따른 자산군 급락 시나리오',
    shocks: {
      주식: -55,
      채권: -5,
      현금: 0,
      금: 15,
      부동산: -35,
      암호화폐: -50,
      기타: -25,
    },
  },
  {
    id: 'crisis-2020',
    name: '2020 코로나 급락형',
    description: '팬데믹 쇼크로 인한 단기 급락·유동성 위기 시나리오',
    shocks: {
      주식: -35,
      채권: -10,
      현금: 0,
      금: 5,
      부동산: -20,
      암호화폐: -50,
      기타: -15,
    },
  },
  {
    id: 'crisis-2022',
    name: '2022 금리상승형',
    description: '급격한 금리 인상으로 주식·채권 동반 하락 시나리오',
    shocks: {
      주식: -25,
      채권: -15,
      현금: 0,
      금: -5,
      부동산: -20,
      암호화폐: -60,
      기타: -15,
    },
  },
]

/**
 * 자산군에 적용할 충격값을 찾습니다.
 * 시나리오 전용 값 → 기본값 → '기타' 순으로 fallback
 *
 * @param {string} assetClass - 자산군 이름
 * @param {Object} scenarioShocks - 시나리오별 충격값 맵
 * @returns {number} 충격값 (%)
 */
function getShockForAssetClass(assetClass, scenarioShocks) {
  if (scenarioShocks[assetClass] !== undefined) {
    return scenarioShocks[assetClass]
  }
  if (DEFAULT_ASSET_SHOCKS[assetClass] !== undefined) {
    return DEFAULT_ASSET_SHOCKS[assetClass]
  }
  return DEFAULT_ASSET_SHOCKS.기타
}

/**
 * 하나의 시나리오에 대해 포트폴리오 예상 손실률을 계산합니다.
 *
 * @param {Array<{ assetClass: string, weight: number }>} groups - 자산군 비중
 * @param {Object} scenarioShocks - 해당 시나리오 충격값
 * @returns {{ expectedLossRate: number, breakdown: Array<Object> }}
 */
export function calculateScenarioLossRate(groups, scenarioShocks) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return { expectedLossRate: 0, breakdown: [] }
  }

  let expectedLossRate = 0
  const breakdown = []

  for (const group of groups) {
    const shock = getShockForAssetClass(group.assetClass, scenarioShocks)

    // 비중(%) × 충격(%) → 포트폴리오 기여분 (%p)
    const contribution = (group.weight / 100) * shock
    expectedLossRate += contribution

    breakdown.push({
      assetClass: group.assetClass,
      weight: group.weight,
      shock,
      contribution,
    })
  }

  return { expectedLossRate, breakdown }
}

/**
 * 모든 위기 시나리오를 시뮬레이션합니다.
 *
 * @param {Object} allocation - calculateAssetClassAllocation() 결과
 * @returns {{
 *   scenarios: Array<Object>,
 *   worstScenarioId: string|null
 * }}
 */
export function simulateCrisisScenarios(allocation) {
  const { groups, totalValuedAmount } = allocation

  if (!groups || groups.length === 0) {
    return {
      scenarios: CRISIS_SCENARIOS.map((scenario) => ({
        ...scenario,
        expectedLossRate: null,
        expectedLossAmount: null,
        breakdown: [],
      })),
      worstScenarioId: null,
    }
  }

  const scenarios = CRISIS_SCENARIOS.map((scenario) => {
    const { expectedLossRate, breakdown } = calculateScenarioLossRate(
      groups,
      scenario.shocks,
    )

    // 예상 손실 금액 = 현재 평가금액 × (손실률 / 100)
    const expectedLossAmount = totalValuedAmount * (expectedLossRate / 100)

    return {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      expectedLossRate,
      expectedLossAmount,
      breakdown,
    }
  })

  // 가장 손실이 큰 시나리오 = expectedLossRate 가 가장 작은(음수가 큰) 값
  const valuedScenarios = scenarios.filter((s) => s.expectedLossRate !== null)
  const worstScenario =
    valuedScenarios.length > 0
      ? valuedScenarios.reduce((worst, current) =>
          current.expectedLossRate < worst.expectedLossRate ? current : worst,
        )
      : null

  return {
    scenarios,
    worstScenarioId: worstScenario?.id ?? null,
  }
}
