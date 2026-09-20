import { describe, expect, it, vi } from 'vitest'
import {
  buildUpbitQuery,
  createUpbitRestClient,
  splitUpbitWindows,
} from './upbitClient.js'

function response(payload, status = 200, remaining = 'group=default; min=1800; sec=29') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => remaining },
    json: async () => payload,
  }
}

describe('Upbit REST client', () => {
  it('array query를 hash용 raw와 URL용 encoded로 분리한다', () => {
    const query = buildUpbitQuery([['states[]', 'done'], ['states[]', 'cancel']])
    expect(query.raw).toBe('states[]=done&states[]=cancel')
    expect(query.encoded).toBe('states%5B%5D=done&states%5B%5D=cancel')
  })

  it('closed orders는 done+cancel, asc, max 1000으로 조회한다', async () => {
    const fetchImpl = vi.fn(async () => response([{ uuid: 'o1' }]))
    const client = createUpbitRestClient({
      accessKey: 'a', secretKey: 's', fetchImpl, maxRetries: 0,
    })
    const rows = await client.listClosedOrders({ startMs: 0, endMs: 1000 })
    expect(rows).toEqual([{ uuid: 'o1' }])
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toContain('/v1/orders/closed?')
    expect(url).toContain('states%5B%5D=done')
    expect(url).toContain('states%5B%5D=cancel')
    expect(url).toContain('limit=1000')
    expect(url).toContain('order_by=asc')
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toMatch(/^Bearer /)
  })

  it('429는 bounded retry 후 성공하고 무한 재시도하지 않는다', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ error: { name: 'too_many_requests' } }, 429))
      .mockResolvedValueOnce(response({ uuid: 'o1' }))
    const client = createUpbitRestClient({
      accessKey: 'a', secretKey: 's', fetchImpl, maxRetries: 1, retryBaseMs: 0,
    })
    expect(await client.getOrder('o1')).toEqual({ uuid: 'o1' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('7일보다 긴 기간을 분할한다', () => {
    const day = 24 * 60 * 60 * 1000
    const windows = splitUpbitWindows(0, 15 * day)
    expect(windows).toHaveLength(3)
    expect(windows[0]).toEqual({ startMs: 0, endMs: 7 * day })
    expect(windows[2]).toEqual({ startMs: 14 * day, endMs: 15 * day })
  })
})
