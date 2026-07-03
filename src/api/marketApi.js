/**
 * marketApi.js — 금융위원회 증권상품(ETF) 시세 API 호출
 * ─────────────────────────────────────────────────────────
 * ETF·ETN·ELW 시세를 가져옵니다. (현재 BASE_URL 은 ETF용)
 *
 * .env 변수:
 *   BASE_URL — getETFPriceInfo 까지 포함한 전체 URL
 *   API_KEY  — 공공데이터포털 인증키
 */

import { fetchPublicData } from './publicDataClient.js'

const BASE_URL = __BASE_URL__
const API_KEY = __API_KEY__

/**
 * ETF 시세 API 호출 (기존 fetchMarketData 이름 유지)
 *
 * @param {Object} [queryParams={}]
 * @returns {Promise<Object>} 공공데이터 JSON 응답
 */
export async function fetchMarketData(queryParams = {}) {
  return fetchPublicData(BASE_URL, API_KEY, queryParams, 'marketApi')
}
