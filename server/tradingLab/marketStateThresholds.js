/**
 * marketStateThresholds.js — 시장 상태 판정 v1 임계값
 *
 * 숫자는 이 파일에만 둔다. 엔진 본문에 매직 넘버를 흩뿌리지 않는다.
 * 초기값은 15m BTC/ETH 무기한 선물의 일반적인 노이즈를 걸러내기 위한
 * 경험적 출발점이며, 누적 observation 으로 나중에 조정한다.
 *
 * 이 값들은 승률·진입 기준이 아니다.
 */

/** @type {Readonly<Record<string, number | Record<string, number>>>} */
export const MARKET_STATE_THRESHOLDS = Object.freeze({
  /**
   * 15m 최근 봉 대비 변화. BTC 15m 노이즈는 보통 0.05~0.20% 부근이라
   * 0.25% 이상은 방향이 있는 움직임으로 본다.
   */
  PRICE_CHANGE_PCT_15M: 0.25,

  /** 1h 단기 context. 15m보다 한 단계 큰 움직임만 정렬/충돌에 사용. */
  PRICE_CHANGE_PCT_1H: 0.4,

  /** 4h 큰 방향 context. 일중 잡음을 피하기 위해 더 크게 잡는다. */
  PRICE_CHANGE_PCT_4H: 0.8,

  /**
   * 15m OI 변화. Bybit linear 15m OI는 보통 소수 % 미만으로 움직이므로
   * 0.4% 이상은 포지션 증감이 의미 있다고 본다.
   */
  OI_CHANGE_PCT: 0.4,

  /** 최근 평균 대비 30% 이상이면 거래량 증가로 본다. */
  VOLUME_RATIO_ELEVATED: 1.3,

  /** 강도 가산용. 평균 대비 1.6배는 뚜렷한 활성. */
  VOLUME_RATIO_STRONG: 1.6,

  /**
   * |CVD notional| / (buyNotional + sellNotional) * 100.
   * Buy 56 / Sell 44 → 12pp. 15m에서 흔한 1~8pp 잡음을 넘긴다.
   * BTC/ETH 공통. 절대 달러 임계값은 쓰지 않는다.
   */
  CVD_IMBALANCE_PCT: 12,

  /**
   * 다이버전스용 "크게". Buy 62 / Sell 38 → 24pp.
   * 61/39(22pp)는 방향 확인, 그 이상은 강한 불균형으로 본다.
   */
  CVD_LARGE_IMBALANCE_PCT: 24,

  /**
   * 관측된 청산 중 해당 방향 비중. 65%면 한쪽 청산이 우세하다.
   * 절대 달러 임계값은 쓰지 않는다.
   */
  LIQUIDATION_SIDE_SHARE_PCT: 65,

  /**
   * 같은 창 체결 대금 대비 청산 규모.
   * 3%면 체결 흐름 대비 무시하기 어려운 청산이다.
   */
  LIQUIDATION_VS_TRADE_PCT: 3,

  /**
   * 체결 대금이 없을 때 쓰는 최소 이벤트 수.
   * 단일 미소 체결이 상태를 확정하지 않게 한다.
   */
  LIQUIDATION_MIN_EVENTS: 2,

  /**
   * Funding 극단. 0.00015 = 8시간 0.015%.
   * 이 이상이면 한쪽 포지션이 붐빈 상태로 보고 반대 근거에만 쓴다.
   */
  FUNDING_EXTREME_RATE: 0.00015,

  STRENGTH_INSUFFICIENT: 0,
  STRENGTH_MIXED_BASE: 42,
  STRENGTH_CLASSIFIED_BASE: 52,
  STRENGTH_PRICE_MAGNITUDE_MAX: 10,
  STRENGTH_OI_CONFIRM: 8,
  STRENGTH_CVD_CONFIRM: 8,
  STRENGTH_CVD_LARGE: 6,
  STRENGTH_VOLUME_ELEVATED: 6,
  STRENGTH_LIQUIDATION_CONFIRM: 10,
  STRENGTH_ALIGN_1H: 8,
  STRENGTH_ALIGN_4H: 10,
  STRENGTH_OPPOSE_1H: 8,
  STRENGTH_OPPOSE_4H: 12,
  STRENGTH_FUNDING_AGAINST: 6,
})

/**
 * @param {number | Record<string, number>} valueOrMap
 * @param {string} [symbol]
 * @returns {number}
 */
export function thresholdFor(valueOrMap, symbol = 'BTCUSDT') {
  if (typeof valueOrMap === 'number') return valueOrMap
  if (valueOrMap && typeof valueOrMap[symbol] === 'number') {
    return valueOrMap[symbol]
  }
  return Number(valueOrMap?.BTCUSDT) || 0
}
