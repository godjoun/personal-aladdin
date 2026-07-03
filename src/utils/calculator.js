/**
 * calculator.js — 포트폴리오 계산 유틸
 * ─────────────────────────────────────────────────────────
 * localStorage 에 저장된 시세(prices)를 바탕으로
 * 평가금액, 손익, 수익률 등을 계산합니다.
 *
 * 이 파일은 "숫자 계산"만 담당합니다.
 *   - 화면 표시 → pages/
 *   - 데이터 저장 → services/storage.js
 *   - API 호출   → api/marketApi.js
 *
 * 나중에 포트폴리오 평가금액, 자산 비중, 리스크 계산의
 * 기초가 되는 함수들을 여기에 모아 둡니다.
 */

/**
 * 문자열·숫자를 안전하게 숫자로 바꿉니다.
 * API 종가(closePrice)는 "75000" 같은 문자열로 올 수 있습니다.
 *
 * @param {number|string} value - 변환할 값
 * @returns {number} 유효한 숫자. 변환 불가 시 0
 */
function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/**
 * 특정 종목(symbol)의 "가장 최근" 시세 1건을 찾습니다.
 *
 * @param {Array<Object>} prices - storage 에서 읽은 시세 배열
 * @param {string} symbol - 종목 코드 (예: "005930")
 * @returns {Object|null} 최신 MarketPrice 객체. 없으면 null
 *
 * 동작 방식:
 *   1. symbol 이 같은 항목만 필터
 *   2. date(기준일) 기준 내림차순 정렬 → 맨 앞이 최신
 */
export function getLatestPriceBySymbol(prices, symbol) {
  if (!Array.isArray(prices) || !symbol) {
    return null
  }

  const matched = prices.filter((price) => price.symbol === symbol)

  if (matched.length === 0) {
    return null
  }

  // date 는 "YYYYMMDD" 형식 → 문자열 비교로도 날짜 순서가 맞음
  const sorted = [...matched].sort((a, b) => b.date.localeCompare(a.date))

  return sorted[0]
}

/**
 * 특정 종목(symbol)의 시세 "이력" 전체를 날짜순으로 반환합니다.
 *
 * @param {Array<Object>} prices - storage 에서 읽은 시세 배열
 * @param {string} symbol - 종목 코드
 * @returns {Array<Object>} 날짜 오름차순(과거 → 최신) 배열
 *
 * 용도 예시:
 *   - 차트 그리기
 *   - 기간별 수익률 분석
 *   - 변동성(리스크) 계산의 입력 데이터
 */
export function getPriceHistoryBySymbol(prices, symbol) {
  if (!Array.isArray(prices) || !symbol) {
    return []
  }

  return prices
    .filter((price) => price.symbol === symbol)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 보유 평가금액을 계산합니다.
 *
 * 공식: 보유 수량 × 최신 가격
 *
 * @param {number|string} quantity - 보유 수량 (주식이면 주 수)
 * @param {number|string} latestPrice - 최신 가격 (보통 종가)
 * @returns {number} 평가금액 (원)
 *
 * 예시:
 *   calculateHoldingValue(10, 75000) → 750000
 */
export function calculateHoldingValue(quantity, latestPrice) {
  const qty = toNumber(quantity)
  const price = toNumber(latestPrice)

  return qty * price
}

/**
 * 평가 손익(금액)을 계산합니다.
 *
 * 공식: (최신 가격 - 평균 매수가) × 보유 수량
 *
 * @param {number|string} quantity - 보유 수량
 * @param {number|string} averageBuyPrice - 평균 매수 단가
 * @param {number|string} latestPrice - 최신 가격
 * @returns {number} 손익 금액. 양수=이익, 음수=손실
 *
 * 예시:
 *   매수가 70,000원, 현재가 75,000원, 10주 보유
 *   → (75000 - 70000) × 10 = 50000 (5만 원 이익)
 */
export function calculateProfitLoss(quantity, averageBuyPrice, latestPrice) {
  const qty = toNumber(quantity)
  const avgPrice = toNumber(averageBuyPrice)
  const currentPrice = toNumber(latestPrice)

  return (currentPrice - avgPrice) * qty
}

/**
 * 수익률(%)을 계산합니다.
 *
 * 공식: ((최신 가격 - 평균 매수가) / 평균 매수가) × 100
 *
 * @param {number|string} averageBuyPrice - 평균 매수 단가
 * @param {number|string} latestPrice - 최신 가격
 * @returns {number} 수익률(%). 양수=수익, 음수=손실
 *
 * 예시:
 *   매수가 70,000원, 현재가 75,000원
 *   → ((75000 - 70000) / 70000) × 100 ≈ 7.14 (%)
 */
export function calculateProfitRate(averageBuyPrice, latestPrice) {
  const avgPrice = toNumber(averageBuyPrice)
  const currentPrice = toNumber(latestPrice)

  // 0 으로 나누면 Infinity 가 되므로 방어
  if (avgPrice === 0) {
    return 0
  }

  return ((currentPrice - avgPrice) / avgPrice) * 100
}

/**
 * 자산군(assetType)별 평가금액 비중을 계산합니다.
 *
 * 입력: buildAssetRows() 가 만든 행 배열
 *   - hasPrice, holdingValue, assetType 필드 필요
 *
 * assetType 은 AssetForm 의 "자산군" 값입니다.
 * (요청서의 assetClass 와 같은 의미)
 *
 * @param {Array<Object>} assetRows - 보유 자산 + 시세 매칭 결과
 * @returns {{
 *   groups: Array<{ assetClass: string, totalValue: number, weight: number, assetCount: number }>,
 *   totalValuedAmount: number,
 *   noPriceAssets: Array<Object>,
 *   noPriceCount: number
 * }}
 */
export function calculateAssetClassAllocation(assetRows) {
  if (!Array.isArray(assetRows)) {
    return {
      groups: [],
      totalValuedAmount: 0,
      noPriceAssets: [],
      noPriceCount: 0,
    }
  }

  // 시세가 있는 자산만 비중 계산에 포함
  const valuedRows = assetRows.filter((row) => row.hasPrice)
  const noPriceAssets = assetRows.filter((row) => !row.hasPrice)

  // 전체 평가금액 합계 (비중 % 의 분모)
  const totalValuedAmount = valuedRows.reduce(
    (sum, row) => sum + row.holdingValue,
    0,
  )

  // assetType(자산군)별로 평가금액 합산
  const groupMap = new Map()

  for (const row of valuedRows) {
    const assetClass = row.assetType || '기타'

    const existing = groupMap.get(assetClass) || {
      assetClass,
      totalValue: 0,
      assetCount: 0,
    }

    existing.totalValue += row.holdingValue
    existing.assetCount += 1
    groupMap.set(assetClass, existing)
  }

  // 비중(%) 계산 후 평가금액 내림차순 정렬
  const groups = Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      weight:
        totalValuedAmount > 0
          ? (group.totalValue / totalValuedAmount) * 100
          : 0,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)

  return {
    groups,
    totalValuedAmount,
    noPriceAssets,
    noPriceCount: noPriceAssets.length,
  }
}
