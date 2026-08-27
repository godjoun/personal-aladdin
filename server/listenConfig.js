/**
 * listenConfig.js — bind host / local production 헬퍼
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isRenderEnv(env = process.env) {
  return Boolean(env.RENDER || env.RENDER_SERVICE_ID)
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isAladdinLocalMode(env = process.env) {
  return env.ALADDIN_LOCAL === '1' || env.ALADDIN_LOCAL === 'true'
}

/**
 * 로컬 기본: 127.0.0.1 — LAN 비노출
 * Render 등: 0.0.0.0
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getListenHost(env = process.env) {
  const forced = env.ALADDIN_LISTEN_HOST?.trim()
  if (forced) return forced
  if (isRenderEnv(env)) return '0.0.0.0'
  return '127.0.0.1'
}

/**
 * 로컬 loopback HTTP 에서는 Secure 쿠키를 쓰지 않는다.
 * @param {import('express').Request} req
 * @param {{ isProd?: boolean, env?: NodeJS.ProcessEnv }} [options]
 */
export function shouldUseSecureCookies(req, options = {}) {
  const env = options.env || process.env
  const isProd = options.isProd ?? env.NODE_ENV === 'production'

  if (env.ALADDIN_COOKIE_SECURE === '0') return false
  if (env.ALADDIN_COOKIE_SECURE === '1') return true

  if (isAladdinLocalMode(env)) return false

  const host = getListenHost(env)
  if (host === '127.0.0.1' || host === 'localhost') return false

  if (isProd) return true
  return Boolean(req?.secure) || req?.get?.('x-forwarded-proto') === 'https'
}

/**
 * HSTS 는 HTTPS 배포(Render)에만
 * @param {NodeJS.ProcessEnv} [env]
 */
export function shouldSendHsts(env = process.env) {
  if (env.NODE_ENV !== 'production') return false
  if (isAladdinLocalMode(env)) return false
  const host = getListenHost(env)
  if (host === '127.0.0.1' || host === 'localhost') return false
  return true
}
