/**
 * zipXml.js — 단일/소수 파일 ZIP 에서 XML 추출 (추가 dependency 없음)
 *
 * OpenDART corpCode.zip 은 local header 에 size=0 + data descriptor(bit3) 를
 * 쓰는 경우가 있어, Central Directory 기준으로 추출한다.
 */

import { inflateRawSync } from 'zlib'

const LOCAL_FILE_HEADER = 0x04034b50
const CENTRAL_DIR_HEADER = 0x02014b50
const END_OF_CENTRAL_DIR = 0x06054b50

/**
 * @param {Buffer} buffer
 * @returns {number} EOCD offset or -1
 */
function findEndOfCentralDirectory(buffer) {
  // comment max 65535 + EOCD 22 bytes
  const minStart = Math.max(0, buffer.length - 22 - 65535)
  for (let i = buffer.length - 22; i >= minStart; i -= 1) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL_DIR) return i
  }
  return -1
}

/**
 * Central Directory 기반 추출 (권장)
 * @param {Buffer} buffer
 * @returns {Array<{ name: string, content: Buffer }> | null}
 */
function extractViaCentralDirectory(buffer) {
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) return null

  const totalEntries = buffer.readUInt16LE(eocd + 10)
  const cdOffset = buffer.readUInt32LE(eocd + 16)
  if (cdOffset + 46 > buffer.length) return null

  /** @type {Array<{ name: string, content: Buffer }>} */
  const entries = []
  let offset = cdOffset

  for (let i = 0; i < totalEntries; i += 1) {
    if (offset + 46 > buffer.length) break
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIR_HEADER) break

    const method = buffer.readUInt16LE(offset + 10)
    const compSize = buffer.readUInt32LE(offset + 20)
    const nameLen = buffer.readUInt16LE(offset + 28)
    const extraLen = buffer.readUInt16LE(offset + 30)
    const commentLen = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)

    const nameStart = offset + 46
    const nameEnd = nameStart + nameLen
    if (nameEnd > buffer.length) break
    const name = buffer.slice(nameStart, nameEnd).toString('utf8')

    if (localOffset + 30 > buffer.length) {
      throw new Error('Invalid local header offset')
    }
    if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      throw new Error('Missing local file header')
    }

    const localNameLen = buffer.readUInt16LE(localOffset + 26)
    const localExtraLen = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const dataEnd = dataStart + compSize
    if (dataEnd > buffer.length) {
      throw new Error('Truncated zip data')
    }

    const compressed = buffer.slice(dataStart, dataEnd)
    let content
    if (method === 0) {
      content = compressed
    } else if (method === 8) {
      content = inflateRawSync(compressed)
    } else {
      throw new Error(`Unsupported zip compression method: ${method}`)
    }

    entries.push({ name, content })
    offset = nameEnd + extraLen + commentLen
  }

  return entries.length > 0 ? entries : null
}

/**
 * Local header only (크기 명시된 경우 — 테스트 ZIP 등)
 * @param {Buffer} buffer
 * @returns {Array<{ name: string, content: Buffer }>}
 */
function extractViaLocalHeaders(buffer) {
  /** @type {Array<{ name: string, content: Buffer }>} */
  const entries = []
  let offset = 0

  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset)
    if (signature !== LOCAL_FILE_HEADER) break

    const method = buffer.readUInt16LE(offset + 8)
    const flags = buffer.readUInt16LE(offset + 6)
    const compSize = buffer.readUInt32LE(offset + 18)
    const nameLen = buffer.readUInt16LE(offset + 26)
    const extraLen = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLen
    if (nameEnd + extraLen > buffer.length) {
      throw new Error('Truncated zip entry')
    }

    const name = buffer.slice(nameStart, nameEnd).toString('utf8')
    const dataStart = nameEnd + extraLen

    if ((flags & 0x8) !== 0 && compSize === 0) {
      throw new Error('Zip data descriptor requires central directory')
    }

    const dataEnd = dataStart + compSize
    if (dataEnd > buffer.length) {
      throw new Error('Truncated zip data')
    }

    const compressed = buffer.slice(dataStart, dataEnd)
    let content
    if (method === 0) {
      content = compressed
    } else if (method === 8) {
      content = inflateRawSync(compressed)
    } else {
      throw new Error(`Unsupported zip compression method: ${method}`)
    }

    entries.push({ name, content })
    offset = dataEnd
  }

  return entries
}

/**
 * ZIP buffer → { name, content: Buffer }[]
 * Store(0) / Deflate(8) 만 지원
 *
 * @param {Buffer} buffer
 * @returns {Array<{ name: string, content: Buffer }>}
 */
export function extractZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 30) {
    throw new Error('Invalid zip buffer')
  }

  const viaCd = extractViaCentralDirectory(buffer)
  if (viaCd) return viaCd

  const viaLocal = extractViaLocalHeaders(buffer)
  if (viaLocal.length === 0) {
    throw new Error('No zip entries found')
  }
  return viaLocal
}

/**
 * ZIP 안에서 첫 XML(또는 CORPCODE) 텍스트 반환
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
export function extractXmlTextFromZip(buffer) {
  const entries = extractZipEntries(buffer)
  const preferred =
    entries.find((e) => /corpcode\.xml$/i.test(e.name)) ||
    entries.find((e) => /\.xml$/i.test(e.name)) ||
    entries[0]
  return preferred.content.toString('utf8')
}
