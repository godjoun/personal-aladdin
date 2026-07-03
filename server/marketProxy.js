/**
 * marketProxy.js — 공공데이터 API 서버 프록시 (배포용)
 * API_KEY 는 서버 환경 변수에만 두고, 브라우저에는 노출하지 않습니다.
 */

const DEFAULT_ETF_URL =
  'https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo'
const DEFAULT_STOCK_URL =
  'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo'

function getDefaultBasDt() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * @param {'stock' | 'etf'} service
 * @param {Record<string, string>} queryParams
 */
export async function proxyPublicData(service, queryParams = {}) {
  const apiKey = process.env.API_KEY?.trim()

  if (!apiKey) {
    throw new Error('서버에 API_KEY 가 설정되지 않았습니다. Render 환경 변수를 확인하세요.')
  }

  const baseUrl =
    service === 'stock'
      ? process.env.STOCK_BASE_URL?.trim() || DEFAULT_STOCK_URL
      : process.env.BASE_URL?.trim() || DEFAULT_ETF_URL

  const url = new URL(baseUrl)
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('resultType', 'json')

  const defaultParams = {
    numOfRows: '10',
    pageNo: '1',
    basDt: getDefaultBasDt(),
  }

  const mergedParams = { ...defaultParams, ...queryParams }
  Object.entries(mergedParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(`공공데이터 HTTP 오류: ${response.status} ${response.statusText}`)
  }

  return response.json()
}
