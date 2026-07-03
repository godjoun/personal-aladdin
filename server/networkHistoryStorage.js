/**
 * networkHistoryStorage.js — 서버 측 네트워크 일별 집계 아카이브 (Phase 2)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildNetworkTimeSeries } from './networkAnalytics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const HISTORY_PATH = path.join(DATA_DIR, 'network_history.json')

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function loadNetworkHistory() {
  ensureDataDir()

  if (!fs.existsSync(HISTORY_PATH)) {
    return { version: 1, marks: [] }
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'))
    return {
      version: 1,
      marks: Array.isArray(parsed.marks) ? parsed.marks : [],
      updatedAt: parsed.updatedAt ?? null,
    }
  } catch {
    return { version: 1, marks: [] }
  }
}

function saveNetworkHistory(history) {
  ensureDataDir()
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    marks: history.marks,
  }
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(payload, null, 2), 'utf8')
  return payload
}

/**
 * 스테이션 업로드 후 네트워크 일별 집계를 아카이브에 병합합니다.
 */
export function mergeNetworkHistoryFromStations(stations, days = 90) {
  const { points } = buildNetworkTimeSeries(stations, days)
  const history = loadNetworkHistory()
  const markMap = new Map(history.marks.map((mark) => [mark.date, mark]))

  for (const point of points) {
    markMap.set(point.date, {
      date: point.date,
      recordedAt: new Date().toISOString(),
      activeStationCount: point.activeStationCount,
      totalNetworkAum: point.totalNetworkAum,
      avgEquityWeight: point.avgEquityWeight,
      networkAllocation: point.networkAllocation,
    })
  }

  const marks = [...markMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  return saveNetworkHistory({ marks })
}

/**
 * @param {number} days
 */
export function getNetworkHistoryWindow(days = 30) {
  const history = loadNetworkHistory()

  if (history.marks.length === 0 || days <= 0) {
    return history.marks
  }

  const lastDate = history.marks[history.marks.length - 1].date
  const cutoff = subtractDaysFromDateKey(lastDate, days)

  return history.marks.filter((mark) => mark.date >= cutoff)
}

function subtractDaysFromDateKey(dateKey, days) {
  const y = Number(String(dateKey).slice(0, 4))
  const m = Number(String(dateKey).slice(4, 6)) - 1
  const d = Number(String(dateKey).slice(6, 8))
  const date = new Date(y, m, d)
  date.setDate(date.getDate() - days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}
