import { afterEach, describe, expect, it } from 'vitest'
import { clearNewsCache } from './newsProvider.js'
import {
  NAVER_API_HUB_HOST,
  NAVER_NEWS_URL,
  assertNaverApiHubUrl,
  buildNaverNewsSearchUrl,
  fetchNaverNews,
} from './naverNewsProvider.js'

afterEach(() => {
  clearNewsCache()
})

describe('NAVER API HUB URL / SSRF', () => {
  it('허용 호스트는 naverapihub.apigw.ntruss.com 만', () => {
    expect(NAVER_API_HUB_HOST).toBe('naverapihub.apigw.ntruss.com')
    expect(NAVER_NEWS_URL).toBe(
      'https://naverapihub.apigw.ntruss.com/search/v1/news',
    )
    expect(() => assertNaverApiHubUrl(NAVER_NEWS_URL)).not.toThrow()
  })

  it('예전 openapi.naver.com 은 거부한다', () => {
    expect(() =>
      assertNaverApiHubUrl('https://openapi.naver.com/v1/search/news.json'),
    ).toThrow(/not allowed/)
  })

  it('다른 ntruss 호스트도 거부한다', () => {
    expect(() =>
      assertNaverApiHubUrl('https://evil.apigw.ntruss.com/search/v1/news'),
    ).toThrow(/not allowed/)
  })
})

describe('buildNaverNewsSearchUrl', () => {
  it('sort=date, format=json, query encoding', () => {
    const url = buildNaverNewsSearchUrl('삼성전자', 10)
    expect(url.hostname).toBe(NAVER_API_HUB_HOST)
    expect(url.pathname).toBe('/search/v1/news')
    expect(url.searchParams.get('sort')).toBe('date')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('display')).toBe('10')
    expect(url.searchParams.get('start')).toBe('1')
    expect(url.searchParams.get('query')).toBe('삼성전자')
    expect(url.toString()).toContain(encodeURIComponent('삼성전자'))
  })
})

describe('fetchNaverNews', () => {
  it('API 미설정 시 ok=true, configured=false (앱 실패 없음)', async () => {
    const result = await fetchNaverNews('삼성전자', {
      env: {},
      fetchImpl: async () => {
        throw new Error('should not fetch')
      },
    })
    expect(result.ok).toBe(true)
    expect(result.configured).toBe(false)
    expect(result.items).toEqual([])
    expect(result.message).toMatch(/설정/)
  })

  it('X-NCP 헤더로 API HUB를 호출하고 구형 X-Naver 헤더는 쓰지 않는다', async () => {
    /** @type {RequestInit | undefined} */
    let capturedInit
    /** @type {string | undefined} */
    let capturedUrl
    const secret = 'test-secret-value-xyz'
    const id = 'test-client-id'

    const result = await fetchNaverNews('네이버', {
      env: {
        NAVER_NEWS_CLIENT_ID: id,
        NAVER_NEWS_CLIENT_SECRET: secret,
      },
      fetchImpl: async (url, init) => {
        capturedUrl = String(url)
        capturedInit = init
        return {
          ok: true,
          async json() {
            return {
              items: [
                {
                  title: '테스트',
                  description: '요약',
                  link: 'https://news.example/1',
                  originallink: 'https://origin.example/1',
                  pubDate: 'Thu, 27 Aug 2026 00:00:00 +0900',
                },
              ],
            }
          },
        }
      },
    })

    expect(capturedUrl).toContain('naverapihub.apigw.ntruss.com/search/v1/news')
    expect(capturedUrl).not.toContain('openapi.naver.com')
    expect(capturedUrl).toContain('sort=date')
    expect(capturedUrl).toContain('format=json')
    expect(capturedUrl).toContain(encodeURIComponent('네이버'))

    const headers = /** @type {Record<string, string>} */ (capturedInit?.headers)
    expect(headers['X-NCP-APIGW-API-KEY-ID']).toBe(id)
    expect(headers['X-NCP-APIGW-API-KEY']).toBe(secret)
    expect(headers['X-Naver-Client-Id']).toBeUndefined()
    expect(headers['X-Naver-Client-Secret']).toBeUndefined()

    expect(result.ok).toBe(true)
    expect(result.configured).toBe(true)
    expect(result.items).toHaveLength(1)

    const dumped = JSON.stringify(result)
    expect(dumped).not.toContain(secret)
    expect(dumped).not.toContain(id)
  })

  it('credential이 응답/메시지에 노출되지 않는다 (실패 경로)', async () => {
    const secret = 'leak-check-secret-999'
    const result = await fetchNaverNews('테스트', {
      env: {
        NAVER_NEWS_CLIENT_ID: 'id-abc',
        NAVER_NEWS_CLIENT_SECRET: secret,
      },
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async json() {
          return { error: secret }
        },
      }),
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(result.message).not.toContain(secret)
  })
})
