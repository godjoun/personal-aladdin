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
 * index.html 을 1회 읽어 캐시한다.
 *
 * @param {{ distPath: string, localAuthBypass?: boolean }} options
 */
export function createAppHtmlProvider(options) {
  const { distPath, localAuthBypass = false } = options
  const indexPath = path.join(distPath, 'index.html')

  /** @type {string | null} */
  let cached = null

  return function getAppHtml() {
    if (cached === null) {
      cached = injectBootstrapMeta(fs.readFileSync(indexPath, 'utf8'), {
        localAuthBypass,
      })
    }
    return cached
  }
}
