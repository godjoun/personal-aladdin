/**
 * fetchTimeout.js — AbortSignal 기반 timeout (서버)
 */

/**
 * @param {number} ms
 * @param {AbortSignal} [outer]
 */
export function createTimeoutSignal(ms, outer) {
  const timeoutMs = Math.max(1000, Number(ms) || 15000)
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' && !outer) {
    return AbortSignal.timeout(timeoutMs)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (outer) {
    if (outer.aborted) controller.abort()
    else {
      outer.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }
  // allow GC after abort
  controller.signal.addEventListener('abort', () => clearTimeout(timer), {
    once: true,
  })
  return controller.signal
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{ timeoutMs?: number }} [options]
 */
export async function fetchWithTimeout(fetchImpl, url, init = {}, options = {}) {
  const signal = createTimeoutSignal(options.timeoutMs ?? 15000, init.signal)
  return fetchImpl(url, { ...init, signal })
}
