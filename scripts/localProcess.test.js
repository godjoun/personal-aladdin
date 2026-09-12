import { describe, expect, it } from 'vitest'
import {
  LOCAL_LISTEN_PORT,
  NON_ALADDIN_PORT_ERROR,
  classifyPortOccupants,
  extractDistAssetPaths,
  hasCurrentDistAssetRefs,
  isAladdinOwnedProcess,
  isHealthOk,
  isStandaloneHtml,
  nonAladdinPortError,
  parseLsofCwd,
  parseLsofPids,
  parsePsLine,
  stopProcesses,
  waitForLocalServer,
} from './localProcess.js'

const ROOT = '/Users/sinjoun/Projects/personal-aladdin'

describe('ALADDIN process identity', () => {
  it('이 프로젝트 runner/server 만 ALADDIN-owned 로 본다', () => {
    expect(
      isAladdinOwnedProcess(
        {
          command: `/usr/local/bin/node ${ROOT}/scripts/run-local-server.js`,
        },
        ROOT,
      ),
    ).toBe(true)
    expect(
      isAladdinOwnedProcess(
        {
          command: `/usr/local/bin/node ${ROOT}/server/index.js`,
        },
        ROOT,
      ),
    ).toBe(true)
    expect(
      isAladdinOwnedProcess(
        {
          command: '/usr/local/bin/node server/index.js',
          cwd: ROOT,
        },
        ROOT,
      ),
    ).toBe(true)
  })

  it('다른 앱/다른 프로젝트는 보호한다', () => {
    expect(
      isAladdinOwnedProcess(
        { command: '/usr/local/bin/node /other/app/server.js' },
        ROOT,
      ),
    ).toBe(false)
    expect(
      isAladdinOwnedProcess(
        {
          command: '/usr/local/bin/node /Users/sinjoun/Projects/other-aladdin/server/index.js',
        },
        ROOT,
      ),
    ).toBe(false)
    expect(
      isAladdinOwnedProcess(
        { command: 'Python -m http.server 3001' },
        ROOT,
      ),
    ).toBe(false)
  })
})

describe('lsof / ps parse', () => {
  it('lsof -F p / cwd 와 ps 한 줄을 파싱한다', () => {
    expect(parseLsofPids('p12345\np12345\np999\n')).toEqual([12345, 999])
    expect(parseLsofCwd('p88\nfcwd\nn/Users/me/Projects/personal-aladdin\n')).toBe(
      '/Users/me/Projects/personal-aladdin',
    )
    expect(parsePsLine('  4242  1  /usr/bin/node server/index.js')).toEqual({
      pid: 4242,
      ppid: 1,
      command: '/usr/bin/node server/index.js',
    })
  })
})

describe('port occupant protection', () => {
  it('비 ALADDIN listener 는 명확한 오류로 남긴다', () => {
    const execFile = (file, args) => {
      if (file === 'lsof' && args.includes('-F')) return 'p7001\n'
      if (file === 'ps') return '7001 1 Python -m http.server 3001\n'
      if (file === 'lsof') return 'p7001\nfcwd\nn/tmp\n'
      return ''
    }
    const classified = classifyPortOccupants({
      port: 3001,
      root: ROOT,
      execFile,
    })
    expect(classified.foreign).toHaveLength(1)
    expect(classified.aladdin).toHaveLength(0)
    expect(nonAladdinPortError(classified.foreign)).toContain(NON_ALADDIN_PORT_ERROR)
    expect(nonAladdinPortError(classified.foreign)).toContain('pid=7001')
  })

  it('같은 프로젝트 stale server 는 ALADDIN-owned 이다', () => {
    const execFile = (file, args) => {
      if (file === 'lsof' && args.includes('-iTCP')) return 'p4242\n'
      if (file === 'ps') {
        return `4242 1 /usr/bin/node ${ROOT}/server/index.js\n`
      }
      return `p4242\nfcwd\nn${ROOT}\n`
    }
    const classified = classifyPortOccupants({
      port: LOCAL_LISTEN_PORT,
      root: ROOT,
      execFile,
    })
    expect(classified.aladdin.map((item) => item.pid)).toEqual([4242])
    expect(classified.foreign).toEqual([])
  })
})

describe('stopProcesses', () => {
  it('SIGTERM 을 먼저 보내고 살아 있으면 그때만 SIGKILL 한다', async () => {
    const signals = []
    const alive = new Set([11, 12])
    const result = await stopProcesses([11, 12], {
      waitMs: 200,
      sleep: async () => {},
      now: (() => {
        let t = 0
        return () => {
          t += 100
          return t
        }
      })(),
      kill: (pid, signal) => {
        signals.push(`${pid}:${signal}`)
        if (signal === 'SIGKILL') alive.delete(pid)
      },
      isAlive: (pid) => alive.has(pid),
    })
    expect(signals[0]).toBe('11:SIGTERM')
    expect(signals[1]).toBe('12:SIGTERM')
    expect(signals).toContain('11:SIGKILL')
    expect(signals).toContain('12:SIGKILL')
    expect(result.forced).toEqual([11, 12])
  })

  it('SIGTERM 으로 끝나면 SIGKILL 하지 않는다', async () => {
    const signals = []
    const result = await stopProcesses([33], {
      waitMs: 200,
      sleep: async () => {},
      now: () => 0,
      kill: (pid, signal) => {
        signals.push(`${pid}:${signal}`)
      },
      isAlive: () => false,
    })
    expect(signals).toEqual(['33:SIGTERM'])
    expect(result.forced).toEqual([])
  })
})

describe('health / html checks', () => {
  it('health 와 standalone HTML 을 구분한다', () => {
    expect(isHealthOk({ status: 200, body: '{"ok":true}' })).toBe(true)
    expect(isHealthOk({ status: 200, body: '{"ok":false}' })).toBe(false)
    expect(isStandaloneHtml({ status: 200, body: '<!doctype html><title>ALADDIN</title>' })).toBe(
      true,
    )
    expect(isStandaloneHtml({ status: 404, body: 'Cannot GET /' })).toBe(false)
  })

  it('dist/index.html 의 현재 asset 참조를 구분한다', () => {
    const current = [
      '/assets/index-current.css',
      '/assets/index-current.js',
    ]
    expect(
      extractDistAssetPaths(
        '<!doctype html><script src="/assets/index-current.js"></script><link href="/assets/index-current.css">',
      ),
    ).toEqual(current)
    expect(
      hasCurrentDistAssetRefs(
        {
          status: 200,
          body: '<!doctype html><script src="/assets/index-current.js"></script><link href="/assets/index-current.css">',
        },
        current,
      ),
    ).toBe(true)
    expect(
      hasCurrentDistAssetRefs(
        {
          status: 200,
          body: '<!doctype html><script src="/assets/index-old.js"></script><link href="/assets/index-old.css">',
        },
        current,
      ),
    ).toBe(false)
  })

  it('서버가 뜰 때까지 health 와 / 를 같이 기다린다', async () => {
    let n = 0
    const result = await waitForLocalServer({
      timeoutMs: 2000,
      sleep: async () => {},
      get: async (url) => {
        n += 1
        if (n < 3) return { status: 500, body: '' }
        if (url.endsWith('/api/health')) return { status: 200, body: '{"ok":true}' }
        return { status: 200, body: '<!doctype html><html>ALADDIN</html>' }
      },
    })
    expect(result.ok).toBe(true)
  })

  it('요청 시 최신 dist asset 을 서빙할 때까지 기다린다', async () => {
    let n = 0
    const result = await waitForLocalServer({
      timeoutMs: 2000,
      expectedAssetPaths: ['/assets/current.js'],
      sleep: async () => {},
      get: async (url) => {
        n += 1
        if (url.endsWith('/api/health')) return { status: 200, body: '{"ok":true}' }
        if (n < 4) {
          return {
            status: 200,
            body: '<!doctype html><html><script src="/assets/old.js"></script></html>',
          }
        }
        return {
          status: 200,
          body: '<!doctype html><html><script src="/assets/current.js"></script></html>',
        }
      },
    })
    expect(result.ok).toBe(true)
  })
})
