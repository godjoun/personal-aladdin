import { describe, expect, it } from 'vitest'
import { readLocalAuthBypassFlag } from './localAuthMode.js'

/**
 * @param {string | null} content
 */
function fakeDoc(content) {
  return {
    querySelector(selector) {
      if (selector !== 'meta[name="aladdin-local-auth-bypass"]') return null
      if (content === null) return null
      return { getAttribute: () => content }
    },
  }
}

describe('readLocalAuthBypassFlag', () => {
  it('meta 가 1 이면 로컬 전용 모드로 인식한다', () => {
    expect(readLocalAuthBypassFlag(fakeDoc('1'))).toBe(true)
  })

  it('meta 가 없으면 false', () => {
    expect(readLocalAuthBypassFlag(fakeDoc(null))).toBe(false)
  })

  it('예상치 못한 값은 false 로 처리한다', () => {
    expect(readLocalAuthBypassFlag(fakeDoc('0'))).toBe(false)
    expect(readLocalAuthBypassFlag(fakeDoc('true'))).toBe(false)
    expect(readLocalAuthBypassFlag(fakeDoc(''))).toBe(false)
  })

  it('document 가 없어도 안전하다', () => {
    expect(readLocalAuthBypassFlag(undefined)).toBe(false)
    expect(readLocalAuthBypassFlag({})).toBe(false)
  })
})
