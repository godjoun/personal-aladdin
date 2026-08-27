/**
 * rotateLogFile.js — 단순 로그 크기 제한 (민감정보 기록 금지 — 호출측 책임)
 */

import fs from 'fs'
import path from 'path'

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

/**
 * @param {string} filePath
 * @param {{ maxBytes?: number }} [options]
 */
export function rotateLogFileIfNeeded(filePath, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  try {
    if (!fs.existsSync(filePath)) return { rotated: false }
    const stat = fs.statSync(filePath)
    if (stat.size < maxBytes) return { rotated: false, size: stat.size }

    const bak = `${filePath}.1`
    try {
      if (fs.existsSync(bak)) fs.unlinkSync(bak)
    } catch {
      // ignore
    }
    fs.renameSync(filePath, bak)
    return { rotated: true, size: stat.size }
  } catch {
    return { rotated: false }
  }
}

/**
 * @param {string} dir
 */
export function ensureLogDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * @param {string} filePath
 */
export function ensureParentDir(filePath) {
  ensureLogDir(path.dirname(filePath))
}
