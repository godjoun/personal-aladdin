/**
 * promptHidden.js — 터미널 입력 (비밀번호는 가능하면 숨김)
 */

import { createInterface } from 'readline'

/**
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export function readLineVisible(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
    })
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/**
 * 비밀번호 입력 — TTY면 글자 미표시
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    const stdout = process.stdout

    if (!stdin.isTTY) {
      const rl = createInterface({ input: stdin, output: stdout, terminal: false })
      rl.question(prompt, (answer) => {
        rl.close()
        resolve(answer)
      })
      return
    }

    stdout.write(prompt)
    const chunks = []
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    function cleanup() {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
    }

    function onData(char) {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        cleanup()
        stdout.write('\n')
        resolve(chunks.join(''))
        return
      }
      if (char === '\u0003') {
        cleanup()
        reject(new Error('Cancelled'))
        return
      }
      if (char === '\u007f' || char === '\b') {
        chunks.pop()
        return
      }
      chunks.push(char)
    }

    stdin.on('data', onData)
  })
}
