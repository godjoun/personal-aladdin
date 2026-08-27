/**
 * listenConfig.test.js
 */

import { describe, expect, it } from 'vitest'
import {
  getListenHost,
  isAladdinLocalMode,
  shouldSendHsts,
  shouldUseSecureCookies,
} from './listenConfig.js'

describe('listenConfig', () => {
  it('로컬 기본 bind는 127.0.0.1', () => {
    expect(getListenHost({})).toBe('127.0.0.1')
    expect(getListenHost({ NODE_ENV: 'production' })).toBe('127.0.0.1')
  })

  it('Render 는 0.0.0.0', () => {
    expect(getListenHost({ RENDER: 'true' })).toBe('0.0.0.0')
  })

  it('ALADDIN_LISTEN_HOST 강제 가능', () => {
    expect(getListenHost({ ALADDIN_LISTEN_HOST: '0.0.0.0' })).toBe('0.0.0.0')
  })

  it('로컬 production HTTP 는 Secure 쿠키 끔', () => {
    expect(
      shouldUseSecureCookies(
        { secure: false, get: () => undefined },
        { isProd: true, env: { ALADDIN_LOCAL: '1' } },
      ),
    ).toBe(false)
    expect(
      shouldUseSecureCookies(
        { secure: false, get: () => undefined },
        { isProd: true, env: { NODE_ENV: 'production' } },
      ),
    ).toBe(false)
  })

  it('로컬에서는 HSTS 안 보냄', () => {
    expect(shouldSendHsts({ NODE_ENV: 'production', ALADDIN_LOCAL: '1' })).toBe(
      false,
    )
    expect(shouldSendHsts({ NODE_ENV: 'production' })).toBe(false)
    expect(
      shouldSendHsts({ NODE_ENV: 'production', RENDER: 'true' }),
    ).toBe(true)
  })

  it('ALADDIN_LOCAL 모드 인식', () => {
    expect(isAladdinLocalMode({ ALADDIN_LOCAL: '1' })).toBe(true)
    expect(isAladdinLocalMode({})).toBe(false)
  })
})
