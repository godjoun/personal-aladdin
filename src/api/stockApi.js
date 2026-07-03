/**
 * stockApi.js — 금융위원회 주식시세 API 호출
 * ─────────────────────────────────────────────────────────
 * 일반 주식(삼성전자 005930 등) 시세를 가져옵니다.
 *
 * .env 변수:
 *   STOCK_BASE_URL — getStockPriceInfo 까지 포함한 전체 URL
 *   API_KEY        — 공공데이터포털 인증키 (ETF API 와 동일 키 사용 가능)
 *
 * 서비스 URL (포털):
 *   https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService
 * 실제 요청 URL:
 *   .../GetStockSecuritiesInfoService/getStockPriceInfo
 */

import { fetchPublicData } from './publicDataClient.js'

const STOCK_BASE_URL = __STOCK_BASE_URL__
const API_KEY = __API_KEY__

/**
 * 주식 시세 API 호출
 *
 * @param {Object} [queryParams={}]
 * @returns {Promise<Object>} 공공데이터 JSON 응답
 */
export async function fetchStockMarketData(queryParams = {}) {
  return fetchPublicData(
    STOCK_BASE_URL,
    API_KEY,
    queryParams,
    'stockApi',
  )
}
