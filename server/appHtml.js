/**
 * appHtml.js — dist/index.html 제공 + 부트스트랩 meta 주입
 *
 * 로컬 bypass 상태를 첫 HTML 에 실어 보내면
 * 프론트가 /api/auth/me 응답을 기다리지 않고 바로 Dashboard 를 그릴 수 있다.
 *
 * CSP 가 script-src 'self' 이므로 인라인 script 대신 meta 태그를 쓴다.
 * 담는 값은 boolean 플래그 하나뿐이며, 계정명·세션·secret 은 넣지 않는다.
 */

import fs from 'fs'
import path from 'path'

export const LOCAL_BYPASS_META_NAME = 'aladdin-local-auth-bypass'
export const SPA_INDEX_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, proxy-revalidate'

/**
 * @param {string} html
 * @param {{ localAuthBypass?: boolean }} [options]
 */
export function injectBootstrapMeta(html, options = {}) {
  if (!options.localAuthBypass) return html

  const meta = `<meta name="${LOCAL_BYPASS_META_NAME}" content="1">`
  if (html.includes(meta)) return html

  const headClose = '</head>'
  if (html.includes(headClose)) {
    return html.replace(headClose, `    ${meta}\n  ${headClose}`)
  }
  return `${meta}${html}`
}

/**
 * SPA entry HTML 은 asset hash 목록을 담고 있으므로 빌드 후 오래 들고 있으면
 * 브라우저가 삭제된 이전 JS/CSS 를 요청할 수 있다. 파일 변경을 감지해 다시 읽는다.
 *
 * @param {{ distPath: string, localAuthBypass?: boolean }} options
 */
export function createAppHtmlProvider(options) {
  const { distPath, localAuthBypass = false } = options
  const indexPath = path.join(distPath, 'index.html')

  /** @type {string | null} */
  let cached = null
  let cachedSignature = ''

  return function getAppHtml() {
    const stat = fs.statSync(indexPath)
    const signature = `${stat.mtimeMs}:${stat.size}`
    if (cached === null || cachedSignature !== signature) {
      cached = injectBootstrapMeta(fs.readFileSync(indexPath, 'utf8'), {
        localAuthBypass,
      })
      cachedSignature = signature
    }
    return cached
  }
}

/**
 * @param {{ set: (name: string, value: string) => unknown }} res
 */
export function setSpaIndexCacheHeaders(res) {
  res.set('Cache-Control', SPA_INDEX_CACHE_CONTROL)
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  res.set('Surrogate-Control', 'no-store')
}
