/**
 * shadowTradeThresholds.js — Shadow Trade v1 임계값
 *
 * 승률·실전 진입 기준이 아니다. 가상 기록용 출발점이다.
 */

export const SHADOW_TRADE_THRESHOLDS = Object.freeze({
  /** 자동 가상 진입. 중간 이하 강도는 추격으로 보지 않는다. */
  AUTO_STRENGTH_MIN: 65,

  /**
   * 24h raw return 이 이 절대값 안에 있으면 NEUTRAL.
   * 0.15%는 수수료 가정(8bps)보다 조금 큰 관찰 밴드다.
   */
  RESULT_NEUTRAL_BAND_PCT: 0.15,

  /** 가상 비용. 왕복이 아니라 한 번 가정 마찰. 5bps = 0.05%. */
  ASSUMED_FEE_BPS: 5,

  /** 가상 슬리피지. 3bps = 0.03%. */
  ASSUMED_SLIPPAGE_BPS: 3,

  /** 연속 LOSS 경고. 실전 차단이 아니라 복기 알림. */
  CONSECUTIVE_LOSS_WARN: 3,

  /** 같은 방향 30분 재진입 경고. */
  REENTRY_WARN_COUNT: 3,
  REENTRY_WINDOW_MS: 30 * 60 * 1000,
})
