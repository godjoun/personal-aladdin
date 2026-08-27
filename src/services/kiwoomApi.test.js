import { describe, expect, it, vi } from 'vitest'
import {
  extractKiwoomWithdrawableByAccount,
  fetchKiwoomBalances,
  flattenKiwoomBalanceHoldings,
  readKiwoomMoneyValue,
  readKiwoomNumericValue,
} from './kiwoomApi.js'

describe('flattenKiwoomBalanceHoldings', () => {
  it('ISA + 일반계좌 holdings 에 accountType 을 붙인다', () => {
    const holdings = flattenKiwoomBalanceHoldings({
      ok: true,
      accounts: {
        isa: {
          ok: true,
          holdings: [
            {
              code: { raw: 'A133690', value: '133690' },
              name: 'TIGER 미국나스닥100',
              quantity: { raw: '2', value: 2 },
              avgBuyPrice: { raw: '100', value: 100 },
              currentPrice: { raw: '110', value: 110 },
              evalAmount: { raw: '220', value: 220 },
              profitLoss: { raw: '20', value: 20 },
              profitRate: { raw: '10', value: 10 },
              buyAmount: { raw: '200', value: 200 },
            },
          ],
        },
        general: {
          ok: true,
          holdings: [
            {
              code: { raw: 'A365340', value: '365340' },
              name: '성일하이텍',
              quantity: { raw: '133', value: 133 },
              avgBuyPrice: { raw: '70000', value: 70000 },
              currentPrice: { raw: '80000', value: 80000 },
              evalAmount: { raw: '10640000', value: 10640000 },
              profitLoss: { raw: '1330000', value: 1330000 },
              profitRate: { raw: '14.28', value: 14.28 },
              buyAmount: { raw: '9310000', value: 9310000 },
            },
          ],
        },
      },
    })

    expect(holdings).toHaveLength(2)
    expect(holdings[0]).toMatchObject({
      accountType: 'isa',
      symbol: '133690',
      name: 'TIGER 미국나스닥100',
      quantity: 2,
      currentPrice: 110,
    })
    expect(holdings[1]).toMatchObject({
      accountType: 'general',
      symbol: '365340',
      name: '성일하이텍',
      quantity: 133,
    })
  })

  it('실패한 계좌 holdings 는 제외한다', () => {
    const holdings = flattenKiwoomBalanceHoldings({
      ok: true,
      accounts: {
        isa: { ok: false, holdings: [], message: 'fail' },
        general: {
          ok: true,
          holdings: [
            {
              code: { value: '365340' },
              name: '성일하이텍',
              quantity: { value: 1 },
            },
          ],
        },
      },
    })

    expect(holdings).toHaveLength(1)
    expect(holdings[0].accountType).toBe('general')
  })
})

describe('readKiwoom*Value', () => {
  it('현재가 없음을 0으로 바꾸지 않는다', () => {
    expect(readKiwoomNumericValue(null)).toBeNull()
    expect(readKiwoomNumericValue(undefined)).toBeNull()
    expect(readKiwoomNumericValue({ raw: '', value: null })).toBeNull()
    expect(readKiwoomMoneyValue({ raw: '', value: null })).toBeNull()
  })
})

describe('extractKiwoomWithdrawableByAccount', () => {
  it('ISA / 일반 출금가능액을 정규화한다', () => {
    expect(
      extractKiwoomWithdrawableByAccount({
        accounts: {
          isa: {
            ok: true,
            holdings: [],
            withdrawableAmount: { raw: '150000', value: 150000 },
          },
          general: {
            ok: true,
            holdings: [],
            withdrawableAmount: { raw: '25000', value: 25000 },
          },
        },
      }),
    ).toEqual([
      { accountType: 'isa', withdrawableAmount: 150000 },
      { accountType: 'general', withdrawableAmount: 25000 },
    ])
  })

  it('값 누락·조회 실패 시 null (0으로 만들지 않음)', () => {
    expect(
      extractKiwoomWithdrawableByAccount({
        accounts: {
          isa: { ok: true, holdings: [], withdrawableAmount: null },
          general: { ok: false, holdings: [], message: 'fail' },
        },
      }),
    ).toEqual([
      { accountType: 'isa', withdrawableAmount: null },
      { accountType: 'general', withdrawableAmount: null },
    ])
  })
})

describe('fetchKiwoomBalances', () => {
  it('token/secret 을 클라이언트 결과에 포함하지 않는다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        accounts: {
          isa: {
            ok: true,
            holdings: [
              {
                code: { value: '005930' },
                name: '삼성전자',
                quantity: { value: 1 },
                avgBuyPrice: { value: 70000 },
                currentPrice: { value: 75000 },
                evalAmount: { value: 75000 },
                profitLoss: { value: 5000 },
                profitRate: { value: 7.14 },
              },
            ],
            withdrawableAmount: { raw: '1000', value: 1000 },
          },
          general: { ok: false, holdings: [], withdrawableAmount: null },
        },
        token: 'should-not-leak',
        appkey: 'leak-key',
        secretkey: 'leak-secret',
      }),
    })

    const result = await fetchKiwoomBalances({ fetchImpl })
    const dumped = JSON.stringify(result)

    expect(result.ok).toBe(true)
    expect(result.holdings[0].accountType).toBe('isa')
    expect(result.withdrawableByAccount).toEqual([
      { accountType: 'isa', withdrawableAmount: 1000 },
      { accountType: 'general', withdrawableAmount: null },
    ])
    expect(dumped).not.toContain('should-not-leak')
    expect(dumped).not.toContain('leak-key')
    expect(dumped).not.toContain('leak-secret')
    expect(result).not.toHaveProperty('token')
  })

  it('조회 실패 시 예외를 던진다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    })

    await expect(fetchKiwoomBalances({ fetchImpl })).rejects.toMatchObject({
      code: 'KIWOOM_BALANCES_HTTP',
    })
  })
})
