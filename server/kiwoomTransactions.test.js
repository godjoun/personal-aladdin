import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearKiwoomTokenCache } from './kiwoomClient.js'
import {
  formatKiwoomPaymentDate,
  getKiwoomDividendPayments,
  getKiwoomTransactions,
  isKiwoomDividendTransaction,
  isLikelyBuySellTransaction,
  toKiwoomDividendPayment,
  toPublicKiwoomDividend,
} from './kiwoomTransactions.js'

const FUTURE_EXPIRES = '20991231235959'
const TEST_ENV = {
  KIWOOM_ISA_APP_KEY: 'isa-test-key',
  KIWOOM_ISA_APP_SECRET: 'isa-test-secret',
  KIWOOM_GENERAL_APP_KEY: 'general-test-key',
  KIWOOM_GENERAL_APP_SECRET: 'general-test-secret',
}

function createJsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
  }
}

afterEach(() => {
  clearKiwoomTokenCache()
  vi.unstubAllGlobals()
})

describe('isKiwoomDividendTransaction', () => {
  it('실계좌에서 확인된 수익분배금입금 을 배당으로 판별한다', () => {
    expect(
      isKiwoomDividendTransaction({ rmrk_nm: '수익분배금입금', trde_kind_nm: '입출금' }),
    ).toBe(true)
  })

  it('일반 매수/매도는 배당으로 오인하지 않는다', () => {
    expect(
      isKiwoomDividendTransaction({ rmrk_nm: '보통매수', trde_kind_nm: '매수' }),
    ).toBe(false)
    expect(
      isLikelyBuySellTransaction({ rmrk_nm: '보통매수', trde_kind_nm: '매수' }),
    ).toBe(true)
  })
})

describe('toKiwoomDividendPayment', () => {
  it('실제 정산금액을 confirmedAmount 로 사용한다', () => {
    const payment = toKiwoomDividendPayment(
      {
        trde_dt: '20260804',
        trde_no: '000000002',
        rmrk_nm: '수익분배금입금',
        stk_nm: 'TIGER미국나스닥100',
        stk_cd: 'A133690',
        exct_amt: '000000000000510',
        trde_amt: '000000000000510',
        incm_resi_tax: '000000000000000',
      },
      'isa',
    )

    expect(payment).toMatchObject({
      accountType: 'isa',
      paymentDate: '2026-08-04',
      symbol: '133690',
      name: 'TIGER미국나스닥100',
      amount: 510,
      confirmedAmount: 510,
      source: 'KIWOOM',
      sourceKey: 'kiwoom:isa:20260804:000000002',
    })
    expect(formatKiwoomPaymentDate('20260819')).toBe('2026-08-19')
  })
})

describe('getKiwoomTransactions / dividends', () => {
  it('kt00015 정상 거래내역과 연속조회를 처리한다', async () => {
    let tradeCalls = 0
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('/oauth2/token')) {
        return createJsonResponse({
          token: 'isa-token',
          token_type: 'Bearer',
          expires_dt: FUTURE_EXPIRES,
        })
      }

      tradeCalls += 1
      if (tradeCalls === 1) {
        return createJsonResponse(
          {
            return_code: 0,
            trst_ovrl_trde_prps_array: [
              {
                trde_dt: '20260804',
                trde_no: '000000001',
                rmrk_nm: '수익분배금입금',
                trde_kind_nm: '입출금',
                stk_nm: 'TIGER미국S&P500',
                stk_cd: 'A360750',
                exct_amt: '2310',
                trde_amt: '2310',
                io_tp: '1',
                io_tp_nm: '입금',
                incm_resi_tax: '0',
                proc_tm: '14:45:48',
              },
            ],
          },
          200,
          { 'cont-yn': 'Y', 'next-key': 'page-2' },
        )
      }

      return createJsonResponse({
        return_code: 0,
        trst_ovrl_trde_prps_array: [
          {
            trde_dt: '20260819',
            trde_no: '000000001',
            rmrk_nm: '수익분배금입금',
            trde_kind_nm: '입출금',
            stk_nm: 'KODEX단기채권PLUS',
            stk_cd: 'A214980',
            exct_amt: '1415',
            trde_amt: '1415',
            io_tp: '1',
            io_tp_nm: '입금',
            incm_resi_tax: '0',
            proc_tm: '10:42:22',
          },
        ],
      })
    })

    const result = await getKiwoomTransactions('isa', {
      env: TEST_ENV,
      fetchImpl,
      from: '2026-08-01',
      to: '2026-08-26',
    })

    expect(result.ok).toBe(true)
    expect(result.transactions).toHaveLength(2)
    expect(tradeCalls).toBe(2)
  })

  it('배당만 추출하고 credential / 계좌번호를 노출하지 않는다', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url, init) => {
      if (String(url).includes('/oauth2/token')) {
        const body = JSON.parse(init.body)
        const token =
          body.appkey === 'isa-test-key' ? 'isa-token' : 'general-token'
        return createJsonResponse({
          token,
          token_type: 'Bearer',
          expires_dt: FUTURE_EXPIRES,
        })
      }

      return createJsonResponse({
        return_code: 0,
        acnt_no: 'SHOULD_NOT_LEAK',
        entra_remn: '999999',
        trst_ovrl_trde_prps_array: [
          {
            trde_dt: '20260804',
            trde_no: '000000002',
            rmrk_nm: '수익분배금입금',
            trde_kind_nm: '입출금',
            stk_nm: 'TIGER미국나스닥100',
            stk_cd: 'A133690',
            exct_amt: '510',
            trde_amt: '510',
            io_tp: '1',
            io_tp_nm: '입금',
            incm_resi_tax: '0',
            proc_tm: '15:18:47',
            entra_remn: '888888',
          },
          {
            trde_dt: '20260805',
            trde_no: '000000010',
            rmrk_nm: '보통매수',
            trde_kind_nm: '매수',
            stk_nm: '삼성전자',
            stk_cd: 'A005930',
            exct_amt: '70000',
            trde_amt: '70000',
            io_tp: '2',
            io_tp_nm: '출금',
            incm_resi_tax: '0',
            proc_tm: '09:00:00',
          },
        ],
      })
    })

    const result = await getKiwoomDividendPayments({
      env: TEST_ENV,
      fetchImpl,
      from: '2026-08-01',
    })

    expect(result.ok).toBe(true)
    expect(result.dividends).toHaveLength(2)
    expect(result.dividends.every((d) => d.amount === 510)).toBe(true)

    const dumped = JSON.stringify(result)
    expect(dumped).not.toContain('isa-token')
    expect(dumped).not.toContain('general-token')
    expect(dumped).not.toContain('isa-test-key')
    expect(dumped).not.toContain('SHOULD_NOT_LEAK')
    expect(dumped).not.toContain('999999')
    expect(dumped).not.toContain('888888')

    const publicItem = toPublicKiwoomDividend(result.dividends[0])
    expect(publicItem).not.toHaveProperty('token')
    expect(Object.keys(publicItem).sort()).toEqual(
      [
        'accountType',
        'amount',
        'name',
        'paymentDate',
        'source',
        'sourceKey',
        'symbol',
        'taxAmount',
      ].sort(),
    )
  })
})
