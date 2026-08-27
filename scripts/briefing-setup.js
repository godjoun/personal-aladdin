#!/usr/bin/env node
/**
 * briefing:setup — 뉴스/공시 API 키만 .env에 안전하게 추가·갱신
 *
 * 사용: npm run briefing:setup
 * - 기존 Kiwoom/auth/API 키는 보존
 * - 입력값은 최종 로그에 다시 출력하지 않음
 * - Enter = 해당 항목 건너뛰기(기존 값 유지)
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { upsertEnvVars } from './authEnvFile.js'
import { readHidden, readLineVisible } from './promptHidden.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_PATH = join(ROOT, '.env')
const ENV_EXAMPLE_PATH = join(ROOT, '.env.example')

const BRIEFING_KEYS = [
  'DART_API_KEY',
  'NAVER_NEWS_CLIENT_ID',
  'NAVER_NEWS_CLIENT_SECRET',
]

function ensureEnvFile() {
  if (existsSync(ENV_PATH)) return
  if (existsSync(ENV_EXAMPLE_PATH)) {
    copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH)
    return
  }
  writeFileSync(ENV_PATH, '', 'utf8')
}

/**
 * @param {string} label
 * @param {boolean} hidden
 */
async function promptOptional(label, hidden) {
  const raw = hidden
    ? await readHidden(`${label} (Enter=건너뛰기): `)
    : await readLineVisible(`${label} (Enter=건너뛰기): `)
  return String(raw ?? '').trim()
}

async function main() {
  console.log('ALADDIN 브리핑 외부 API 설정')
  console.log('Enter만 누르면 해당 항목은 건너뜁니다(기존 값 유지).')
  console.log('')
  console.log(
    '네이버 뉴스: NAVER Cloud Platform NAVER API HUB Client ID/Secret',
  )
  console.log('(구 NAVER Developers 키는 사용하지 않습니다)')
  console.log('')

  const dart = await promptOptional('DART API Key', true)
  const naverId = await promptOptional(
    'NAVER API HUB Client ID (NAVER_NEWS_CLIENT_ID)',
    true,
  )
  const naverSecret = await promptOptional(
    'NAVER API HUB Client Secret (NAVER_NEWS_CLIENT_SECRET)',
    true,
  )

  /** @type {Record<string, string>} */
  const updates = {}
  if (dart) updates.DART_API_KEY = dart
  if (naverId) updates.NAVER_NEWS_CLIENT_ID = naverId
  if (naverSecret) updates.NAVER_NEWS_CLIENT_SECRET = naverSecret

  if (Object.keys(updates).length === 0) {
    console.log('')
    console.log('변경된 항목이 없습니다.')
    return
  }

  ensureEnvFile()
  const previous = readFileSync(ENV_PATH, 'utf8')
  const next = upsertEnvVars(previous, updates)

  for (const value of Object.values(updates)) {
    if (value && next.split(value).length - 1 !== 1) {
      // value could theoretically appear elsewhere; still write once via upsert
    }
  }

  writeFileSync(ENV_PATH, next, 'utf8')

  console.log('')
  console.log('브리핑 API 설정 저장 완료')
  console.log(`갱신된 키: ${Object.keys(updates).join(', ')}`)
  console.log('서버를 재시작하면 반영됩니다.')
  void BRIEFING_KEYS
}

main().catch((error) => {
  console.error(error.message || 'Failed')
  process.exit(1)
})
