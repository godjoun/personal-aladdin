/**
 * marketStateRecorder.js — 5분마다 시장 상태를 평가·기록
 *
 * collector 와 독립. 기존 WS collector 는 건드리지 않는다.
 */

import { TRADING_LAB_SYMBOLS, MARKET_STATE_BUCKET_SECONDS } from './constants.js'
import { evaluateAndPersistMarketStates } from './marketStateService.js'

/** @type {ReturnType<typeof createMarketStateRecorder> | null} */
let activeRecorder = null

export function getMarketStateRecorder() {
  return activeRecorder
}

export function setMarketStateRecorder(recorder) {
  activeRecorder = recorder
}

export function resetMarketStateRecorder() {
  if (activeRecorder) {
    try {
      activeRecorder.stop()
    } catch {
      // stop 실패가 테스트를 깨지 않게 한다
    }
  }
  activeRecorder = null
}

/**
 * @param {number} nowMs
 * @param {number} intervalMs
 */
export function msUntilNextBucket(nowMs, intervalMs) {
  if (!intervalMs || intervalMs <= 0) return 0
  const remainder = nowMs % intervalMs
  return remainder === 0 ? intervalMs : intervalMs - remainder
}

/**
 * @param {{
 *   autoStart?: boolean,
 *   intervalMs?: number,
 *   symbols?: string[],
 *   evaluate?: Function,
 *   now?: () => number,
 *   schedule?: (fn: Function, ms: number) => unknown,
 *   clearTimer?: (id: unknown) => void,
 * }} [options]
 */
export function createMarketStateRecorder(options = {}) {
  const intervalMs = options.intervalMs ?? MARKET_STATE_BUCKET_SECONDS * 1000
  const symbols = options.symbols || [...TRADING_LAB_SYMBOLS]
  const evaluate =
    options.evaluate ||
    ((params) => evaluateAndPersistMarketStates(params))
  const now = options.now || (() => Date.now())
  const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer || ((id) => clearTimeout(id))

  let timer = null
  let stopped = false
  let lastRunAt = null

  async function tick() {
    if (stopped) return
    lastRunAt = new Date(now()).toISOString()
    try {
      await evaluate({ symbols, nowMs: now() })
    } catch {
      console.error('[TradingLab] market state recorder tick failed')
    }
    if (stopped) return
    timer = schedule(tick, msUntilNextBucket(now(), intervalMs))
  }

  function start() {
    if (timer || stopped) return
    stopped = false
    void tick()
  }

  function stop() {
    stopped = true
    if (timer) {
      clearTimer(timer)
      timer = null
    }
  }

  function getStatus() {
    return {
      running: Boolean(timer) || !stopped,
      intervalMs,
      symbols: [...symbols],
      lastRunAt,
    }
  }

  const recorder = { start, stop, tick, getStatus }
  activeRecorder = recorder
  if (options.autoStart !== false) start()
  return recorder
}
