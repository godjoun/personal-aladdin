/**
 * storage.js — localStorage 저장 계층
 * ─────────────────────────────────────────────────────────
 * API로 가져온 시세 데이터를 브라우저 localStorage 에 안전하게 저장합니다.
 *
 * localStorage 란?
 *   - 브라우저에 문자열을 영구 저장하는 공간입니다.
 *   - 페이지를 새로고침해도 데이터가 남습니다.
 *   - 같은 도메인(사이트)에서만 접근할 수 있습니다.
 *
 * 저장 형식 (MarketPrice 객체):
 *   {
 *     symbol: "005930",      // 종목 코드
 *     date: "20260102",      // 기준일 (YYYYMMDD)
 *     name: "삼성전자",       // 종목명 (선택)
 *     closePrice: 75000,     // 종가 (선택)
 *     ...                    // 그 외 API 필드
 *   }
 *
 * 중복 방지 규칙:
 *   - symbol + date 가 같으면 "같은 데이터"로 봅니다.
 *   - upsertMarketPrices() 는 기존 항목을 덮어씁니다(업데이트).
 */

/** localStorage 에 사용할 고정 키 이름 */
const STORAGE_KEY = 'aladdin_market_prices'

/**
 * symbol + date 로 고유 키 문자열을 만듭니다.
 * Map 에서 "이미 있는 데이터인지" 빠르게 찾을 때 사용합니다.
 *
 * @param {string} symbol - 종목 코드
 * @param {string} date - 기준일
 * @returns {string} 예: "005930|20260102"
 */
function makePriceKey(symbol, date) {
  return `${symbol}|${date}`
}

/**
 * localStorage 에서 시세 목록을 읽어 옵니다.
 *
 * @returns {Array<Object>} 저장된 시세 배열. 없거나 오류면 빈 배열 []
 */
export function getMarketPrices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    // 아직 한 번도 저장하지 않은 경우
    if (raw === null) {
      return []
    }

    const parsed = JSON.parse(raw)

    // 예전에 잘못 저장된 값(배열이 아닌 경우) 방어
    if (!Array.isArray(parsed)) {
      console.warn('[storage] 저장된 데이터가 배열이 아닙니다. 빈 배열을 반환합니다.')
      return []
    }

    return parsed
  } catch (error) {
    // JSON 파싱 실패 등 — 앱이 죽지 않도록 빈 배열 반환
    console.error('[storage] localStorage 읽기 실패:', error)
    return []
  }
}

/**
 * 시세 목록 전체를 localStorage 에 덮어씁니다.
 * (기존 데이터를 완전히 새 목록으로 교체할 때 사용)
 *
 * @param {Array<Object>} prices - 저장할 시세 배열
 */
export function saveMarketPrices(prices) {
  if (!Array.isArray(prices)) {
    throw new Error('[storage] saveMarketPrices: prices 는 배열이어야 합니다.')
  }

  // localStorage 는 문자열만 저장 가능 → JSON.stringify 로 변환
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prices))
}

/**
 * 새 시세를 기존 데이터와 합칩니다 (upsert = update + insert).
 *
 * - symbol + date 가 같으면: 새 값으로 업데이트 (중복 저장 안 함)
 * - 없으면: 새 항목 추가
 *
 * @param {Array<Object>} newPrices - 추가/갱신할 시세 배열
 * @returns {{ total: number, inserted: number, updated: number }}
 *   total    — 저장 후 전체 개수
 *   inserted — 새로 추가된 개수
 *   updated  — 기존 항목을 갱신한 개수
 */
export function upsertMarketPrices(newPrices) {
  if (!Array.isArray(newPrices)) {
    throw new Error('[storage] upsertMarketPrices: newPrices 는 배열이어야 합니다.')
  }

  // 1) 기존 데이터 불러오기
  const existingPrices = getMarketPrices()

  // 2) Map 으로 symbol+date 기준 인덱스 구성
  const priceMap = new Map()

  for (const price of existingPrices) {
    if (price.symbol && price.date) {
      priceMap.set(makePriceKey(price.symbol, price.date), price)
    }
  }

  // 3) 새 데이터를 넣거나 덮어쓰기
  let inserted = 0
  let updated = 0

  for (const price of newPrices) {
    // symbol, date 가 없으면 저장할 수 없으므로 건너뜀
    if (!price.symbol || !price.date) {
      console.warn('[storage] symbol 또는 date 가 없는 항목을 건너뜁니다:', price)
      continue
    }

    const key = makePriceKey(price.symbol, price.date)
    const alreadyExists = priceMap.has(key)

    if (alreadyExists) {
      // 기존 객체 + 새 객체 병합 (새 값이 우선)
      priceMap.set(key, { ...priceMap.get(key), ...price })
      updated += 1
    } else {
      priceMap.set(key, price)
      inserted += 1
    }
  }

  // 4) Map → 배열로 변환 후 저장
  const mergedPrices = Array.from(priceMap.values())
  saveMarketPrices(mergedPrices)

  return {
    total: mergedPrices.length,
    inserted,
    updated,
  }
}

/**
 * 저장된 시세 데이터를 모두 삭제합니다.
 */
export function clearMarketPrices() {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * 공공데이터 API 응답(JSON)을 저장용 시세 배열로 변환합니다.
 *
 * 금융위원회 주식시세 API 응답 구조:
 *   response.body.items.item → 종목 배열 (1건이면 객체 1개로 올 수 있음)
 *
 * @param {Object} apiResponse - fetchMarketData() 가 반환한 원본 JSON
 * @returns {Array<Object>} storage 에 넣을 수 있는 MarketPrice 배열
 */
export function parseMarketPricesFromApi(apiResponse) {
  const items = apiResponse?.response?.body?.items?.item

  if (!items) {
    console.warn('[storage] API 응답에서 시세 항목(items.item)을 찾을 수 없습니다.')
    return []
  }

  // API 는 데이터 1건일 때 배열이 아닌 객체로 줄 수 있음 → 항상 배열로 통일
  const itemList = Array.isArray(items) ? items : [items]

  return itemList.map((item) => ({
    symbol: item.srtnCd, // 단축 종목코드 (예: 005930)
    date: item.basDt, // 기준일자 (예: 20260102)
    name: item.itmsNm, // 종목명
    closePrice: item.clpr, // 종가
    openPrice: item.mkp, // 시가
    highPrice: item.hipr, // 고가
    lowPrice: item.lopr, // 저가
    volume: item.trqu, // 거래량
    tradeAmount: item.trPrc, // 거래대금
    change: item.vs, // 전일 대비
    changeRate: item.fltRt, // 등락률
    isinCode: item.isinCd, // ISIN 코드
    market: item.mrktCtg, // 시장 구분
  }))
}
