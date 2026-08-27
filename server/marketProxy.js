/**
 * marketProxy.js — 공공데이터 API 서버 프록시 (trusted upstream only)
 */

import { PUBLIC_DATA_ALLOWED_KEYS } from './security/validate.js'

const DEFAULT_ETF_URL =
  'https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo'
const DEFAULT_STOCK_URL =
  'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo'

const ALLOWED_HOST = 'apis.data.go.kr'

function getDefaultBasDt() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * env BASE_URL이 신뢰 호스트인지 확인
 * @param {string} raw
 */
function assertTrustedBaseUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid upstream URL configuration')
  }
  if (url.protocol !== 'https:') {
    throw new Error('Upstream must use HTTPS')
  }
  if (url.hostname !== ALLOWED_HOST) {
    throw new Error('Upstream host is not allowed')
  }
  return url
}

/**
 * @param {'stock' | 'etf'} service
 * @param {Record<string, string>} queryParams
 */
export async function proxyPublicData(service, queryParams = {}) {
  const apiKey = process.env.API_KEY?.trim()

  if (!apiKey) {
    throw new Error('Public data API is not configured')
  }

  const baseRaw =
    service === 'stock'
      ? process.env.STOCK_BASE_URL?.trim() || DEFAULT_STOCK_URL
      : process.env.BASE_URL?.trim() || DEFAULT_ETF_URL

  const url = assertTrustedBaseUrl(baseRaw)
  url.search = ''
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('resultType', 'json')

  const defaultParams = {
    numOfRows: '10',
    pageNo: '1',
    basDt: getDefaultBasDt(),
  }

  const mergedParams = { ...defaultParams }
  for (const [key, value] of Object.entries(queryParams || {})) {
    if (!PUBLIC_DATA_ALLOWED_KEYS.has(key)) continue
    if (value === undefined || value === null) continue
    const str = String(value).slice(0, 80)
    if (!str) continue
    if (/^https?:/i.test(str) || str.includes('://')) continue
    mergedParams[key] = str
  }

  Object.entries(mergedParams).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })

  const response = await fetch(url.toString(), {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error('Public data upstream request failed')
  }

  return response.json()
}
