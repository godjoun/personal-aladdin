#!/usr/bin/env node
/**
 * auth:setup — ALADDIN 로그인 초기설정 (초보자용)
 *
 * 사용: npm run auth:setup
 *
 * - 아이디/비밀번호 입력 → scrypt hash + session secret 생성
 * - .env 의 auth 3키만 추가/갱신 (Kiwoom/API 등 기존 값 보존)
 * - 평문 비밀번호는 .env·터미널에 남기지 않음
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { hashPassword } from '../server/auth/password.js'
import {
  MIN_PASSWORD_LENGTH,
  SESSION_SECRET_BYTES,
  applyAuthEnvVars,
  generateSessionSecret,
  sanitizeUsername,
  validatePasswordPair,
} from './authEnvFile.js'
import { readHidden, readLineVisible } from './promptHidden.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_PATH = join(ROOT, '.env')
const ENV_EXAMPLE_PATH = join(ROOT, '.env.example')

async function promptPasswordPair() {
  for (;;) {
    const password = await readHidden('비밀번호: ')
    const confirm = await readHidden('비밀번호 확인: ')
    const result = validatePasswordPair(password, confirm, MIN_PASSWORD_LENGTH)

    if (!result.ok && result.code === 'mismatch') {
      console.error('비밀번호가 일치하지 않습니다. 다시 입력해주세요.')
      continue
    }
    if (!result.ok && result.code === 'too_short') {
      console.error(`비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
      continue
    }

    return password
  }
}

function ensureEnvFile() {
  if (existsSync(ENV_PATH)) {
    return
  }
  if (existsSync(ENV_EXAMPLE_PATH)) {
    copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH)
    return
  }
  writeFileSync(ENV_PATH, '', 'utf8')
}

async function main() {
  console.log('ALADDIN 로그인 설정')
  console.log('')

  const usernameRaw = await readLineVisible('로그인 아이디: ')
  const username = sanitizeUsername(usernameRaw)
  const password = await promptPasswordPair()

  const passwordHash = hashPassword(password)
  const sessionSecret = generateSessionSecret(SESSION_SECRET_BYTES)

  ensureEnvFile()
  const previous = readFileSync(ENV_PATH, 'utf8')
  const next = applyAuthEnvVars(previous, {
    username,
    passwordHash,
    sessionSecret,
  })

  if (next.includes(password)) {
    console.error('설정에 실패했습니다. 평문 비밀번호가 파일에 남지 않도록 중단합니다.')
    process.exit(1)
  }

  writeFileSync(ENV_PATH, next, 'utf8')

  console.log('')
  console.log('ALADDIN 로그인 설정 완료')
  console.log('서버를 재시작해주세요.')
}

main().catch((error) => {
  console.error(error.message || 'Failed')
  process.exit(1)
})
