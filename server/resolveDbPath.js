/**
 * resolveDbPath.js — SQLite 경로 (production persistent 필수)
 */

import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   isProd?: boolean,
 *   defaultPath?: string,
 * }} [options]
 * @returns {{ dbPath: string, source: string }}
 */
export function resolveDbPath(options = {}) {
  const env = options.env || process.env
  const isProd =
    options.isProd ?? env.NODE_ENV === 'production'
  const defaultPath =
    options.defaultPath ||
    path.join(__dirname, 'data', 'aladdin.sqlite')

  const explicit = env.ALADDIN_DB_PATH?.trim()
  if (explicit) {
    return { dbPath: path.resolve(explicit), source: 'ALADDIN_DB_PATH' }
  }

  const dataDir = env.ALADDIN_DATA_DIR?.trim()
  if (dataDir) {
    return {
      dbPath: path.resolve(dataDir, 'aladdin.sqlite'),
      source: 'ALADDIN_DATA_DIR',
    }
  }

  if (isProd) {
    const error = new Error(
      'Production requires ALADDIN_DB_PATH or ALADDIN_DATA_DIR for persistent SQLite storage',
    )
    error.code = 'ALADDIN_DB_PATH_REQUIRED'
    throw error
  }

  return { dbPath: defaultPath, source: 'default' }
}
