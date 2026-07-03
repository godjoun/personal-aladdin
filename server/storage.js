/**
 * server/storage.js — 중앙 서버 파일 저장소
 * 블랙록 ALADDIN 의 중앙 데이터 레이어(축소판)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const STATIONS_DIR = path.join(DATA_DIR, 'stations')

function ensureDirs() {
  fs.mkdirSync(STATIONS_DIR, { recursive: true })
}

function stationPath(stationId) {
  return path.join(STATIONS_DIR, `${stationId}.json`)
}

export function loadStation(stationId) {
  ensureDirs()
  const filePath = stationPath(stationId)

  if (!fs.existsSync(filePath)) {
    return null
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function saveStation(record) {
  ensureDirs()
  fs.writeFileSync(stationPath(record.id), JSON.stringify(record, null, 2), 'utf8')
  return record
}

export function listStations() {
  ensureDirs()

  if (!fs.existsSync(STATIONS_DIR)) {
    return []
  }

  return fs
    .readdirSync(STATIONS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const record = JSON.parse(
        fs.readFileSync(path.join(STATIONS_DIR, name), 'utf8'),
      )
      return record
    })
    .sort(
      (a, b) =>
        new Date(b.lastSyncAt || b.createdAt).getTime() -
        new Date(a.lastSyncAt || a.createdAt).getTime(),
    )
}

export function findStationByKeyHash(keyHash) {
  return listStations().find((station) => station.keyHash === keyHash) ?? null
}
