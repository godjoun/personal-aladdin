/**
 * syncTiming.js — 개발 모드 단계별 소요시간 (민감정보 금지)
 */

/**
 * @param {string} label
 * @param {() => Promise<unknown>} fn
 */
export async function measureSyncStep(label, fn) {
  const enabled =
    (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ||
    process.env.NODE_ENV === 'development'
  if (!enabled) return fn()

  const start = performance.now?.() ?? Date.now()
  try {
    return await fn()
  } finally {
    const end = performance.now?.() ?? Date.now()
    const ms = Math.round(end - start)
    console.info(`[sync-timing] ${label}: ${ms}ms`)
  }
}
