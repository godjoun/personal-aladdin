/**
 * calculator.js — 포트폴리오 계산 유틸
 * ─────────────────────────────────────────────────────────
 * localStorage 에 저장된 시세(prices)를 바탕으로
 * 평가금액, 손익, 수익률 등을 계산합니다.
 *
 * 현재가 null/undefined/빈문자열/비가정 숫자는 0원으로 취급하지 않습니다.
 */

/**
 * 계산에 쓸 수 있는 현재가인지 판별합니다.
 * 0 이하는 유효 시세로 보지 않습니다.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasValidPrice(value) {
  if (value === null || value === undefined || value === '') {
    return false
  }

  const num = Number(value)
  return Number.isFinite(num) && num > 0
}

/**
 * 문자열·숫자를 안전하게 숫자로 바꿉니다.
 * 변환 불가 시 null (0 으로 강제하지 않음)
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toNumberOrZero(value) {
  const num = toNullableNumber(value)
  return num == null ? 0 : num
}

/**
 * 특정 종목(symbol)의 "가장 최근" 시세 1건을 찾습니다.
 *
 * @param {Array<Object>} prices - storage 에서 읽은 시세 배열
 * @param {string} symbol - 종목 코드 (예: "005930")
 * @returns {Object|null} 최신 MarketPrice 객체. 없으면 null
 */
export function getLatestPriceBySymbol(prices, symbol) {
  if (!Array.isArray(prices) || !symbol) {
    return null
  }

  const matched = prices.filter((price) => price.symbol === symbol)

  if (matched.length === 0) {
    return null
  }

  const sorted = [...matched].sort((a, b) => b.date.localeCompare(a.date))

  return sorted[0]
}

/**
 * 특정 종목(symbol)의 시세 "이력" 전체를 날짜순으로 반환합니다.
 *
 * @param {Array<Object>} prices
 * @param {string} symbol
 * @returns {Array<Object>}
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
 * 보유 평가금액: 수량 × 현재가
 * 현재가가 없으면 null
 *
 * @param {number|string} quantity
 * @param {number|string|null|undefined} latestPrice
 * @returns {number | null}
 */
export function calculateHoldingValue(quantity, latestPrice) {
  if (!hasValidPrice(latestPrice)) {
    return null
  }

  const qty = toNullableNumber(quantity)
  if (qty == null) {
    return null
  }

  return qty * Number(latestPrice)
}

/**
 * 평가 손익: (현재가 - 평균매수가) × 수량
 * 현재가가 없으면 null
 *
 * @param {number|string} quantity
 * @param {number|string} averageBuyPrice
 * @param {number|string|null|undefined} latestPrice
 * @returns {number | null}
 */
export function calculateProfitLoss(quantity, averageBuyPrice, latestPrice) {
  if (!hasValidPrice(latestPrice)) {
    return null
  }

  const qty = toNullableNumber(quantity)
  const avgPrice = toNullableNumber(averageBuyPrice)
  if (qty == null || avgPrice == null) {
    return null
  }

  return (Number(latestPrice) - avgPrice) * qty
}

/**
 * 수익률(%): ((현재가 - 평균매수가) / 평균매수가) × 100
 * 현재가가 없으면 null
 *
 * @param {number|string} averageBuyPrice
 * @param {number|string|null|undefined} latestPrice
 * @returns {number | null}
 */
export function calculateProfitRate(averageBuyPrice, latestPrice) {
  if (!hasValidPrice(latestPrice)) {
    return null
  }

  const avgPrice = toNullableNumber(averageBuyPrice)
  if (avgPrice == null || avgPrice === 0) {
    return null
  }

  return ((Number(latestPrice) - avgPrice) / avgPrice) * 100
}

/**
 * 자산군(assetType)별 평가금액 비중
 *
 * @param {Array<Object>} assetRows
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

  const valuedRows = assetRows.filter((row) => row.hasPrice)
  const noPriceAssets = assetRows.filter((row) => !row.hasPrice)

  const totalValuedAmount = valuedRows.reduce(
    (sum, row) => sum + toNumberOrZero(row.holdingValue),
    0,
  )

  const groupMap = new Map()

  for (const row of valuedRows) {
    const assetClass = row.assetType || '기타'

    const existing = groupMap.get(assetClass) || {
      assetClass,
      totalValue: 0,
      assetCount: 0,
    }

    existing.totalValue += toNumberOrZero(row.holdingValue)
    existing.assetCount += 1
    groupMap.set(assetClass, existing)
  }

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
