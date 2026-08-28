import { describe, expect, it } from 'vitest'
import {
  buildSyncFailureNotice,
  describeKiwoomAccountMessage,
  pickKiwoomFailureHint,
} from './kiwoomSyncMessages.js'

describe('describeKiwoomAccountMessage', () => {
  it('키움 인증 실패 메시지를 안내 문구로 변환한다', () => {
    expect(describeKiwoomAccountMessage('Kiwoom authentication failed')).toContain(
      '키움 API 인증 실패',
    )
  })

  it('미설정 키 메시지를 안내 문구로 변환한다', () => {
    expect(describeKiwoomAccountMessage('Kiwoom credentials are not configured')).toContain(
      '.env',
    )
  })
})

describe('pickKiwoomFailureHint', () => {
  it('실패한 계좌 message에서 hint를 고른다', () => {
    expect(
      pickKiwoomFailureHint({
        isa: { ok: false, message: 'Kiwoom authentication failed' },
        general: { ok: false, message: 'Kiwoom authentication failed' },
      }),
    ).toContain('스테이션 키')
  })
})

describe('buildSyncFailureNotice', () => {
  it('키움 인증 실패 시 구체적인 sync notice를 만든다', () => {
    expect(
      buildSyncFailureNotice({
        balanceResult: {
          ok: false,
          accounts: {
            isa: { ok: false, message: 'Kiwoom authentication failed' },
            general: { ok: false, message: 'Kiwoom authentication failed' },
          },
        },
        dividendResult: { ok: false },
      }),
    ).toBe(
      '키움 API 인증 실패 — App Key·Secret과 스테이션 키를 확인해 주세요. · 기존 데이터 유지',
    )
  })

  it('네트워크 오류 시 API 서버 안내를 표시한다', () => {
    expect(
      buildSyncFailureNotice({
        error: { code: 'KIWOOM_BALANCES_NETWORK' },
      }),
    ).toContain('API 서버')
  })
})
