/**
 * appRoutes.js — hash 기반 앱 영역 라우팅 (react-router 미사용)
 */

export const APP_AREAS = {
  ASSETS: 'assets',
  TRADING: 'trading',
}

export const TRADING_PAGES = {
  HOME: 'home',
  JOURNAL: 'journal',
  PAPER: 'paper',
  PERFORMANCE: 'performance',
}

const DEFAULT_ROUTE = {
  area: APP_AREAS.ASSETS,
  tradingPage: TRADING_PAGES.HOME,
}

function normalizePath(pathname) {
  const trimmed = String(pathname || '').replace(/^#/, '').replace(/^\//, '')
  const segments = trimmed.split('/').filter(Boolean)
  return segments
}

/**
 * @returns {{ area: string, tradingPage: string }}
 */
export function parseAppRoute(hash = '') {
  const segments = normalizePath(hash)

  if (segments.length === 0 || segments[0] === APP_AREAS.ASSETS) {
    return { ...DEFAULT_ROUTE }
  }

  if (segments[0] !== APP_AREAS.TRADING) {
    return { ...DEFAULT_ROUTE }
  }

  const tradingPage = segments[1] || TRADING_PAGES.HOME
  const allowed = new Set(Object.values(TRADING_PAGES))

  return {
    area: APP_AREAS.TRADING,
    tradingPage: allowed.has(tradingPage) ? tradingPage : TRADING_PAGES.HOME,
  }
}

export function buildAppHash({ area, tradingPage } = {}) {
  if (area === APP_AREAS.TRADING) {
    if (!tradingPage || tradingPage === TRADING_PAGES.HOME) {
      return '#/trading'
    }
    return `#/trading/${tradingPage}`
  }

  return '#/assets'
}

export function navigateAppRoute(next) {
  const hash = buildAppHash(next)
  if (window.location.hash !== hash) {
    window.location.hash = hash.slice(1)
  }
}
