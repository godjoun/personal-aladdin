import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SPA_INDEX_CACHE_CONTROL,
  createAppHtmlProvider,
  setSpaIndexCacheHeaders,
} from './appHtml.js'

const tempRoots = []

function makeDist(html) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aladdin-app-html-'))
  tempRoots.push(root)
  const dist = path.join(root, 'dist')
  fs.mkdirSync(dist, { recursive: true })
  fs.writeFileSync(path.join(dist, 'index.html'), html, 'utf8')
  return dist
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('SPA index HTML serving', () => {
  it('dist/index.html 변경 시 새 asset 참조를 다시 읽는다', () => {
    const dist = makeDist(
      '<!doctype html><html><head><script src="/assets/old.js"></script></head><body></body></html>',
    )
    const provider = createAppHtmlProvider({ distPath: dist })
    expect(provider()).toContain('/assets/old.js')

    const indexPath = path.join(dist, 'index.html')
    fs.writeFileSync(
      indexPath,
      '<!doctype html><html><head><script src="/assets/new.js"></script></head><body></body></html>',
      'utf8',
    )
    const future = new Date(Date.now() + 2_000)
    fs.utimesSync(indexPath, future, future)

    expect(provider()).toContain('/assets/new.js')
    expect(provider()).not.toContain('/assets/old.js')
  })

  it('SPA entry HTML 은 브라우저 캐시를 막는 헤더를 설정한다', () => {
    const headers = {}
    setSpaIndexCacheHeaders({
      set(name, value) {
        headers[name] = value
      },
    })

    expect(headers).toEqual({
      'Cache-Control': SPA_INDEX_CACHE_CONTROL,
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    })
  })
})
