import { afterEach, describe, expect, it } from 'vitest'
import { getAllowedOrigins } from './csrf.js'

describe('getAllowedOrigins', () => {
  const env = { ...process.env }

  afterEach(() => {
    process.env = { ...env }
  })

  it('ALADDIN_LOCAL 모드에서는 Vite dev origin을 허용한다', () => {
    process.env.NODE_ENV = 'production'
    process.env.ALADDIN_LOCAL = '1'
    delete process.env.ALADDIN_ALLOWED_ORIGIN

    const origins = getAllowedOrigins()
    expect(origins).toContain('http://localhost:5173')
    expect(origins).toContain('http://127.0.0.1:5173')
  })

  it('production 배포 모드에서는 same-origin 전용(빈 allowlist)을 유지한다', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ALADDIN_LOCAL
    delete process.env.ALADDIN_ALLOWED_ORIGIN

    expect(getAllowedOrigins()).toEqual([])
  })
})
