/**
 * assetStorage.js — 보유 자산 localStorage 저장 계층
 * ─────────────────────────────────────────────────────────
 * 사용자가 입력한 보유 자산을 브라우저에 저장합니다.
 *
 * storage.js(시세 데이터)와 분리한 이유:
 *   - 시세(market prices) = API 에서 가져온 외부 데이터
 *   - 자산(assets)       = 사용자가 직접 입력한 내 데이터
 *
 * 저장 형식 (Asset 객체):
 *   {
 *     id: "uuid",              // 고유 ID (삭제 시 사용)
 *     name: "삼성전자",         // 종목명
 *     symbol: "005930",        // 종목코드
 *     assetType: "주식",        // 자산군
 *     quantity: 10,            // 보유 수량
 *     averageBuyPrice: 70000,  // 평균 매수가
 *     memo: "장기 보유",        // 메모
 *     createdAt: "2026-..."    // 등록 시각
 *   }
 */

/** localStorage 에 사용할 고정 키 이름 */
const STORAGE_KEY = 'aladdin_assets'

/**
 * localStorage 에서 보유 자산 목록을 읽어 옵니다.
 *
 * @returns {Array<Object>} 자산 배열. 없거나 오류면 []
 */
export function getAssets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw === null) {
      return []
    }

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      console.warn('[assetStorage] 저장된 데이터가 배열이 아닙니다.')
      return []
    }

    return parsed
  } catch (error) {
    console.error('[assetStorage] localStorage 읽기 실패:', error)
    return []
  }
}

/**
 * 자산 목록 전체를 localStorage 에 덮어씁니다.
 *
 * @param {Array<Object>} assets - 저장할 자산 배열
 */
export function saveAssets(assets) {
  if (!Array.isArray(assets)) {
    throw new Error('[assetStorage] saveAssets: assets 는 배열이어야 합니다.')
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets))
}

/**
 * 새 자산 1건을 목록 끝에 추가합니다.
 *
 * @param {Object} asset - id, createdAt 을 제외한 자산 정보
 * @returns {Object} 저장된 자산 (id, createdAt 포함)
 */
export function addAsset(asset) {
  const existingAssets = getAssets()

  // 고유 ID — crypto.randomUUID() 는 최신 브라우저에서 지원
  const newAsset = {
    ...asset,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }

  const updatedAssets = [...existingAssets, newAsset]
  saveAssets(updatedAssets)

  return newAsset
}

/**
 * id 로 자산 1건을 삭제합니다.
 *
 * @param {string} id - 삭제할 자산의 id
 * @returns {Array<Object>} 삭제 후 남은 자산 배열
 */
export function deleteAsset(id) {
  const existingAssets = getAssets()
  const updatedAssets = existingAssets.filter((asset) => asset.id !== id)
  saveAssets(updatedAssets)

  return updatedAssets
}
