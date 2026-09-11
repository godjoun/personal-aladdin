/**
 * localBypass.js — 로컬 전용 auth bypass 판정
 *
 * 목적: 내 Mac 의 127.0.0.1 전용 실행에서만 로그인 화면을 건너뛴다.
 * 기존 인증(비밀번호 해시 / 세션 / 잠금 / CSRF)은 그대로 남아 있고,
 * 이 모듈이 allowed=false 를 주면 즉시 원래 로그인 흐름으로 되돌아간다.
 *
 * 판정 규칙
 * - ALADDIN_LOCAL_AUTH_BYPASS 가 참이어야 요청으로 인정한다.
 * - loopback bind(127.0.0.1/localhost/::1) 가 아니면 허용하지 않는다.
 * - Render 등 호스팅 배포, reverse proxy 뒤(ALADDIN_TRUST_PROXY=1)는 허용하지 않는다.
 * - NODE_ENV=production 은 로컬 standalone(ALADDIN_LOCAL=1)일 때만 허용한다.
 *
 * fatal=true 인 조합은 "외부에 열린 서버에 bypass 플래그가 켜진" 위험한 설정이므로
 * 서버를 기동하지 않는다. fatal=false 인 조합은 bypass 만 끄고 로그인을 강제한다.
 */

import { getListenHost, isAladdinLocalMode, isRenderEnv } from '../listenConfig.js'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * bypass 세션의 내부 식별값. 실제 계정명/비밀번호와 무관하다.
 */
export const LOCAL_BYPASS_USER = Object.freeze({
  username: 'aladdin-local',
  isLocalBypass: true,
})

/**
 * @param {unknown} value
 */
function isTrue(value) {
  return TRUE_VALUES.has(String(value ?? '').trim().toLowerCase())
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isLocalAuthBypassRequested(env = process.env) {
  return isTrue(env.ALADDIN_LOCAL_AUTH_BYPASS)
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ requested: boolean, allowed: boolean, reason: string, fatal: boolean }}
 */
export function evaluateLocalAuthBypass(env = process.env) {
  const requested = isLocalAuthBypassRequested(env)

  if (!requested) {
    return { requested: false, allowed: false, reason: 'not_requested', fatal: false }
  }

  // 호스팅 배포에서는 절대 허용하지 않는다.
  if (isRenderEnv(env)) {
    return { requested, allowed: false, reason: 'hosted_deployment', fatal: true }
  }

  // reverse proxy 뒤 = 외부에서 도달 가능.
  if (isTrue(env.ALADDIN_TRUST_PROXY)) {
    return { requested, allowed: false, reason: 'trust_proxy', fatal: true }
  }

  // LAN/외부 bind 는 허용하지 않는다.
  if (!LOOPBACK_HOSTS.has(getListenHost(env))) {
    return { requested, allowed: false, reason: 'non_loopback_host', fatal: true }
  }

  // production 은 로컬 standalone 실행일 때만 허용한다.
  if (env.NODE_ENV === 'production' && !isAladdinLocalMode(env)) {
    return {
      requested,
      allowed: false,
      reason: 'production_without_local_mode',
      fatal: false,
    }
  }

  return { requested, allowed: true, reason: 'allowed', fatal: false }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isLocalAuthBypassAllowed(env = process.env) {
  return evaluateLocalAuthBypass(env).allowed
}

/**
 * 서버 기동 시 설정 검증.
 * 위험한 조합이면 throw, 그 외에는 판정 결과를 돌려준다.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertLocalAuthBypassSafe(env = process.env) {
  const state = evaluateLocalAuthBypass(env)

  if (state.requested && !state.allowed && state.fatal) {
    throw new Error(
      'ALADDIN_LOCAL_AUTH_BYPASS is only allowed for loopback-bound local runs ' +
        `(rejected: ${state.reason}). Remove the flag or bind to 127.0.0.1.`,
    )
  }

  return state
}
