/**
 * marketApi.js — ETF 시세 조회 (서버 프록시 경유)
 */

import { fetchPublicData } from './publicDataClient.js'

/**
 * ETF 시세 API 호출
 *
 * @param {Object} [queryParams={}]
 * @returns {Promise<Object>}
 */
export async function fetchMarketData(queryParams = {}) {
  return fetchPublicData(queryParams, 'etf', 'marketApi')
}
