import { describe, expect, it } from 'vitest'
import { hashPassword } from '../server/auth/password.js'
import {
  MIN_PASSWORD_LENGTH,
  SESSION_SECRET_BYTES,
  applyAuthEnvVars,
  generateSessionSecret,
  sanitizeUsername,
  upsertEnvVars,
  validatePasswordPair,
} from './authEnvFile.js'

describe('validatePasswordPair', () => {
  it('password mismatch 를 감지한다', () => {
    expect(validatePasswordPair('abcdefghijkl', 'abcdefghijkm')).toEqual({
      ok: false,
      code: 'mismatch',
    })
  })

  it('최소 길이를 검증한다', () => {
    expect(validatePasswordPair('short', 'short')).toEqual({
      ok: false,
      code: 'too_short',
    })
    expect(
      validatePasswordPair(
        'a'.repeat(MIN_PASSWORD_LENGTH),
        'a'.repeat(MIN_PASSWORD_LENGTH),
      ),
    ).toEqual({ ok: true })
  })
})

describe('upsertEnvVars / applyAuthEnvVars', () => {
  it('기존 .env 값을 보존하고 auth 3개만 추가한다', () => {
    const previous = [
      '# comment',
      'API_KEY=keep-me',
      'KIWOOM_ISA_APP_KEY=isa-key',
      'KIWOOM_ISA_APP_SECRET=isa-secret',
      'CENTRAL_PORT=3001',
      '',
    ].join('\n')

    const next = upsertEnvVars(previous, {
      ALADDIN_ADMIN_USERNAME: 'owner',
      ALADDIN_ADMIN_PASSWORD_HASH: 'scrypt$16384$8$1$salt$hash',
      ALADDIN_SESSION_SECRET: 'a'.repeat(64),
    })

    expect(next).toContain('API_KEY=keep-me')
    expect(next).toContain('KIWOOM_ISA_APP_KEY=isa-key')
    expect(next).toContain('KIWOOM_ISA_APP_SECRET=isa-secret')
    expect(next).toContain('CENTRAL_PORT=3001')
    expect(next).toContain('# comment')
    expect(next).toContain('ALADDIN_ADMIN_USERNAME=owner')
    expect(next).toContain('ALADDIN_ADMIN_PASSWORD_HASH=scrypt$16384$8$1$salt$hash')
    expect(next).toMatch(/ALADDIN_SESSION_SECRET=a{64}/)
  })

  it('기존 auth 3개 값만 갱신한다', () => {
    const previous = [
      'API_KEY=keep-me',
      'ALADDIN_ADMIN_USERNAME=old',
      'ALADDIN_ADMIN_PASSWORD_HASH=old-hash',
      'ALADDIN_SESSION_SECRET=old-secret',
      'KIWOOM_GENERAL_APP_KEY=general-key',
      '',
    ].join('\n')

    const next = applyAuthEnvVars(previous, {
      username: 'new-user',
      passwordHash: 'scrypt$new',
      sessionSecret: 'b'.repeat(64),
    })

    expect(next).toContain('API_KEY=keep-me')
    expect(next).toContain('KIWOOM_GENERAL_APP_KEY=general-key')
    expect(next).toContain('ALADDIN_ADMIN_USERNAME=new-user')
    expect(next).toContain('ALADDIN_ADMIN_PASSWORD_HASH=scrypt$new')
    expect(next).toContain(`ALADDIN_SESSION_SECRET=${'b'.repeat(64)}`)
    expect(next).not.toContain('ALADDIN_ADMIN_USERNAME=old')
    expect(next).not.toContain('old-hash')
    expect(next).not.toContain('old-secret')
  })

  it('평문 비밀번호를 저장하지 않는다', () => {
    const plaintext = 'CorrectHorseBattery-99'
    const passwordHash = hashPassword(plaintext)
    const sessionSecret = generateSessionSecret()

    const next = applyAuthEnvVars('API_KEY=keep-me\n', {
      username: 'admin',
      passwordHash,
      sessionSecret,
    })

    expect(next).toContain('API_KEY=keep-me')
    expect(next).toContain('ALADDIN_ADMIN_PASSWORD_HASH=')
    expect(next).not.toContain(plaintext)
    expect(next).not.toMatch(/ALADDIN_ADMIN_PASSWORD=[^=\n]/)
  })

  it('주석 속 KEY= 문구는 건드리지 않는다', () => {
    const previous = '# ALADDIN_ADMIN_USERNAME=example\nAPI_KEY=x\n'
    const next = upsertEnvVars(previous, {
      ALADDIN_ADMIN_USERNAME: 'real',
    })
    expect(next).toContain('# ALADDIN_ADMIN_USERNAME=example')
    expect(next).toContain('ALADDIN_ADMIN_USERNAME=real')
    expect(next).toContain('API_KEY=x')
  })
})

describe('generateSessionSecret', () => {
  it('충분한 길이의 session secret 을 만든다', () => {
    const secret = generateSessionSecret()
    expect(secret).toMatch(/^[0-9a-f]+$/)
    expect(secret.length).toBe(SESSION_SECRET_BYTES * 2)
    expect(Buffer.from(secret, 'hex').length).toBeGreaterThanOrEqual(
      SESSION_SECRET_BYTES,
    )
  })
})

describe('sanitizeUsername', () => {
  it('아이디를 trim 한다', () => {
    expect(sanitizeUsername('  alice  ')).toBe('alice')
  })

  it('빈 아이디를 거절한다', () => {
    expect(() => sanitizeUsername('   ')).toThrow(/아이디/)
  })
})
