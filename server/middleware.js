/**
 * server/middleware.js — 스테이션·관리자 인증
 */

import crypto from 'crypto'
import { findStationByKeyHash } from './storage.js'

export function hashStationKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export function generateStationKey() {
  return crypto.randomUUID().replace(/-/g, '')
}

export function requireStationAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const key = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!key) {
    res.status(401).json({ error: '스테이션 키가 필요합니다.' })
    return
  }

  const keyHash = hashStationKey(key)
  const station = findStationByKeyHash(keyHash)

  if (!station) {
    res.status(401).json({ error: '유효하지 않은 스테이션 키입니다.' })
    return
  }

  req.station = station
  next()
}

export function requireAdminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key']
  const expected = process.env.ADMIN_KEY

  if (!expected) {
    res.status(503).json({ error: '서버에 ADMIN_KEY 가 설정되지 않았습니다.' })
    return
  }

  if (adminKey !== expected) {
    res.status(401).json({ error: '관리자 키가 올바르지 않습니다.' })
    return
  }

  next()
}
