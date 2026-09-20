/**
 * Upbit private API JWT. Secret은 base64 decode 하지 않고 HMAC key로 그대로 쓴다.
 */

import { createHash, createHmac, randomUUID } from 'crypto'

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function createUpbitQueryHash(queryString) {
  return createHash('sha512').update(String(queryString || '')).digest('hex')
}

/**
 * @param {{ accessKey: string, secretKey: string, queryString?: string, nonce?: string }} input
 */
export function createUpbitJwt(input) {
  const header = { alg: 'HS512', typ: 'JWT' }
  const payload = {
    access_key: input.accessKey,
    nonce: input.nonce || randomUUID(),
  }
  if (input.queryString) {
    payload.query_hash = createUpbitQueryHash(input.queryString)
    payload.query_hash_alg = 'SHA512'
  }
  const encodedHeader = base64Url(JSON.stringify(header))
  const encodedPayload = base64Url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac('sha512', input.secretKey)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${signingInput}.${signature}`
}

export function readUpbitCredentials(env = process.env) {
  const accessKey = env.UPBIT_ACCESS_KEY?.trim()
  const secretKey = env.UPBIT_SECRET_KEY?.trim()
  if (!accessKey || !secretKey) return null
  return { accessKey, secretKey }
}
