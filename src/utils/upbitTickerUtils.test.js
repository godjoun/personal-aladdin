import { describe, expect, it } from 'vitest'
import {
  UPBIT_TICKER_STALE_MS,
  buildUpbitSubscribePayload,
  formatConnectionStateLabel,
  formatCurrentPriceLabel,
  getUpbitMarketsFromSymbols,
  isTickerStale,
  mapSymbolToUpbitMarket,
  parseUpbitTickerMessage,
  resolveConnectionState,
  resolveQuoteState,
} from './upbitTickerUtils.js'

describe('upbitTickerUtils', () => {
  it('BTC/ETH/SOL symbol을 업비트 market으로 매핑한다', () => {
    expect(mapSymbolToUpbitMarket('BTC')).toBe('KRW-BTC')
    expect(mapSymbolToUpbitMarket('eth')).toBe('KRW-ETH')
    expect(mapSymbolToUpbitMarket('Sol')).toBe('KRW-SOL')
  })

  it('지원하지 않는 종목은 null을 반환한다', () => {
    expect(mapSymbolToUpbitMarket('DOGE')).toBeNull()
    expect(mapSymbolToUpbitMarket('')).toBeNull()
  })

  it('필요한 market 목록을 중복 없이 만든다', () => {
    expect(getUpbitMarketsFromSymbols(['BTC', 'btc', 'ETH'])).toEqual([
      'KRW-BTC',
      'KRW-ETH',
    ])
  })

  it('ticker 메시지를 파싱한다', () => {
    const parsed = parseUpbitTickerMessage({
      type: 'ticker',
      code: 'KRW-BTC',
      trade_price: 100000000,
      trade_timestamp: 1_700_000_000_000,
    })

    expect(parsed).toEqual({
      market: 'KRW-BTC',
      tradePrice: 100000000,
      tradeTimestamp: 1_700_000_000_000,
    })
  })

  it('malformed ticker는 null을 반환한다', () => {
    expect(parseUpbitTickerMessage(null)).toBeNull()
    expect(parseUpbitTickerMessage({ type: 'orderbook' })).toBeNull()
    expect(
      parseUpbitTickerMessage({
        type: 'ticker',
        code: 'KRW-BTC',
        trade_price: Number.NaN,
      }),
    ).toBeNull()
  })

  it('stale 여부를 판단한다', () => {
    const now = 1_000_000
    expect(isTickerStale(now - UPBIT_TICKER_STALE_MS - 1, now)).toBe(true)
    expect(isTickerStale(now - 1000, now)).toBe(false)
  })

  it('연결 상태를 계산한다', () => {
    expect(
      resolveConnectionState({
        isConnected: true,
        connectionFailed: false,
        lastReceivedAt: Date.now(),
      }),
    ).toBe('CONNECTED')

    expect(
      resolveConnectionState({
        isConnected: true,
        connectionFailed: false,
        lastReceivedAt: Date.now() - UPBIT_TICKER_STALE_MS - 1,
      }),
    ).toBe('STALE')

    expect(
      resolveConnectionState({
        isConnected: false,
        connectionFailed: true,
        lastReceivedAt: Date.now(),
      }),
    ).toBe('DISCONNECTED')
  })

  it('quote 상태와 현재가 라벨을 반환한다', () => {
    expect(
      resolveQuoteState({
        supported: false,
        isConnected: true,
        connectionFailed: false,
        lastReceivedAt: Date.now(),
      }),
    ).toBe('unsupported')

    expect(
      formatCurrentPriceLabel('unsupported', 100, (v) => String(v)),
    ).toBe('실시간 시세 미지원')

    expect(
      formatCurrentPriceLabel('loading', null, (v) => String(v)),
    ).toBe('불러오는 중')

    expect(
      formatCurrentPriceLabel('unavailable', null, (v) => String(v)),
    ).toBe('확인할 수 없음')
  })

  it('구독 payload를 생성한다', () => {
    expect(buildUpbitSubscribePayload(['KRW-BTC'])).toEqual([
      { ticket: 'aladdin-trading-plan' },
      { type: 'ticker', codes: ['KRW-BTC'] },
    ])
  })

  it('연결 상태 라벨을 반환한다', () => {
    expect(formatConnectionStateLabel('CONNECTED')).toBe('● 실시간 시세')
    expect(formatConnectionStateLabel('STALE')).toBe('시세 갱신 지연')
    expect(formatConnectionStateLabel('DISCONNECTED')).toBe('시세 연결 끊김')
  })
})
