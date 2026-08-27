import fs from 'fs'
import os from 'os'
import path from 'path'
import { deflateRawSync } from 'zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { extractXmlTextFromZip } from './zipXml.js'
import {
  buildCorpCodeMapFromZip,
  clearDartCorpCodeMemory,
  DART_CORP_CACHE_TTL_MS,
  ensureDartCorpCodeMap,
  lookupCorpCodeFromMap,
  parseCorpCodeXml,
  readCorpCodeCache,
  writeCorpCodeCache,
} from './corpCodeMap.js'
import { upsertEnvVars } from '../../scripts/authEnvFile.js'
import { fetchDartDisclosures, clearDartCache } from './dartProvider.js'

/**
 * 최소 Store/Deflate ZIP (local file header only) 생성
 * @param {string} fileName
 * @param {string} text
 * @param {'store' | 'deflate'} [mode]
 */
function buildTestZip(fileName, text, mode = 'deflate') {
  const nameBuf = Buffer.from(fileName, 'utf8')
  const raw = Buffer.from(text, 'utf8')
  const compressed = mode === 'store' ? raw : deflateRawSync(raw)
  const method = mode === 'store' ? 0 : 8
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4) // version
  header.writeUInt16LE(0, 6) // flags
  header.writeUInt16LE(method, 8)
  header.writeUInt16LE(0, 10) // time
  header.writeUInt16LE(0, 12) // date
  header.writeUInt32LE(0, 14) // crc (ignored for our reader)
  header.writeUInt32LE(compressed.length, 18)
  header.writeUInt32LE(raw.length, 22)
  header.writeUInt16LE(nameBuf.length, 26)
  header.writeUInt16LE(0, 28) // extra
  return Buffer.concat([header, nameBuf, compressed])
}

/**
 * OpenDART 스타일: local header size=0 + data descriptor + central directory
 * @param {string} fileName
 * @param {string} text
 */
function buildDataDescriptorZip(fileName, text) {
  const nameBuf = Buffer.from(fileName, 'utf8')
  const raw = Buffer.from(text, 'utf8')
  const compressed = deflateRawSync(raw)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x08, 6) // bit 3 data descriptor
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(0, 14)
  local.writeUInt32LE(0, 18) // comp size unknown
  local.writeUInt32LE(0, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)

  const descriptor = Buffer.alloc(16)
  descriptor.writeUInt32LE(0x08074b50, 0)
  descriptor.writeUInt32LE(0, 4) // crc
  descriptor.writeUInt32LE(compressed.length, 8)
  descriptor.writeUInt32LE(raw.length, 12)

  const localOffset = 0
  const afterLocal = Buffer.concat([local, nameBuf, compressed, descriptor])

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x08, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(0, 16)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(raw.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(localOffset, 42)

  const cdOffset = afterLocal.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(46 + nameBuf.length, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([afterLocal, central, nameBuf, eocd])
}

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dart-corp-'))

afterEach(() => {
  clearDartCorpCodeMemory()
  clearDartCache()
  for (const name of fs.readdirSync(TEMP)) {
    fs.rmSync(path.join(TEMP, name), { recursive: true, force: true })
  }
})

describe('corpCode zip parsing', () => {
  it('zip 에서 XML을 읽고 stock_code → corp_code 매핑', () => {
    const xml = `
      <?xml version="1.0"?>
      <result>
        <list>
          <corp_code>00123456</corp_code>
          <corp_name>성일하이텍</corp_name>
          <stock_code>365340</stock_code>
          <modify_date>20260801</modify_date>
        </list>
        <list>
          <corp_code>00999999</corp_code>
          <corp_name>비상장회사</corp_name>
          <stock_code></stock_code>
          <modify_date>20260801</modify_date>
        </list>
      </result>
    `
    const zip = buildTestZip('CORPCODE.xml', xml)
    expect(extractXmlTextFromZip(zip)).toContain('성일하이텍')
    const map = buildCorpCodeMapFromZip(zip)
    expect(map['365340']).toEqual({
      corpCode: '00123456',
      corpName: '성일하이텍',
    })
    expect(map['999999']).toBeUndefined()
    expect(Object.keys(map)).toHaveLength(1)
  })

  it('data descriptor ZIP(OpenDART형)도 파싱한다', () => {
    const xml = `
      <list>
        <corp_code>00123456</corp_code>
        <corp_name>성일하이텍</corp_name>
        <stock_code>365340</stock_code>
      </list>
    `
    const zip = buildDataDescriptorZip('CORPCODE.xml', xml)
    expect(extractXmlTextFromZip(zip)).toContain('성일하이텍')
    expect(buildCorpCodeMapFromZip(zip)['365340'].corpCode).toBe('00123456')
  })

  it('parseCorpCodeXml 은 stock_code 있는 상장만', () => {
    const codes = parseCorpCodeXml(`
      <list><corp_code>1</corp_code><corp_name>A</corp_name><stock_code>005930</stock_code></list>
      <list><corp_code>2</corp_code><corp_name>B</corp_name><stock_code> </stock_code></list>
    `)
    expect(codes['005930'].corpCode).toBe('1')
    expect(Object.keys(codes)).toHaveLength(1)
  })

  it('corp_eng_name 이 끼어 있어도 stock_code 매핑', () => {
    const codes = parseCorpCodeXml(`
      <list>
        <corp_code>01274329</corp_code>
        <corp_name>성일하이텍</corp_name>
        <corp_eng_name>SungEel HiTech Co., Ltd.</corp_eng_name>
        <stock_code>365340</stock_code>
        <modify_date>20240926</modify_date>
      </list>
    `)
    expect(codes['365340']).toEqual({
      corpCode: '01274329',
      corpName: '성일하이텍',
    })
  })
})

describe('corp code cache', () => {
  it('7일 이내 cache를 재사용한다', async () => {
    const cachePath = path.join(TEMP, 'cache.json')
    writeCorpCodeCache(
      cachePath,
      { '005930': { corpCode: '00126380', corpName: '삼성전자' } },
      new Date('2026-08-20T00:00:00Z'),
    )

    let networkCalls = 0
    const result = await ensureDartCorpCodeMap({
      env: { DART_API_KEY: 'test-key' },
      cachePath,
      now: Date.parse('2026-08-25T00:00:00Z'),
      fetchImpl: async () => {
        networkCalls += 1
        throw new Error('should not fetch')
      },
    })

    expect(result.source).toBe('cache')
    expect(result.ready).toBe(true)
    expect(networkCalls).toBe(0)
    expect(lookupCorpCodeFromMap('005930', result.codes)?.corpCode).toBe(
      '00126380',
    )
  })

  it('오래된 cache는 갱신한다', async () => {
    const cachePath = path.join(TEMP, 'cache-old.json')
    writeCorpCodeCache(
      cachePath,
      { '005930': { corpCode: 'OLD', corpName: 'old' } },
      new Date('2026-01-01T00:00:00Z'),
    )

    const xml = `
      <list>
        <corp_code>NEWCODE</corp_code>
        <corp_name>삼성전자</corp_name>
        <stock_code>005930</stock_code>
      </list>
    `
    const zip = buildTestZip('CORPCODE.xml', xml)
    const now = Date.parse('2026-08-27T00:00:00Z')
    expect(now - Date.parse('2026-01-01T00:00:00Z')).toBeGreaterThan(
      DART_CORP_CACHE_TTL_MS,
    )

    const result = await ensureDartCorpCodeMap({
      env: { DART_API_KEY: 'test-key' },
      cachePath,
      now,
      fetchImpl: async () => ({
        ok: true,
        arrayBuffer: async () =>
          zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength),
      }),
    })

    expect(result.source).toBe('network')
    expect(result.codes['005930'].corpCode).toBe('NEWCODE')
    const disk = readCorpCodeCache(cachePath, now)
    expect(disk.fresh).toBe(true)
    expect(disk.data?.codes['005930'].corpCode).toBe('NEWCODE')
  })

  it('DART 미설정 시 요청 없이 정상 처리', async () => {
    const result = await ensureDartCorpCodeMap({
      env: {},
      fetchImpl: async () => {
        throw new Error('no network')
      },
    })
    expect(result.configured).toBe(false)
    expect(result.ready).toBe(false)

    const disclosures = await fetchDartDisclosures('365340', { env: {} })
    expect(disclosures.configured).toBe(false)
    expect(disclosures.message).toContain('설정되지 않았습니다')
  })

  it('ETF 등 corp_code 없음 정상 처리', async () => {
    const cachePath = path.join(TEMP, 'cache-etf.json')
    writeCorpCodeCache(cachePath, {
      '005930': { corpCode: '00126380', corpName: '삼성전자' },
    })

    const result = await fetchDartDisclosures('133690', {
      env: { DART_API_KEY: 'test-key' },
      cachePath,
      now: Date.now(),
      fetchImpl: async () => {
        throw new Error('list should not be called for unmapped')
      },
    })

    expect(result.configured).toBe(true)
    expect(result.unmapped).toBe(true)
    expect(result.message).toBe('기업 공시 매핑을 확인할 수 없습니다.')
    expect(result.reason).toBe('unmapped')
    expect(result.items).toEqual([])
  })

  it('list.json 조회는 최근 90일 구간을 사용한다', async () => {
    const cachePath = path.join(TEMP, 'cache-range.json')
    writeCorpCodeCache(cachePath, {
      '365340': { corpCode: '00123456', corpName: '성일하이텍' },
    })

    /** @type {string | undefined} */
    let calledUrl
    const result = await fetchDartDisclosures('365340', {
      env: { DART_API_KEY: 'test-key' },
      cachePath,
      now: Date.now(),
      fetchImpl: async (url) => {
        calledUrl = String(url)
        return {
          ok: true,
          async json() {
            return { status: '013', list: [] }
          },
        }
      },
    })

    expect(calledUrl).toContain('corp_code=00123456')
    expect(calledUrl).toMatch(/bgn_de=\d{8}/)
    expect(calledUrl).toMatch(/end_de=\d{8}/)
    const bgn = calledUrl.match(/bgn_de=(\d{8})/)?.[1]
    const end = calledUrl.match(/end_de=(\d{8})/)?.[1]
    expect(bgn && end).toBeTruthy()
    const toDate = (s) =>
      Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
    const diffDays = (toDate(end) - toDate(bgn)) / (24 * 60 * 60 * 1000)
    expect(diffDays).toBe(90)
    expect(result.ok).toBe(true)
    expect(result.reason).toBe('empty')
    expect(result.message).toBe('최근 90일 내 공시가 없습니다.')
    expect(result.lookbackDays).toBe(90)
  })

  it('list API 실패와 매핑 실패 메시지를 구분한다', async () => {
    const cachePath = path.join(TEMP, 'cache-fail.json')
    writeCorpCodeCache(cachePath, {
      '365340': { corpCode: '00123456', corpName: '성일하이텍' },
    })

    const failed = await fetchDartDisclosures('365340', {
      env: { DART_API_KEY: 'test-key' },
      cachePath,
      now: Date.now(),
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        async json() {
          return {}
        },
      }),
    })
    expect(failed.ok).toBe(false)
    expect(failed.message).toBe('공시를 불러오지 못했습니다.')
    expect(failed.reason).toBe('http_error')
  })
})

describe('briefing:setup env upsert', () => {
  it('기존 .env Kiwoom/auth 값을 보존하고 briefing 키만 갱신', () => {
    const previous = [
      'KIWOOM_ISA_APP_KEY=isa-key',
      'ALADDIN_ADMIN_USERNAME=owner',
      'API_KEY=keep-me',
      'DART_API_KEY=old-dart',
      '',
    ].join('\n')

    const next = upsertEnvVars(previous, {
      DART_API_KEY: 'new-dart',
      NAVER_NEWS_CLIENT_ID: 'nid',
      NAVER_NEWS_CLIENT_SECRET: 'nsec',
    })

    expect(next).toContain('KIWOOM_ISA_APP_KEY=isa-key')
    expect(next).toContain('ALADDIN_ADMIN_USERNAME=owner')
    expect(next).toContain('API_KEY=keep-me')
    expect(next).toContain('DART_API_KEY=new-dart')
    expect(next).toContain('NAVER_NEWS_CLIENT_ID=nid')
    expect(next).toContain('NAVER_NEWS_CLIENT_SECRET=nsec')
    expect(next).not.toContain('old-dart')
  })
})
