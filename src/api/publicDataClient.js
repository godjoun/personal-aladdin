/**
 * publicDataClient.js — 공공데이터 API 공통 fetch
 * ─────────────────────────────────────────────────────────
 * ETF·주식 등 여러 API가 같은 방식으로 호출되므로
 * 공통 로직을 한곳에 모아 둡니다.
 */

/**
 * 시세 조회용 기준일(어제)을 YYYYMMDD 형식으로 반환합니다.
 */
export function getDefaultBasDt() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * 공공데이터포털 REST API 공통 호출
 *
 * @param {string} baseUrl - 요청 주소 전체 (오퍼레이션까지 포함)
 * @param {string} apiKey - serviceKey
 * @param {Object} [queryParams={}] - 추가 쿼리 파라미터
 * @param {string} [sourceLabel='api'] - 에러 메시지용 이름
 */
function buildQueryParams(queryParams = {}) {
  return {
    numOfRows: '10',
    pageNo: '1',
    basDt: getDefaultBasDt(),
    ...queryParams,
  }
}

/**
 * 배포 환경 — 같은 서버의 /api/public-data 프록시 사용 (API_KEY 서버에만 둠)
 */
async function fetchViaServerProxy(queryParams, sourceLabel) {
  const service = sourceLabel === 'stockApi' ? 'stock' : 'etf'
  const url = new URL('/api/public-data', window.location.origin)
  url.searchParams.set('service', service)

  const mergedParams = buildQueryParams(queryParams)
  Object.entries(mergedParams).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })

  const response = await fetch(url.toString())

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(
      body.error ||
        `[${sourceLabel}] 프록시 HTTP 오류: ${response.status} ${response.statusText}`,
    )
  }

  return response.json()
}

export async function fetchPublicData(
  baseUrl,
  apiKey,
  queryParams = {},
  sourceLabel = 'api',
) {
  if (import.meta.env.PROD) {
    return fetchViaServerProxy(queryParams, sourceLabel)
  }

  if (!baseUrl) {
    throw new Error(
      `[${sourceLabel}] 요청 URL 이 비어 있습니다. .env 파일을 확인하세요.`,
    )
  }

  if (!apiKey) {
    throw new Error(
      `[${sourceLabel}] API_KEY 가 비어 있습니다. .env 파일을 확인하세요.`,
    )
  }

  const url = new URL(baseUrl)
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('resultType', 'json')

  const mergedParams = buildQueryParams(queryParams)
  Object.entries(mergedParams).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(
      `[${sourceLabel}] HTTP 오류: ${response.status} ${response.statusText}`,
    )
  }

  return response.json()
}
