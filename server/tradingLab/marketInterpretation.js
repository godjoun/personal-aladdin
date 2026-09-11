/**
 * marketInterpretation.js — 시장 데이터 해석 domain model
 *
 * 중요: 이 모듈은 어떤 것도 확정 사실로 표현하지 않는다.
 * 모든 결과는 "가능성(POSSIBILITY)" 수준의 관찰이며,
 * 자동 매매 판단이나 주문 신호로 사용하지 않는다.
 *
 * 이번 단계에서는 bias 를 자동 결정하지 않는다.
 * 관찰 목록을 만들어 사용자의 판단 근거로 제시하는 것까지만 담당한다.
 */

/** 관찰의 확신 수준 — 현재는 가능성 단일 등급만 사용 */
export const OBSERVATION_CERTAINTY = 'POSSIBILITY'

export const PRICE_OI_SIGNALS = Object.freeze({
  NEW_LONG_INFLOW: 'NEW_LONG_INFLOW',
  SHORT_LIQUIDATION_PRESSURE: 'SHORT_LIQUIDATION_PRESSURE',
  NEW_SHORT_INFLOW: 'NEW_SHORT_INFLOW',
  LONG_LIQUIDATION_PRESSURE: 'LONG_LIQUIDATION_PRESSURE',
  NO_CLEAR_SIGNAL: 'NO_CLEAR_SIGNAL',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
})

/**
 * price/OI 조합별 해석.
 * leaning 은 "참고 방향"이며 매매 지시가 아니다.
 */
const PRICE_OI_DESCRIPTORS = Object.freeze({
  [PRICE_OI_SIGNALS.NEW_LONG_INFLOW]: {
    label: '신규 롱 유입 가능성',
    detail: '가격과 미결제약정이 함께 증가했습니다.',
    leaning: 'LONG',
  },
  [PRICE_OI_SIGNALS.SHORT_LIQUIDATION_PRESSURE]: {
    label: '숏 청산 영향 가능성',
    detail: '가격이 오르는 동안 미결제약정이 줄었습니다.',
    leaning: 'LONG',
  },
  [PRICE_OI_SIGNALS.NEW_SHORT_INFLOW]: {
    label: '신규 숏 유입 가능성',
    detail: '가격이 내리는 동안 미결제약정이 늘었습니다.',
    leaning: 'SHORT',
  },
  [PRICE_OI_SIGNALS.LONG_LIQUIDATION_PRESSURE]: {
    label: '롱 청산 영향 가능성',
    detail: '가격과 미결제약정이 함께 감소했습니다.',
    leaning: 'SHORT',
  },
  [PRICE_OI_SIGNALS.NO_CLEAR_SIGNAL]: {
    label: '뚜렷한 방향성 확인 어려움',
    detail: '가격 또는 미결제약정 변화가 기준치 안에 머물러 있습니다.',
    leaning: 'NONE',
  },
  [PRICE_OI_SIGNALS.INSUFFICIENT_DATA]: {
    label: '데이터 부족',
    detail: '가격 또는 미결제약정 변화 데이터가 없습니다.',
    leaning: 'NONE',
  },
})

const DEFAULT_PRICE_EPSILON = 0
const DEFAULT_OI_EPSILON = 0
const DEFAULT_VOLUME_Z_THRESHOLD = 2

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isUsableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * @param {string} code
 * @returns {{ code: string, label: string, detail: string, leaning: string, certainty: string }}
 */
function toObservation(code, extra = {}) {
  const descriptor = PRICE_OI_DESCRIPTORS[code] || {
    label: '해석 불가',
    detail: '',
    leaning: 'NONE',
  }
  return {
    code,
    label: descriptor.label,
    detail: descriptor.detail,
    leaning: descriptor.leaning,
    certainty: OBSERVATION_CERTAINTY,
    ...extra,
  }
}

/**
 * price ↑/↓ × OI ↑/↓ 네 가지 조합 해석
 *
 * @param {{
 *   priceChange?: number | null,
 *   openInterestChange?: number | null,
 *   priceEpsilon?: number,
 *   openInterestEpsilon?: number,
 * }} input
 */
export function describePriceOpenInterestRelation(input = {}) {
  const {
    priceChange,
    openInterestChange,
    priceEpsilon = DEFAULT_PRICE_EPSILON,
    openInterestEpsilon = DEFAULT_OI_EPSILON,
  } = input

  if (!isUsableNumber(priceChange) || !isUsableNumber(openInterestChange)) {
    return toObservation(PRICE_OI_SIGNALS.INSUFFICIENT_DATA)
  }

  const priceUp = priceChange > priceEpsilon
  const priceDown = priceChange < -priceEpsilon
  const oiUp = openInterestChange > openInterestEpsilon
  const oiDown = openInterestChange < -openInterestEpsilon

  if (!priceUp && !priceDown) return toObservation(PRICE_OI_SIGNALS.NO_CLEAR_SIGNAL)
  if (!oiUp && !oiDown) return toObservation(PRICE_OI_SIGNALS.NO_CLEAR_SIGNAL)

  if (priceUp && oiUp) return toObservation(PRICE_OI_SIGNALS.NEW_LONG_INFLOW)
  if (priceUp && oiDown) {
    return toObservation(PRICE_OI_SIGNALS.SHORT_LIQUIDATION_PRESSURE)
  }
  if (priceDown && oiUp) return toObservation(PRICE_OI_SIGNALS.NEW_SHORT_INFLOW)
  return toObservation(PRICE_OI_SIGNALS.LONG_LIQUIDATION_PRESSURE)
}

/**
 * 거래량 이상치 — 특정 주체를 지목하지 않고 "대형 참여자 개입 가능성"까지만 표현
 *
 * @param {{ volumeZScore?: number | null, threshold?: number }} input
 */
export function describeVolumeParticipation(input = {}) {
  const { volumeZScore, threshold = DEFAULT_VOLUME_Z_THRESHOLD } = input

  if (!isUsableNumber(volumeZScore)) {
    return {
      code: 'INSUFFICIENT_DATA',
      label: '데이터 부족',
      detail: '거래량 기준치 데이터가 없습니다.',
      leaning: 'NONE',
      certainty: OBSERVATION_CERTAINTY,
    }
  }

  if (Math.abs(volumeZScore) < threshold) {
    return {
      code: 'VOLUME_NORMAL_RANGE',
      label: '거래량 평시 범위',
      detail: '거래량이 통계적 이상치 구간에 있지 않습니다.',
      leaning: 'NONE',
      certainty: OBSERVATION_CERTAINTY,
    }
  }

  return {
    code: 'LARGE_PARTICIPANT_ACTIVITY',
    label: '대형 참여자 개입 가능성',
    detail: '거래량이 평시 대비 통계적 이상치 구간에 있습니다.',
    leaning: 'NONE',
    certainty: OBSERVATION_CERTAINTY,
  }
}

/**
 * funding 은 방향 예측이 아니라 포지션 비용/편중 참고 지표로만 표현한다.
 *
 * @param {{ fundingRate?: number | null }} input
 */
export function describeFundingTilt(input = {}) {
  const { fundingRate } = input

  if (!isUsableNumber(fundingRate)) {
    return {
      code: 'INSUFFICIENT_DATA',
      label: '데이터 부족',
      detail: 'funding 데이터가 없습니다.',
      leaning: 'NONE',
      certainty: OBSERVATION_CERTAINTY,
    }
  }

  if (fundingRate > 0) {
    return {
      code: 'FUNDING_LONG_COST',
      label: '롱 포지션 비용 부담 가능성',
      detail: 'funding 이 양수로, 롱 포지션이 비용을 지불하는 구간입니다.',
      leaning: 'NONE',
      certainty: OBSERVATION_CERTAINTY,
    }
  }

  if (fundingRate < 0) {
    return {
      code: 'FUNDING_SHORT_COST',
      label: '숏 포지션 비용 부담 가능성',
      detail: 'funding 이 음수로, 숏 포지션이 비용을 지불하는 구간입니다.',
      leaning: 'NONE',
      certainty: OBSERVATION_CERTAINTY,
    }
  }

  return {
    code: 'FUNDING_NEUTRAL',
    label: 'funding 중립 구간',
    detail: 'funding 이 0 부근입니다.',
    leaning: 'NONE',
    certainty: OBSERVATION_CERTAINTY,
  }
}

/**
 * 청산 밀집 구간 접근 — "전부 청산된다"처럼 확정적으로 표현하지 않는다.
 *
 * @param {{
 *   referencePrice?: number | null,
 *   liquidationAbove?: number | null,
 *   liquidationBelow?: number | null,
 *   proximityRatio?: number,
 * }} input
 */
export function describeLiquidationProximity(input = {}) {
  const {
    referencePrice,
    liquidationAbove,
    liquidationBelow,
    proximityRatio = 0.01,
  } = input

  if (!isUsableNumber(referencePrice) || referencePrice <= 0) {
    return {
      code: 'INSUFFICIENT_DATA',
      label: '데이터 부족',
      detail: '기준 가격이 없어 청산 구간 거리를 계산할 수 없습니다.',
      leaning: 'NONE',
      certainty: OBSERVATION_CERTAINTY,
    }
  }

  const candidates = []
  if (isUsableNumber(liquidationAbove)) {
    candidates.push({ side: 'ABOVE', level: liquidationAbove })
  }
  if (isUsableNumber(liquidationBelow)) {
    candidates.push({ side: 'BELOW', level: liquidationBelow })
  }

  if (candidates.length === 0) {
    return {
      code: 'INSUFFICIENT_DATA',
      label: '데이터 부족',
      detail: '청산 밀집 추정 데이터가 없습니다.',
      leaning: 'NONE',
      certainty: OBSERVATION_CERTAINTY,
    }
  }

  const nearest = candidates
    .map((item) => ({
      ...item,
      distanceRatio: Math.abs(item.level - referencePrice) / referencePrice,
    }))
    .sort((a, b) => a.distanceRatio - b.distanceRatio)[0]

  if (nearest.distanceRatio > proximityRatio) {
    return {
      code: 'LIQUIDATION_CLUSTER_DISTANT',
      label: '청산 밀집 추정 구간과 거리 있음',
      detail: '기준 가격이 청산 밀집 추정 구간에서 떨어져 있습니다.',
      leaning: 'NONE',
      certainty: OBSERVATION_CERTAINTY,
      distanceRatio: nearest.distanceRatio,
    }
  }

  return {
    code: 'LIQUIDATION_CLUSTER_NEAR',
    label: '청산 밀집 추정 구간 접근',
    detail:
      '기준 가격이 청산 밀집 추정 구간에 근접했습니다. 추정치이며 실제 청산 규모는 확인할 수 없습니다.',
    leaning: 'NONE',
    certainty: OBSERVATION_CERTAINTY,
    side: nearest.side,
    distanceRatio: nearest.distanceRatio,
  }
}

export const CVD_SIGNALS = Object.freeze({
  BUY_PRESSURE: 'CVD_BUY_PRESSURE',
  SELL_PRESSURE: 'CVD_SELL_PRESSURE',
  PRICE_UP_WITH_BUY: 'CVD_PRICE_UP_WITH_BUY',
  PRICE_UP_WEAK_BUY: 'CVD_PRICE_UP_WEAK_BUY',
  NEUTRAL: 'CVD_NEUTRAL',
  INSUFFICIENT_DATA: 'CVD_INSUFFICIENT_DATA',
})

const CVD_DESCRIPTORS = Object.freeze({
  [CVD_SIGNALS.BUY_PRESSURE]: {
    label: '공격적 매수 체결 우세 가능성',
    detail: 'Bybit 관측 체결 기준 CVD가 상승했습니다.',
  },
  [CVD_SIGNALS.SELL_PRESSURE]: {
    label: '공격적 매도 체결 우세 가능성',
    detail: 'Bybit 관측 체결 기준 CVD가 하락했습니다.',
  },
  [CVD_SIGNALS.PRICE_UP_WITH_BUY]: {
    label: '가격 상승과 매수 체결이 함께 증가',
    detail: '가격과 Bybit 관측 CVD가 함께 올랐습니다.',
  },
  [CVD_SIGNALS.PRICE_UP_WEAK_BUY]: {
    label: '가격 상승 대비 매수 체결 확인 약함',
    detail: '가격은 올랐지만 Bybit 관측 CVD는 하락했습니다.',
  },
  [CVD_SIGNALS.NEUTRAL]: {
    label: 'CVD 방향 확인 어려움',
    detail: 'Bybit 관측 체결 기준 CVD 변화가 작습니다.',
  },
  [CVD_SIGNALS.INSUFFICIENT_DATA]: {
    label: '데이터 부족',
    detail: 'Bybit 관측 체결 기준 CVD 데이터가 없습니다.',
  },
})

/**
 * CVD 해석. LONG/SHORT 추천이 아니라 체결 우세 가능성만 표현한다.
 *
 * @param {{ cvd?: number | null, priceChange?: number | null }} input
 */
export function describeCvdFlow(input = {}) {
  const { cvd, priceChange } = input
  if (!isUsableNumber(cvd)) {
    return {
      code: CVD_SIGNALS.INSUFFICIENT_DATA,
      label: CVD_DESCRIPTORS[CVD_SIGNALS.INSUFFICIENT_DATA].label,
      detail: CVD_DESCRIPTORS[CVD_SIGNALS.INSUFFICIENT_DATA].detail,
      leaning: 'NONE',
      certainty: OBSERVATION_CERTAINTY,
    }
  }

  const priceUp = isUsableNumber(priceChange) && priceChange > 0
  let code = CVD_SIGNALS.NEUTRAL
  if (cvd > 0) {
    code = priceUp ? CVD_SIGNALS.PRICE_UP_WITH_BUY : CVD_SIGNALS.BUY_PRESSURE
  } else if (cvd < 0) {
    code = priceUp ? CVD_SIGNALS.PRICE_UP_WEAK_BUY : CVD_SIGNALS.SELL_PRESSURE
  }

  const descriptor = CVD_DESCRIPTORS[code]
  return {
    code,
    label: descriptor.label,
    detail: descriptor.detail,
    leaning: 'NONE',
    certainty: OBSERVATION_CERTAINTY,
  }
}

/**
 * 사용 가능한 지표만으로 관찰 목록을 구성한다.
 * 데이터가 없는 항목은 INSUFFICIENT_DATA 로 남겨 UI 가 "데이터 연결 전"을 표현할 수 있게 한다.
 *
 * @param {object} snapshot
 * @param {{ includeInsufficient?: boolean }} [options]
 */
export function buildMarketObservations(snapshot = {}, options = {}) {
  const { includeInsufficient = false } = options

  const observations = [
    describePriceOpenInterestRelation({
      priceChange: snapshot.priceChange ?? null,
      openInterestChange: snapshot.openInterestChange ?? null,
    }),
    describeVolumeParticipation({ volumeZScore: snapshot.volumeZScore ?? null }),
    describeFundingTilt({ fundingRate: snapshot.fundingRate ?? null }),
    describeLiquidationProximity({
      referencePrice: snapshot.referencePrice ?? null,
      liquidationAbove: snapshot.liquidationAbove ?? null,
      liquidationBelow: snapshot.liquidationBelow ?? null,
    }),
  ]

  if (includeInsufficient) return observations
  return observations.filter((item) => item.code !== 'INSUFFICIENT_DATA')
}
