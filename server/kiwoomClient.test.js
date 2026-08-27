import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearKiwoomStockListCache,
  clearKiwoomTokenCache,
  extractKiwoomWithdrawableAmount,
  filterKiwoomStockList,
  getKiwoomAccessToken,
  getKiwoomAuthStatus,
  getKiwoomBalance,
  getKiwoomBalances,
  normalizeKiwoomHolding,
  normalizeKiwoomStockItem,
  parseKiwoomExpiresAt,
  parseKiwoomNumber,
  searchKiwoomStocks,
} from './kiwoomClient.js'

const FUTURE_EXPIRES = '20991231235959'
const PAST_EXPIRES = '20000101000000'

const TEST_ENV = {
  KIWOOM_ISA_APP_KEY: 'isa-test-key',
  KIWOOM_ISA_APP_SECRET: 'isa-test-secret',
  KIWOOM_GENERAL_APP_KEY: 'general-test-key',
  KIWOOM_GENERAL_APP_SECRET: 'general-test-secret',
}

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

afterEach(() => {
  clearKiwoomTokenCache()
  clearKiwoomStockListCache()
  vi.unstubAllGlobals()
})

describe('parseKiwoomExpiresAt', () => {
  it('YYYYMMDDHHmmss 형식을 파싱한다', () => {
    const date = parseKiwoomExpiresAt('20991231235959')
    expect(date).toBeInstanceOf(Date)
    expect(date.getFullYear()).toBe(2099)
  })
})

describe('getKiwoomAccessToken', () => {
  it('ISA 인증 성공', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        token: 'isa-token',
        token_type: 'bearer',
        expires_dt: FUTURE_EXPIRES,
      }),
    )

    const result = await getKiwoomAccessToken('isa', {
      env: TEST_ENV,
      fetchImpl,
    })

    expect(result.token).toBe('isa-token')
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.appkey).toBe('isa-test-key')
    expect(body.secretkey).toBe('isa-test-secret')
  })

  it('일반계좌 인증 성공', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        token: 'general-token',
        token_type: 'bearer',
        expires_dt: FUTURE_EXPIRES,
      }),
    )

    const result = await getKiwoomAccessToken('general', {
      env: TEST_ENV,
      fetchImpl,
    })

    expect(result.token).toBe('general-token')
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.appkey).toBe('general-test-key')
    expect(body.secretkey).toBe('general-test-secret')
  })

  it('두 계좌 token cache 가 독립이다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          token: 'isa-token',
          token_type: 'bearer',
          expires_dt: FUTURE_EXPIRES,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          token: 'general-token',
          token_type: 'bearer',
          expires_dt: FUTURE_EXPIRES,
        }),
      )

    const options = { env: TEST_ENV, fetchImpl }
    const isa = await getKiwoomAccessToken('isa', options)
    const general = await getKiwoomAccessToken('general', options)
    const isaAgain = await getKiwoomAccessToken('isa', options)
    const generalAgain = await getKiwoomAccessToken('general', options)

    expect(isa.token).toBe('isa-token')
    expect(general.token).toBe('general-token')
    expect(isaAgain.token).toBe('isa-token')
    expect(generalAgain.token).toBe('general-token')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('환경변수 누락 시 설정 오류', async () => {
    await expect(
      getKiwoomAccessToken('isa', { env: {}, fetchImpl: vi.fn() }),
    ).rejects.toMatchObject({ code: 'KIWOOM_CONFIG' })
  })

  it('만료된 토큰은 해당 계좌만 재발급', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          token: 'isa-old',
          token_type: 'bearer',
          expires_dt: PAST_EXPIRES,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          token: 'general-live',
          token_type: 'bearer',
          expires_dt: FUTURE_EXPIRES,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          token: 'isa-new',
          token_type: 'bearer',
          expires_dt: FUTURE_EXPIRES,
        }),
      )

    const options = { env: TEST_ENV, fetchImpl }
    await getKiwoomAccessToken('isa', options)
    await getKiwoomAccessToken('general', options)

    const isaRenewed = await getKiwoomAccessToken('isa', {
      ...options,
      now: new Date('2020-01-02T00:00:00'),
    })
    const generalCached = await getKiwoomAccessToken('general', {
      ...options,
      now: new Date('2020-01-02T00:00:00'),
    })

    expect(isaRenewed.token).toBe('isa-new')
    expect(generalCached.token).toBe('general-live')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})

describe('getKiwoomAuthStatus', () => {
  it('한 계좌 실패 시에도 다른 계좌는 정상 표시', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body)
      if (body.appkey === 'isa-test-key') {
        return createJsonResponse({}, 401)
      }
      return createJsonResponse({
        token: 'general-token',
        token_type: 'bearer',
        expires_dt: FUTURE_EXPIRES,
      })
    })

    const status = await getKiwoomAuthStatus({
      env: TEST_ENV,
      fetchImpl,
    })

    expect(status.ok).toBe(true)
    expect(status.accounts.isa.authenticated).toBe(false)
    expect(status.accounts.general.authenticated).toBe(true)
    expect(status.accounts.general.expiresAt).toEqual(expect.any(String))
  })

  it('token / key 를 응답에 포함하지 않는다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        token: 'secret-token-value',
        token_type: 'bearer',
        expires_dt: FUTURE_EXPIRES,
      }),
    )

    const status = await getKiwoomAuthStatus({
      env: TEST_ENV,
      fetchImpl,
    })

    const dumped = JSON.stringify(status)
    expect(dumped).not.toContain('secret-token-value')
    expect(dumped).not.toContain('isa-test-key')
    expect(dumped).not.toContain('isa-test-secret')
    expect(dumped).not.toContain('general-test-key')
    expect(dumped).not.toContain('general-test-secret')
    expect(status).not.toHaveProperty('token')
    expect(status.accounts.isa).not.toHaveProperty('token')
    expect(status.accounts.general).not.toHaveProperty('token')
  })
})

describe('parseKiwoomNumber / normalizeKiwoomHolding', () => {
  it('숫자 문자열을 정규화한다', () => {
    expect(parseKiwoomNumber('1,234')).toBe(1234)
    expect(parseKiwoomNumber('+12.5')).toBe(12.5)
    expect(parseKiwoomNumber('-3.2')).toBe(-3.2)
    expect(parseKiwoomNumber('')).toBeNull()
  })

  it('holdings 필드를 안전하게 정규화한다', () => {
    const holding = normalizeKiwoomHolding({
      stk_cd: 'A005930',
      stk_nm: '삼성전자',
      rmnd_qty: '10',
      pur_pric: '70,000',
      pur_amt: '700,000',
      cur_prc: '72,000',
      evlt_amt: '720,000',
      evltv_prft: '+20,000',
      prft_rt: '2.86',
    })

    expect(holding.code).toEqual({ raw: 'A005930', value: '005930' })
    expect(holding.name).toBe('삼성전자')
    expect(holding.quantity).toEqual({ raw: '10', value: 10 })
    expect(holding.avgBuyPrice).toEqual({ raw: '70,000', value: 70000 })
    expect(holding.buyAmount).toEqual({ raw: '700,000', value: 700000 })
    expect(holding.currentPrice).toEqual({ raw: '72,000', value: 72000 })
    expect(holding.evalAmount).toEqual({ raw: '720,000', value: 720000 })
    expect(holding.profitLoss).toEqual({ raw: '+20,000', value: 20000 })
    expect(holding.profitRate).toEqual({ raw: '2.86', value: 2.86 })
  })
})

describe('extractKiwoomWithdrawableAmount', () => {
  it('paym_alowa(출금가능금액)를 공식 값으로 읽는다', () => {
    expect(extractKiwoomWithdrawableAmount({ paym_alowa: '150000' })).toEqual({
      raw: '150000',
      value: 150000,
    })
  })

  it('pymn_alow_amt 도 지원한다', () => {
    expect(extractKiwoomWithdrawableAmount({ pymn_alow_amt: '25000' })).toEqual({
      raw: '25000',
      value: 25000,
    })
  })

  it('필드가 없으면 null (0으로 만들지 않음)', () => {
    expect(extractKiwoomWithdrawableAmount({ return_code: 0 })).toBeNull()
    expect(extractKiwoomWithdrawableAmount(null)).toBeNull()
  })

  it('공식 값 0은 0으로 유지한다', () => {
    expect(extractKiwoomWithdrawableAmount({ paym_alowa: '0' })).toEqual({
      raw: '0',
      value: 0,
    })
  })
})

describe('getKiwoomBalance / getKiwoomBalances', () => {
  function mockAuthThenBalance(balanceByToken) {
    return vi.fn().mockImplementation(async (url, init) => {
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

      const auth = init.headers.authorization || ''
      const token = auth.replace(/^Bearer\s+/i, '')
      const result = balanceByToken(token, init)
      return result
    })
  }

  it('ISA 잔고 정상', async () => {
    const fetchImpl = mockAuthThenBalance((token) => {
      expect(token).toBe('isa-token')
      return createJsonResponse({
        return_code: 0,
        paym_alowa: '150000',
        acnt_evlt_remn_indv_tot: [
          {
            stk_cd: 'A005930',
            stk_nm: '삼성전자',
            rmnd_qty: '5',
            pur_pric: '70000',
            pur_amt: '350000',
            cur_prc: '71000',
            evlt_amt: '355000',
            evltv_prft: '5000',
            prft_rt: '1.43',
          },
        ],
      })
    })

    const result = await getKiwoomBalance('isa', {
      env: TEST_ENV,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.holdings).toHaveLength(1)
    expect(result.holdings[0].name).toBe('삼성전자')
    expect(result.holdings[0].quantity.value).toBe(5)
    expect(result.withdrawableAmount?.value).toBe(150000)
  })

  it('일반계좌 잔고 정상', async () => {
    const fetchImpl = mockAuthThenBalance((token) => {
      expect(token).toBe('general-token')
      return createJsonResponse({
        return_code: 0,
        pymn_alow_amt: '25000',
        acnt_evlt_remn_indv_tot: [
          {
            stk_cd: 'A000660',
            stk_nm: 'SK하이닉스',
            rmnd_qty: '2',
            pur_pric: '100000',
            pur_amt: '200000',
            cur_prc: '110000',
            evlt_amt: '220000',
            evltv_prft: '20000',
            prft_rt: '10',
          },
        ],
      })
    })

    const result = await getKiwoomBalance('general', {
      env: TEST_ENV,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.holdings[0].name).toBe('SK하이닉스')
    expect(result.holdings[0].quantity.value).toBe(2)
    expect(result.withdrawableAmount?.value).toBe(25000)
  })

  it('한쪽 실패해도 다른 계좌는 조회 가능', async () => {
    const fetchImpl = mockAuthThenBalance((token) => {
      if (token === 'isa-token') {
        return createJsonResponse({ return_code: 1, return_msg: 'fail' })
      }
      return createJsonResponse({
        return_code: 0,
        acnt_evlt_remn_indv_tot: [
          {
            stk_cd: 'A035420',
            stk_nm: 'NAVER',
            rmnd_qty: '1',
            pur_pric: '200000',
            pur_amt: '200000',
            cur_prc: '210000',
            evlt_amt: '210000',
            evltv_prft: '10000',
            prft_rt: '5',
          },
        ],
      })
    })

    const result = await getKiwoomBalances({
      env: TEST_ENV,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.accounts.isa.ok).toBe(false)
    expect(result.accounts.general.ok).toBe(true)
    expect(result.accounts.general.holdings[0].name).toBe('NAVER')
  })

  it('연속조회(cont-yn / next-key)를 처리한다', async () => {
    let balanceCalls = 0
    const fetchImpl = mockAuthThenBalance((_token, init) => {
      balanceCalls += 1
      if (balanceCalls === 1) {
        expect(init.headers['cont-yn']).toBe('N')
        return {
          ...createJsonResponse({
            return_code: 0,
            acnt_evlt_remn_indv_tot: [
              {
                stk_cd: 'A005930',
                stk_nm: '삼성전자',
                rmnd_qty: '1',
                pur_pric: '1',
                pur_amt: '1',
                cur_prc: '1',
                evlt_amt: '1',
                evltv_prft: '0',
                prft_rt: '0',
              },
            ],
          }),
          headers: {
            get: (name) => {
              if (name.toLowerCase() === 'cont-yn') return 'Y'
              if (name.toLowerCase() === 'next-key') return 'page-2'
              return null
            },
          },
        }
      }

      expect(init.headers['cont-yn']).toBe('Y')
      expect(init.headers['next-key']).toBe('page-2')
      return {
        ...createJsonResponse({
          return_code: 0,
          acnt_evlt_remn_indv_tot: [
            {
              stk_cd: 'A000660',
              stk_nm: 'SK하이닉스',
              rmnd_qty: '2',
              pur_pric: '1',
              pur_amt: '2',
              cur_prc: '1',
              evlt_amt: '2',
              evltv_prft: '0',
              prft_rt: '0',
            },
          ],
        }),
        headers: {
          get: () => null,
        },
      }
    })

    const result = await getKiwoomBalance('isa', {
      env: TEST_ENV,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.holdings.map((h) => h.name)).toEqual([
      '삼성전자',
      'SK하이닉스',
    ])
  })

  it('token / secret / 계좌번호를 응답에 포함하지 않는다', async () => {
    const fetchImpl = mockAuthThenBalance(() =>
      createJsonResponse({
        return_code: 0,
        acnt_no: '1234567890',
        acnt_evlt_remn_indv_tot: [
          {
            stk_cd: 'A005930',
            stk_nm: '삼성전자',
            rmnd_qty: '1',
            pur_pric: '1',
            pur_amt: '1',
            cur_prc: '1',
            evlt_amt: '1',
            evltv_prft: '0',
            prft_rt: '0',
            acnt_no: '1234567890',
          },
        ],
      }),
    )

    const result = await getKiwoomBalances({
      env: TEST_ENV,
      fetchImpl,
    })

    const dumped = JSON.stringify(result)
    expect(dumped).not.toContain('isa-token')
    expect(dumped).not.toContain('general-token')
    expect(dumped).not.toContain('isa-test-key')
    expect(dumped).not.toContain('isa-test-secret')
    expect(dumped).not.toContain('general-test-key')
    expect(dumped).not.toContain('general-test-secret')
    expect(dumped).not.toContain('1234567890')
    expect(result.accounts.isa).not.toHaveProperty('token')
    expect(result.accounts.general).not.toHaveProperty('token')
  })
})

describe('종목 검색 normalization / filter', () => {
  it('종목 검색 결과를 정규화한다', () => {
    expect(
      normalizeKiwoomStockItem({
        code: 'A365340',
        name: '성일하이텍',
      }),
    ).toEqual({ symbol: '365340', name: '성일하이텍' })
  })

  it('이름 부분검색을 지원한다', () => {
    const items = [
      { symbol: '365340', name: '성일하이텍' },
      { symbol: '014910', name: '성일종합건설' },
      { symbol: '005930', name: '삼성전자' },
    ]

    expect(filterKiwoomStockList(items, '성일').map((i) => i.symbol)).toEqual([
      '365340',
      '014910',
    ])
  })

  it('종목코드 검색을 지원한다', () => {
    const items = [
      { symbol: '365340', name: '성일하이텍' },
      { symbol: '005930', name: '삼성전자' },
    ]

    expect(filterKiwoomStockList(items, '365').map((i) => i.symbol)).toEqual([
      '365340',
    ])
  })

  it('최대 결과 개수를 제한한다', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      symbol: String(100000 + i),
      name: `테스트종목${i}`,
    }))

    expect(filterKiwoomStockList(items, '테스트', 10)).toHaveLength(10)
  })

  it('이름 완전일치를 맨 앞에 둔다', () => {
    const items = [
      { symbol: '143850', name: 'TIGER 미국S&P500선물(H)' },
      { symbol: '360750', name: 'TIGER 미국S&P500' },
      { symbol: '225040', name: 'TIGER 미국S&P500레버리지(합성 H)' },
    ]

    expect(filterKiwoomStockList(items, 'TIGER 미국S&P500')[0]).toEqual({
      symbol: '360750',
      name: 'TIGER 미국S&P500',
    })
  })
})

describe('searchKiwoomStocks', () => {
  function mockAuthAndStockLists(listsByMarket) {
    return vi.fn().mockImplementation(async (url, init) => {
      if (String(url).includes('/oauth2/token')) {
        return createJsonResponse({
          token: 'general-token',
          token_type: 'Bearer',
          expires_dt: FUTURE_EXPIRES,
        })
      }

      const body = JSON.parse(init.body)
      const list = listsByMarket[body.mrkt_tp] || []
      return createJsonResponse({
        return_code: 0,
        list,
      })
    })
  }

  it('캐시에서 검색하고 token/secret 을 노출하지 않는다', async () => {
    const fetchImpl = mockAuthAndStockLists({
      0: [
        { code: '005930', name: '삼성전자' },
        { code: '360750', name: 'TIGER 미국S&P500' },
      ],
      10: [{ code: '365340', name: '성일하이텍' }],
      8: [
        { code: '133690', name: 'TIGER 미국나스닥100' },
        { code: '458730', name: 'TIGER 미국배당다우존스' },
      ],
    })

    const results = await searchKiwoomStocks('TIGER 미국', {
      env: TEST_ENV,
      fetchImpl,
      limit: 10,
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.name.includes('TIGER 미국'))).toBe(true)

    const dumped = JSON.stringify(results)
    expect(dumped).not.toContain('general-token')
    expect(dumped).not.toContain('general-test-key')
    expect(dumped).not.toContain('general-test-secret')

    // 두 번째 검색은 캐시 사용 → token 재요청 없음(시장 3회 + 토큰 1회)
    const firstCalls = fetchImpl.mock.calls.length
    await searchKiwoomStocks('성일', { env: TEST_ENV, fetchImpl })
    expect(fetchImpl.mock.calls.length).toBe(firstCalls)
  })

  it('검색 실패해도 예외로 수동입력 흐름을 막지 않는 형태(호출부 처리)', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('/oauth2/token')) {
        return createJsonResponse({
          token: 'general-token',
          token_type: 'Bearer',
          expires_dt: FUTURE_EXPIRES,
        })
      }
      return createJsonResponse({}, 500)
    })

    await expect(
      searchKiwoomStocks('성일', { env: TEST_ENV, fetchImpl }),
    ).rejects.toMatchObject({ code: 'KIWOOM_STOCK_LIST' })
  })
})
