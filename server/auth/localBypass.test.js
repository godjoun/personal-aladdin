/**
 * localBypass.test.js — 로컬 전용 auth bypass 판정 규칙
 */

import { describe, expect, it } from 'vitest'
import {
  LOCAL_BYPASS_USER,
  assertLocalAuthBypassSafe,
  evaluateLocalAuthBypass,
  isLocalAuthBypassAllowed,
  isLocalAuthBypassRequested,
} from './localBypass.js'
import {
  LOCAL_BYPASS_META_NAME,
  injectBootstrapMeta,
} from '../appHtml.js'

/** 로컬 standalone 실행(LaunchAgent) 과 동일한 환경 */
const LOCAL_ENV = Object.freeze({
  ALADDIN_LOCAL_AUTH_BYPASS: 'true',
  NODE_ENV: 'production',
  ALADDIN_LOCAL: '1',
  ALADDIN_LISTEN_HOST: '127.0.0.1',
})

describe('bypass 요청 인식', () => {
  it('참값 표기를 모두 인식한다', () => {
    for (const value of ['true', 'TRUE', '1', 'yes', 'on', ' true ']) {
      expect(isLocalAuthBypassRequested({ ALADDIN_LOCAL_AUTH_BYPASS: value })).toBe(
        true,
      )
    }
  })

  it('없거나 false 면 요청하지 않은 것으로 본다', () => {
    for (const value of [undefined, '', 'false', '0', 'no', 'maybe']) {
      expect(isLocalAuthBypassRequested({ ALADDIN_LOCAL_AUTH_BYPASS: value })).toBe(
        false,
      )
    }
  })
})

describe('bypass 허용 조건', () => {
  it('loopback 로컬 실행에서는 허용한다', () => {
    expect(evaluateLocalAuthBypass(LOCAL_ENV)).toEqual({
      requested: true,
      allowed: true,
      reason: 'allowed',
      fatal: false,
    })
  })

  it('개발 모드 loopback 에서도 허용한다', () => {
    expect(
      isLocalAuthBypassAllowed({ ALADDIN_LOCAL_AUTH_BYPASS: 'true' }),
    ).toBe(true)
    expect(
      isLocalAuthBypassAllowed({
        ALADDIN_LOCAL_AUTH_BYPASS: 'true',
        ALADDIN_LISTEN_HOST: 'localhost',
      }),
    ).toBe(true)
  })

  it('플래그가 없으면 허용하지 않는다', () => {
    expect(evaluateLocalAuthBypass({})).toEqual({
      requested: false,
      allowed: false,
      reason: 'not_requested',
      fatal: false,
    })
    expect(
      isLocalAuthBypassAllowed({ ...LOCAL_ENV, ALADDIN_LOCAL_AUTH_BYPASS: 'false' }),
    ).toBe(false)
  })

  it('0.0.0.0 bind 는 거부하고 치명적 설정으로 본다', () => {
    const state = evaluateLocalAuthBypass({
      ...LOCAL_ENV,
      ALADDIN_LISTEN_HOST: '0.0.0.0',
    })
    expect(state.allowed).toBe(false)
    expect(state.reason).toBe('non_loopback_host')
    expect(state.fatal).toBe(true)
  })

  it('LAN IP bind 도 거부한다', () => {
    expect(
      isLocalAuthBypassAllowed({
        ...LOCAL_ENV,
        ALADDIN_LISTEN_HOST: '192.168.0.12',
      }),
    ).toBe(false)
  })

  it('호스팅 배포(Render)는 거부한다', () => {
    for (const env of [
      { ...LOCAL_ENV, RENDER: 'true' },
      { ...LOCAL_ENV, RENDER_SERVICE_ID: 'srv-123' },
    ]) {
      const state = evaluateLocalAuthBypass(env)
      expect(state.allowed).toBe(false)
      expect(state.reason).toBe('hosted_deployment')
      expect(state.fatal).toBe(true)
    }
  })

  it('Render 는 host 강제 없이도 거부한다', () => {
    const state = evaluateLocalAuthBypass({
      ALADDIN_LOCAL_AUTH_BYPASS: 'true',
      NODE_ENV: 'production',
      RENDER: 'true',
    })
    expect(state.allowed).toBe(false)
    expect(state.fatal).toBe(true)
  })

  it('reverse proxy 뒤(ALADDIN_TRUST_PROXY=1)는 거부한다', () => {
    const state = evaluateLocalAuthBypass({ ...LOCAL_ENV, ALADDIN_TRUST_PROXY: '1' })
    expect(state.allowed).toBe(false)
    expect(state.reason).toBe('trust_proxy')
    expect(state.fatal).toBe(true)
  })

  it('production 인데 로컬 모드가 아니면 로그인을 강제한다', () => {
    const state = evaluateLocalAuthBypass({
      ALADDIN_LOCAL_AUTH_BYPASS: 'true',
      NODE_ENV: 'production',
      ALADDIN_LISTEN_HOST: '127.0.0.1',
    })
    expect(state.allowed).toBe(false)
    expect(state.reason).toBe('production_without_local_mode')
    // 기동은 막지 않고 기존 로그인으로 되돌린다
    expect(state.fatal).toBe(false)
  })
})

describe('assertLocalAuthBypassSafe', () => {
  it('안전한 조합은 그대로 통과한다', () => {
    expect(assertLocalAuthBypassSafe(LOCAL_ENV).allowed).toBe(true)
    expect(assertLocalAuthBypassSafe({}).allowed).toBe(false)
  })

  it('외부 노출 조합은 기동을 중단한다', () => {
    expect(() =>
      assertLocalAuthBypassSafe({ ...LOCAL_ENV, ALADDIN_LISTEN_HOST: '0.0.0.0' }),
    ).toThrow(/loopback/)
    expect(() =>
      assertLocalAuthBypassSafe({ ...LOCAL_ENV, RENDER: 'true' }),
    ).toThrow(/loopback/)
  })

  it('치명적이지 않은 거부는 throw 하지 않는다', () => {
    expect(() =>
      assertLocalAuthBypassSafe({
        ALADDIN_LOCAL_AUTH_BYPASS: 'true',
        NODE_ENV: 'production',
      }),
    ).not.toThrow()
  })

  it('오류 메시지에 secret 을 담지 않는다', () => {
    try {
      assertLocalAuthBypassSafe({
        ...LOCAL_ENV,
        ALADDIN_LISTEN_HOST: '0.0.0.0',
        ALADDIN_SESSION_SECRET: 'super-secret-value',
        ALADDIN_ADMIN_PASSWORD_HASH: 'scrypt$hash',
      })
      throw new Error('should have thrown')
    } catch (error) {
      expect(error.message).not.toContain('super-secret-value')
      expect(error.message).not.toContain('scrypt$hash')
    }
  })
})

describe('LOCAL_BYPASS_USER', () => {
  it('내부 식별값만 담는다', () => {
    expect(LOCAL_BYPASS_USER).toEqual({
      username: 'aladdin-local',
      isLocalBypass: true,
    })
    const blob = JSON.stringify(LOCAL_BYPASS_USER).toLowerCase()
    expect(blob).not.toMatch(/password|secret|hash|token/)
  })
})

describe('부트스트랩 meta 주입', () => {
  const html = '<!doctype html><html><head><title>A</title></head><body></body></html>'

  it('bypass 상태면 meta 를 추가한다', () => {
    const out = injectBootstrapMeta(html, { localAuthBypass: true })
    expect(out).toContain(`<meta name="${LOCAL_BYPASS_META_NAME}" content="1">`)
    expect(out).toContain('</head>')
  })

  it('bypass 가 아니면 HTML 을 그대로 둔다', () => {
    expect(injectBootstrapMeta(html, { localAuthBypass: false })).toBe(html)
    expect(injectBootstrapMeta(html)).toBe(html)
  })

  it('중복 주입하지 않는다', () => {
    const once = injectBootstrapMeta(html, { localAuthBypass: true })
    const twice = injectBootstrapMeta(once, { localAuthBypass: true })
    expect(twice).toBe(once)
  })

  it('인라인 script 를 넣지 않는다 (CSP script-src self 유지)', () => {
    const out = injectBootstrapMeta(html, { localAuthBypass: true })
    expect(out).not.toContain('<script')
  })
})
