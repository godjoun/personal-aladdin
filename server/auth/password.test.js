import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'
import { resolveDbPath } from '../resolveDbPath.js'

describe('password scrypt', () => {
  it('hash/verify 동작 및 평문 미포함', () => {
    const password = 'Test-Password-1234!'
    const hash = hashPassword(password)
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(hash.includes(password)).toBe(false)
    expect(verifyPassword(password, hash)).toBe(true)
    expect(verifyPassword('wrong', hash)).toBe(false)
  })
})

describe('resolveDbPath', () => {
  it('production에서 path 없으면 실패', () => {
    expect(() =>
      resolveDbPath({
        env: { NODE_ENV: 'production' },
        isProd: true,
      }),
    ).toThrow(/ALADDIN_DB_PATH|ALADDIN_DATA_DIR/)
  })

  it('ALADDIN_DATA_DIR 사용', () => {
    const result = resolveDbPath({
      env: { ALADDIN_DATA_DIR: '/var/aladdin-data' },
      isProd: true,
    })
    expect(result.dbPath).toContain('aladdin.sqlite')
    expect(result.source).toBe('ALADDIN_DATA_DIR')
  })

  it('로컬 production 은 프로젝트 data 기본 경로 허용', () => {
    const result = resolveDbPath({
      env: { NODE_ENV: 'production', ALADDIN_LOCAL: '1' },
      isProd: true,
    })
    expect(result.source).toBe('local_default')
    expect(result.dbPath).toContain('aladdin.sqlite')
  })
})
