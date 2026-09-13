import express from 'express'
import { asId } from '../security/validate.js'
import { asLabSymbol } from './validate.js'
import { validateJournal } from './journalValidation.js'
import { createTradeJournal, saveTradeJournal } from './journalService.js'
import { getJournalDetail, listJournalImages, listJournalTrades } from './journalRepository.js'
import { deleteJournalImage, getJournalImage, saveJournalImage, validateJournalImage } from './journalImages.js'
import { JOURNAL_IMAGE_MAX_BYTES } from '../../shared/tradeJournal.js'

// Mounted within Trading Lab, after existing authentication and CSRF middleware.
export function createJournalRouter() {
  const router = express.Router()
  const invalid = (res, field) => res.status(400).json({ ok: false, message: '입력값을 확인해주세요.', field })
  const missing = (res) => res.status(404).json({ ok: false, message: '기록을 찾을 수 없습니다.' })
  const safe = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next)
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  router.get('/journals', safe((req, res) => {
    const symbol = asLabSymbol(req.query.symbol)
    const filter = req.query.filter || 'all'
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset)
    if (!symbol) return invalid(res, 'symbol')
    if (!['all', 'review', 'reviewed'].includes(filter)) return invalid(res, 'filter')
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return invalid(res, 'offset')
    res.json({ ok: true, ...listJournalTrades({ symbol, filter, offset }) })
  }))
  router.post('/journals', safe(async (req, res) => {
    const parsed = validateJournal(req.body, { create: true })
    if (!parsed.ok) return invalid(res, parsed.field)
    const result = await createTradeJournal(parsed.value)
    if (!result.ok) return invalid(res, result.field)
    res.status(201).json(result)
  }))
  router.get('/shadow-trades/:id/journal', safe((req, res) => {
    const id = asId(req.params.id)
    if (!id) return invalid(res, 'id')
    const detail = getJournalDetail(id)
    if (!detail) return missing(res)
    res.json({ ok: true, ...detail })
  }))
  router.put('/shadow-trades/:id/journal', safe((req, res) => {
    const id = asId(req.params.id)
    if (!id) return invalid(res, 'id')
    const parsed = validateJournal(req.body)
    if (!parsed.ok) return invalid(res, parsed.field)
    const result = saveTradeJournal(id, parsed.value)
    if (result.notFound) return missing(res)
    if (result.conflict) return res.status(409).json({ ok: false, message: '다른 화면에서 수정된 일지입니다. 내용을 복사한 뒤 다시 열어주세요.' })
    res.json(result)
  }))
  router.post('/journals/:id/images', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: JOURNAL_IMAGE_MAX_BYTES, inflate: false }), safe((req, res) => {
    const id = asId(req.params.id)
    const imageId = req.get('X-Upload-Id')
    if (!id || !/^[a-f0-9-]{36}$/i.test(imageId || '')) return invalid(res, 'id')
    let name
    try { name = decodeURIComponent(req.get('X-File-Name') || '') } catch { return invalid(res, 'file') }
    const format = validateJournalImage(req.body, req.get('Content-Type'), name)
    if (!format) return invalid(res, 'image')
    const result = saveJournalImage(id, imageId, req.body, format)
    if (result.notFound) return missing(res)
    if (result.limit) return res.status(409).json({ ok: false, message: '캡처는 일지당 최대 4장입니다.' })
    res.status(201).json({ ok: true, images: listJournalImages(id) })
  }))
  router.get('/journals/:id/images/:imageId', safe((req, res) => {
    const id = asId(req.params.id)
    const imageId = asId(req.params.imageId)
    if (!id || !imageId) return invalid(res, 'id')
    const image = getJournalImage(id, imageId)
    if (!image) return missing(res)
    res.set({ 'Content-Type': image.mimeType, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': `inline; filename="chart.${image.storageName.split('.').at(-1)}"` })
    res.sendFile(image.filePath, { dotfiles: 'deny', cacheControl: false }, (error) => {
      if (error && !res.headersSent) missing(res)
    })
  }))
  router.delete('/journals/:id/images/:imageId', safe((req, res) => {
    const id = asId(req.params.id)
    const imageId = asId(req.params.imageId)
    if (!id || !imageId) return invalid(res, 'id')
    if (!deleteJournalImage(id, imageId)) return missing(res)
    res.json({ ok: true, images: listJournalImages(id) })
  }))
  router.use((error, _req, res, _next) => {
    if (res.headersSent) return
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'encoding.unsupported' ? 415 : 500
    res.status(status).json({ ok: false, message: status === 413 ? '이미지는 5MB 이하여야 합니다.' : '일지 요청을 처리하지 못했습니다.' })
  })
  return router
}
