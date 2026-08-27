/**
 * publicDataClient.js — 공공데이터 API 클라이언트
 * 브라우저는 인증키를 갖지 않습니다. Express 프록시만 사용합니다.
 */

import { apiFetch } from '../services/apiClient.js'

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

function buildQueryParams(queryParams = {}) {
  return {
    numOfRows: '10',
    pageNo: '1',
    basDt: getDefaultBasDt(),
    ...queryParams,
  }
}

/**
 * 서버 프록시를 통해 공공데이터 API를 호출합니다.
 */
export async function fetchPublicData(
  queryParams = {},
  service = 'etf',
  sourceLabel = 'api',
) {
  const params = new URLSearchParams()
  params.set('service', service === 'stock' ? 'stock' : 'etf')

  const mergedParams = buildQueryParams(queryParams)
  Object.entries(mergedParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      params.set(key, String(value))
    }
  })

  const response = await apiFetch(`/api/public-data?${params.toString()}`)

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(
      body.error ||
        body.message ||
        `[${sourceLabel}] 시세 서버 오류: ${response.status} ${response.statusText}`,
    )
  }

  return response.json()
}
