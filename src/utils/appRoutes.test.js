import { describe, expect, it } from 'vitest'
import {
  APP_AREAS,
  TRADING_PAGES,
  buildAppHash,
  parseAppRoute,
} from './appRoutes.js'

describe('parseAppRoute', () => {
  it('defaults to assets when hash is empty', () => {
    expect(parseAppRoute('')).toEqual({
      area: APP_AREAS.ASSETS,
      tradingPage: TRADING_PAGES.HOME,
    })
  })

  it('parses trading home', () => {
    expect(parseAppRoute('#/trading')).toEqual({
      area: APP_AREAS.TRADING,
      tradingPage: TRADING_PAGES.HOME,
    })
  })

  it('parses trading subpages', () => {
    expect(parseAppRoute('#/trading/journal')).toEqual({
      area: APP_AREAS.TRADING,
      tradingPage: TRADING_PAGES.JOURNAL,
    })
  })

  it('falls back to trading home for unknown subpage', () => {
    expect(parseAppRoute('#/trading/unknown')).toEqual({
      area: APP_AREAS.TRADING,
      tradingPage: TRADING_PAGES.HOME,
    })
  })
})

describe('buildAppHash', () => {
  it('builds assets hash', () => {
    expect(buildAppHash({ area: APP_AREAS.ASSETS })).toBe('#/assets')
  })

  it('builds trading subpage hash', () => {
    expect(
      buildAppHash({
        area: APP_AREAS.TRADING,
        tradingPage: TRADING_PAGES.PAPER,
      }),
    ).toBe('#/trading/paper')
  })
})
