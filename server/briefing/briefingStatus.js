/**
 * briefingStatus.js — 외부 연동 설정 여부만 반환 (키 값 미포함)
 */

import { getDartConfigStatus } from '../dart/dartProvider.js'
import {
  ensureDartCorpCodeMap,
  isDartCorpMapReady,
} from '../dart/corpCodeMap.js'
import { getNaverNewsConfigStatus } from '../news/newsProvider.js'

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function isKiwoomConfigured(env = process.env) {
  const pairs = [
    [env.KIWOOM_ISA_APP_KEY, env.KIWOOM_ISA_APP_SECRET],
    [env.KIWOOM_GENERAL_APP_KEY, env.KIWOOM_GENERAL_APP_SECRET],
  ]
  return pairs.some(
    ([key, secret]) => Boolean(key?.trim()) && Boolean(secret?.trim()),
  )
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   refreshCorpMap?: boolean,
 * }} [options]
 */
export async function getBriefingIntegrationStatus(options = {}) {
  const env = options.env || process.env
  const naver = getNaverNewsConfigStatus(env)
  const dart = getDartConfigStatus(env)

  let dartCorpMapReady = isDartCorpMapReady()
  if (dart.configured && options.refreshCorpMap !== false) {
    const map = await ensureDartCorpCodeMap({
      env,
      fetchImpl: options.fetchImpl,
    })
    dartCorpMapReady = Boolean(map.ready)
  }

  return {
    kiwoom: isKiwoomConfigured(env),
    naverNews: Boolean(naver.configured),
    dart: Boolean(dart.configured),
    dartCorpMapReady,
  }
}
