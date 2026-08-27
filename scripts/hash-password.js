#!/usr/bin/env node
/**
 * auth:hash — 비밀번호 scrypt 해시 생성 (평문 비밀번호는 출력하지 않음)
 *
 * 사용:
 *   npm run auth:hash
 *   또는: node scripts/hash-password.js
 *
 * 대화형으로 비밀번호를 입력받고 hash만 stdout에 출력합니다.
 */

import { hashPassword } from '../server/auth/password.js'
import { MIN_PASSWORD_LENGTH } from './authEnvFile.js'
import { readHidden } from './promptHidden.js'

async function main() {
  const password = await readHidden('Password (input hidden): ')
  const confirm = await readHidden('Confirm password: ')

  if (password !== confirm) {
    console.error('Passwords do not match.')
    process.exit(1)
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    process.exit(1)
  }

  const hash = hashPassword(password)
  console.log('')
  console.log('ALADDIN_ADMIN_PASSWORD_HASH=')
  console.log(hash)
  console.log('')
  console.log('Copy the hash into your .env (never commit the password).')
}

main().catch((error) => {
  console.error(error.message || 'Failed')
  process.exit(1)
})
