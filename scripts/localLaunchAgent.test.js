import { describe, expect, it } from 'vitest'
import {
  assertPlistHasNoSecrets,
  buildPlistXml,
  LABEL,
} from './localLaunchAgent.js'
import { rotateLogFileIfNeeded } from './rotateLogFile.js'
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('LaunchAgent plist', () => {
  it('credential 을 포함하지 않는다', () => {
    const xml = buildPlistXml({
      nodePath: '/usr/bin/node',
      root: '/tmp/aladdin',
      runner: '/tmp/aladdin/scripts/run-local-server.js',
      label: LABEL,
    })
    expect(xml).toContain('ALADDIN_LOCAL')
    expect(xml).toContain('127.0.0.1')
    expect(xml).toContain('RunAtLoad')
    expect(xml).not.toMatch(/DART_API_KEY|KIWOOM_|SESSION_SECRET|PASSWORD/i)
    expect(() => assertPlistHasNoSecrets(xml)).not.toThrow()
  })

  it('시크릿이 있으면 거부', () => {
    expect(() =>
      assertPlistHasNoSecrets('<string>DART_API_KEY=abc12345</string>'),
    ).toThrow(/secrets/)
  })
})

describe('log rotate', () => {
  it('큰 로그를 .1 로 돌린다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-log-'))
    const file = path.join(dir, 't.log')
    fs.writeFileSync(file, 'x'.repeat(100))
    expect(rotateLogFileIfNeeded(file, { maxBytes: 50 }).rotated).toBe(true)
    expect(fs.existsSync(`${file}.1`)).toBe(true)
    expect(fs.existsSync(file)).toBe(false)
  })
})
