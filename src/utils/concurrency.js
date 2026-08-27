/**
 * concurrency.js — 제한된 병렬 실행
 */

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<PromiseSettledResult<R>[]>}
 */
export async function mapWithConcurrency(items, limit, worker) {
  const list = Array.isArray(items) ? items : []
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, 8))
  /** @type {PromiseSettledResult<R>[]} */
  const results = new Array(list.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < list.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        const value = await worker(list[index], index)
        results[index] = { status: 'fulfilled', value }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, list.length || 1) },
    () => runWorker(),
  )
  await Promise.all(runners)
  return results
}
