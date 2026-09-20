import { createHash, createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  createUpbitJwt,
  createUpbitQueryHash,
  readUpbitCredentials,
} from './upbitAuth.js'

function decode(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

describe('Upbit JWT', () => {
  it('SHA512 query hash와 HS512 JWT를 built-in crypto로 만든다', () => {
    const query = 'uuid=order-1'
    expect(createUpbitQueryHash(query)).toBe(
      createHash('sha512').update(query).digest('hex'),
    )
    const token = createUpbitJwt({
      accessKey: 'access-test',
      secretKey: 'secret-test',
      queryString: query,
      nonce: 'nonce-test',
    })
    const [header, payload, signature] = token.split('.')
    expect(decode(header)).toEqual({ alg: 'HS512', typ: 'JWT' })
    expect(decode(payload)).toMatchObject({
      access_key: 'access-test',
      nonce: 'nonce-test',
      query_hash_alg: 'SHA512',
      query_hash: createUpbitQueryHash(query),
    })
    expect(signature).toBe(
      createHmac('sha512', 'secret-test')
        .update(`${header}.${payload}`)
        .digest('base64url'),
    )
    expect(token).not.toContain('secret-test')
  })

  it('credential 미설정은 null이고 한쪽만 있어도 null이다', () => {
    expect(readUpbitCredentials({})).toBeNull()
    expect(readUpbitCredentials({ UPBIT_ACCESS_KEY: 'a' })).toBeNull()
    expect(readUpbitCredentials({
      UPBIT_ACCESS_KEY: ' access ',
      UPBIT_SECRET_KEY: ' secret ',
    })).toEqual({ accessKey: 'access', secretKey: 'secret' })
  })
})
