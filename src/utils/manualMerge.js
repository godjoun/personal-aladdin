/**
 * manualMerge.js — 수동 자산/거래 ID 기준 병합 (덮어쓰기·삭제 없음)
 */

/**
 * local 우선, server-only ID 추가. 동일 ID는 local 유지.
 *
 * @param {Array<object>} localItems
 * @param {Array<object>} serverItems
 * @returns {{ merged: Array<object>, addedFromServer: number, localOnly: number }}
 */
export function mergeByIdPreferLocal(localItems, serverItems) {
  const local = Array.isArray(localItems) ? localItems : []
  const server = Array.isArray(serverItems) ? serverItems : []

  const map = new Map()
  for (const item of local) {
    if (!item?.id) continue
    map.set(String(item.id), item)
  }

  let addedFromServer = 0
  for (const item of server) {
    if (!item?.id) continue
    const id = String(item.id)
    if (map.has(id)) continue
    map.set(id, item)
    addedFromServer += 1
  }

  const merged = Array.from(map.values())
  const localOnly = local.filter(
    (item) => item?.id && !server.some((s) => s?.id === item.id),
  ).length

  return { merged, addedFromServer, localOnly }
}
