/**
 * localAuthMode.js — 로컬 전용 모드 부트스트랩 플래그 읽기
 *
 * 서버가 로컬 bypass 상태일 때 index.html 에 meta 태그를 심어 보낸다.
 * 이 값을 초기 state 로 쓰면 /api/auth/me 응답을 기다리는 동안
 * 로딩/로그인 화면이 깜빡이지 않는다.
 *
 * 값은 boolean 플래그뿐이며, 서버 판정이 최종 권한을 갖는다.
 */

const META_NAME = 'aladdin-local-auth-bypass'

/**
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function readLocalAuthBypassFlag(doc = globalThis.document) {
  const meta = doc?.querySelector?.(`meta[name="${META_NAME}"]`)
  if (!meta) return false
  return meta.getAttribute('content') === '1'
}
