/**
 * kiwoomSyncMessages.js — 키움 동기화 실패 안내 (사용자용)
 */

/**
 * @param {string | undefined} message
 * @returns {string | null}
 */
export function describeKiwoomAccountMessage(message) {
  const text = String(message || '').trim()
  if (!text) return null

  if (
    text === 'Kiwoom authentication failed' ||
    /authentication failed/i.test(text)
  ) {
    return '키움 API 인증 실패 — App Key·Secret과 스테이션 키를 확인해 주세요.'
  }

  if (text === 'Kiwoom credentials are not configured') {
    return '키움 API 키가 설정되지 않았습니다 — .env의 KIWOOM_* 값을 확인해 주세요.'
  }

  if (/request failed|network/i.test(text)) {
    return '키움 서버 연결 실패 — 네트워크를 확인해 주세요.'
  }

  if (/balance inquiry failed/i.test(text)) {
    return '키움 잔고 조회 실패 — 잠시 후 다시 시도해 주세요.'
  }

  return '키움 계좌 정보를 불러오지 못했습니다.'
}

/**
 * @param {Record<string, { ok?: boolean, message?: string }> | null | undefined} accounts
 * @returns {string | null}
 */
export function pickKiwoomFailureHint(accounts) {
  if (!accounts || typeof accounts !== 'object') return null

  for (const accountType of ['isa', 'general']) {
    const account = accounts[accountType]
    if (account?.ok) continue
    const hint = describeKiwoomAccountMessage(account?.message)
    if (hint) return hint
  }

  return null
}

/**
 * @param {{ code?: string, status?: number } | null | undefined} error
 * @returns {string | null}
 */
export function describeSyncTransportError(error) {
  const code = error?.code

  if (code === 'KIWOOM_BALANCES_NETWORK' || code === 'KIWOOM_DIVIDENDS_NETWORK') {
    return 'API 서버에 연결하지 못했습니다 — npm run central 또는 로컬 서버(3001) 실행을 확인해 주세요.'
  }

  if (code === 'KIWOOM_BALANCES_HTTP' && error?.status === 401) {
    return '로그인이 만료되었습니다 — 다시 로그인해 주세요.'
  }

  if (code === 'KIWOOM_BALANCES_HTTP' && error?.status === 503) {
    return '키움 API를 사용할 수 없습니다 — 서버 설정을 확인해 주세요.'
  }

  return null
}

/**
 * @param {{
 *   balanceResult?: { ok?: boolean, accounts?: Record<string, { ok?: boolean, message?: string }> },
 *   dividendResult?: { ok?: boolean },
 *   error?: { code?: string, status?: number },
 * }} [params]
 * @returns {string}
 */
export function buildSyncFailureNotice(params = {}) {
  const { balanceResult, dividendResult, error } = params

  const transportHint = describeSyncTransportError(error)
  if (transportHint) {
    return `${transportHint} · 기존 데이터 유지`
  }

  const kiwoomHint = pickKiwoomFailureHint(balanceResult?.accounts)
  if (kiwoomHint) {
    return `${kiwoomHint} · 기존 데이터 유지`
  }

  if (dividendResult && !dividendResult.ok) {
    return '키움 배당 동기화 실패 · 기존 데이터 유지'
  }

  return '동기화 실패 · 기존 데이터 유지'
}
