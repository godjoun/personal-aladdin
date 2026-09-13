import fs from 'fs'
import path from 'path'
import { getDb } from '../db.js'
import { JOURNAL_IMAGE_MAX_BYTES, JOURNAL_IMAGE_MAX_COUNT, JOURNAL_IMAGE_TYPES } from '../../shared/tradeJournal.js'

/** Read only raster headers; enforce both extension/MIME and the actual file format. */
export function validateJournalImage(buffer, mime, filename) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20 || buffer.length > JOURNAL_IMAGE_MAX_BYTES) return null
  const ext = String(filename).split('.').at(-1)?.toLowerCase()
  if (!JOURNAL_IMAGE_TYPES[mime]?.includes(ext) || /[/\\]/.test(filename) || [...filename].some((char) => char.charCodeAt(0) < 32) || filename.length > 180) return null
  let width = 0
  let height = 0
  try {
    if (mime === 'image/png') {
      if (!buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return null
      let offset = 8
      let hasData = false
      let ended = false
      while (offset + 12 <= buffer.length) {
        const size = buffer.readUInt32BE(offset)
        const type = buffer.toString('ascii', offset + 4, offset + 8)
        if (offset + size + 12 > buffer.length) return null
        if (offset === 8) {
          if (type !== 'IHDR' || size !== 13) return null
          width = buffer.readUInt32BE(offset + 8)
          height = buffer.readUInt32BE(offset + 12)
        }
        if (type === 'IDAT') hasData = true
        offset += size + 12
        if (type === 'IEND') { ended = size === 0 && offset === buffer.length; break }
      }
      if (!ended || !hasData) return null
    } else if (mime === 'image/jpeg') {
      if (buffer.readUInt16BE(0) !== 0xffd8 || buffer.readUInt16BE(buffer.length - 2) !== 0xffd9) return null
      let offset = 2
      while (offset + 4 <= buffer.length) {
        if (buffer[offset++] !== 0xff) return null
        while (buffer[offset] === 0xff) offset++
        const marker = buffer[offset++]
        if (marker === 0xda || marker === 0xd9) break
        const size = buffer.readUInt16BE(offset)
        if (size < 2 || offset + size > buffer.length) return null
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          if (size < 8) return null
          height = buffer.readUInt16BE(offset + 3)
          width = buffer.readUInt16BE(offset + 5)
        }
        offset += size
      }
    } else if (mime === 'image/webp') {
      if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP' || buffer.readUInt32LE(4) + 8 !== buffer.length) return null
      const type = buffer.toString('ascii', 12, 16)
      if (buffer.readUInt32LE(16) + 20 > buffer.length) return null
      if (type === 'VP8X') {
        width = buffer.readUIntLE(24, 3) + 1
        height = buffer.readUIntLE(27, 3) + 1
      } else if (type === 'VP8L' && buffer[20] === 0x2f) {
        const bits = buffer.readUInt32LE(21)
        width = (bits & 0x3fff) + 1
        height = ((bits >>> 14) & 0x3fff) + 1
      } else if (type === 'VP8 ' && buffer.toString('hex', 23, 26) === '9d012a') {
        width = buffer.readUInt16LE(26) & 0x3fff
        height = buffer.readUInt16LE(28) & 0x3fff
      }
    }
  } catch { return null }
  return width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 32000000 ? { mime, extension: JOURNAL_IMAGE_TYPES[mime][0] } : null
}

function uploadRoot(db) {
  // DB-specific storage also isolates tests. Never served by express.static.
  if (!db.name || db.name === ':memory:') throw new Error('File storage requires a disk database')
  return path.join(path.dirname(path.resolve(db.name)), 'uploads', 'trade-journal')
}
export function getJournalImage(journalId, imageId, db = getDb()) {
  const row = db.prepare('SELECT * FROM trade_journal_image WHERE journalId = ? AND id = ?').get(journalId, imageId)
  return row ? { ...row, filePath: path.join(uploadRoot(db), row.storageName) } : null
}
export function saveJournalImage(journalId, imageId, buffer, format, db = getDb()) {
  return db.transaction(() => {
    if (!db.prepare('SELECT id FROM trade_journal WHERE id = ?').get(journalId)) return { notFound: true }
    if (getJournalImage(journalId, imageId, db)) return { ok: true }
    if (db.prepare('SELECT COUNT(*) AS count FROM trade_journal_image WHERE journalId = ?').get(journalId).count >= JOURNAL_IMAGE_MAX_COUNT) return { limit: true }
    const storageName = `${imageId}.${format.extension}`
    const root = uploadRoot(db)
    fs.mkdirSync(root, { recursive: true, mode: 0o700 })
    const filePath = path.join(root, storageName)
    fs.writeFileSync(filePath, buffer, { mode: 0o600, flag: 'wx' })
    try {
      db.prepare('INSERT INTO trade_journal_image (id, journalId, storageName, mimeType, byteSize, createdAt) VALUES (?, ?, ?, ?, ?, ?)').run(imageId, journalId, storageName, format.mime, buffer.length, new Date().toISOString())
    } catch (error) {
      fs.unlinkSync(filePath)
      throw error
    }
    return { ok: true }
  })()
}
export function deleteJournalImage(journalId, imageId, db = getDb()) {
  const image = getJournalImage(journalId, imageId, db)
  if (!image) return false
  try { fs.unlinkSync(image.filePath) } catch (error) { if (error.code !== 'ENOENT') throw error }
  db.prepare('DELETE FROM trade_journal_image WHERE journalId = ? AND id = ?').run(journalId, imageId)
  return true
}
