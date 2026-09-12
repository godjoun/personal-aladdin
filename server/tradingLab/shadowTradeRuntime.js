/**
 * shadowTradeRuntime.js — 가상 포지션 자동 기록·결과 추적
 *
 * collector 와 독립. 기존 Bybit collector 는 건드리지 않는다.
 */

import {
  TRADING_LAB_SYMBOLS,
  SHADOW_TRADE_EVAL_INTERVAL_MS,
} from './constants.js'
import {
  evaluateOpenShadowTrades,
  processAutoShadowTrades,
} from './shadowTradeService.js'

/** @type {ReturnType<typeof createShadowTradeRuntime> | null} */
let activeRuntime = null

export function getShadowTradeRuntime() {
  return activeRuntime
}

export function setShadowTradeRuntime(runtime) {
  activeRuntime = runtime
}

export function resetShadowTradeRuntime() {
  if (activeRuntime) {
    try {
      activeRuntime.stop()
    } catch {
      // stop 실패가 테스트를 깨지 않게 한다
    }
  }
  activeRuntime = null
}

/**
 * @param {{
 *   autoStart?: boolean,
 *   intervalMs?: number,
 *   symbols?: string[],
 *   now?: () => number,
 *   schedule?: (fn: Function, ms: number) => unknown,
 *   clearTimer?: (id: unknown) => void,
 *   processAuto?: Function,
 *   evaluateOpen?: Function,
 * }} [options]
 */
export function createShadowTradeRuntime(options = {}) {
  const intervalMs = options.intervalMs ?? SHADOW_TRADE_EVAL_INTERVAL_MS
  const symbols = options.symbols || [...TRADING_LAB_SYMBOLS]
  const now = options.now || (() => Date.now())
  const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer || ((id) => clearTimeout(id))
  const processAuto = options.processAuto || processAutoShadowTrades
  const evaluateOpen = options.evaluateOpen || evaluateOpenShadowTrades

  let timer = null
  let stopped = false
  let lastRunAt = null

  async function tick() {
    if (stopped) return
    lastRunAt = new Date(now()).toISOString()
    try {
      await processAuto({ symbols, nowMs: now() })
    } catch {
      console.error('[TradingLab] shadow trade auto tick failed')
    }
    try {
      await evaluateOpen({ nowMs: now() })
    } catch {
      console.error('[TradingLab] shadow trade evaluate tick failed')
    }
    if (stopped) return
    timer = schedule(tick, intervalMs)
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

  const runtime = { start, stop, tick, getStatus }
  activeRuntime = runtime
  if (options.autoStart !== false) start()
  return runtime
}
