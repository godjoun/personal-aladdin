/**
 * useUpbitTicker.js — 업비트 공개 ticker WebSocket hook
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  UPBIT_MAX_RECONNECT_ATTEMPTS,
  UPBIT_RECONNECT_DELAY_MS,
  UPBIT_WEBSOCKET_URL,
  buildUpbitSubscribePayload,
  formatConnectionStateLabel,
  getUpbitMarketsFromSymbols,
  mapSymbolToUpbitMarket,
  parseUpbitTickerMessage,
  parseUpbitWebSocketPayload,
} from '../utils/upbitTickerUtils.js'
import { resolveSectionConnectionState } from '../utils/tradingPlanMonitor.js'

/**
 * @typedef {{ tradePrice: number, receivedAt: number, tradeTimestamp: number | null }} UpbitTickerSnapshot
 */

/**
 * @param {string[]} symbols
 */
export function useUpbitTicker(symbols) {
  const markets = useMemo(() => getUpbitMarketsFromSymbols(symbols), [symbols])
  const marketsKey = markets.join('|')

  /** @type {[Record<string, UpbitTickerSnapshot>, Function]} */
  const [tickers, setTickers] = useState({})
  const [isConnected, setIsConnected] = useState(false)
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!marketsKey) {
      setTickers({})
      setIsConnected(false)
      setConnectionFailed(false)
      return undefined
    }

    const subscribedMarkets = marketsKey.split('|')
    let ws = null
    let reconnectAttempts = 0
    let reconnectTimer = null
    let closed = false

    function connect() {
      ws = new WebSocket(UPBIT_WEBSOCKET_URL)

      ws.onopen = () => {
        setIsConnected(true)
        setConnectionFailed(false)
        reconnectAttempts = 0
        ws?.send(JSON.stringify(buildUpbitSubscribePayload(subscribedMarkets)))
      }

      ws.onmessage = async (event) => {
        const payload = await parseUpbitWebSocketPayload(event.data)
        const ticker = parseUpbitTickerMessage(payload)
        if (!ticker) return

        setTickers((prev) => ({
          ...prev,
          [ticker.market]: {
            tradePrice: ticker.tradePrice,
            receivedAt: Date.now(),
            tradeTimestamp: ticker.tradeTimestamp,
          },
        }))
      }

      ws.onclose = () => {
        setIsConnected(false)
        if (closed) return

        if (reconnectAttempts < UPBIT_MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts += 1
          reconnectTimer = window.setTimeout(connect, UPBIT_RECONNECT_DELAY_MS)
          return
        }

        setConnectionFailed(true)
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    setTickers({})
    setConnectionFailed(false)
    connect()

    return () => {
      closed = true
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer)
      }
      ws?.close()
      setIsConnected(false)
    }
  }, [marketsKey])

  const connectionState = useMemo(
    () =>
      resolveSectionConnectionState({
        isConnected,
        connectionFailed,
        tickers,
        markets,
        now,
      }),
    [isConnected, connectionFailed, tickers, markets, now],
  )

  const connectionLabel = formatConnectionStateLabel(connectionState)
  const hasSupportedMarkets = markets.length > 0

  const tickerRef = useRef(tickers)
  tickerRef.current = tickers

  function getTickerForMarket(market) {
    return tickerRef.current[market] ?? null
  }

  function getTickerForSymbol(symbol) {
    const market = mapSymbolToUpbitMarket(symbol)
    if (!market) return null
    return getTickerForMarket(market)
  }

  return {
    connectionState,
    connectionLabel,
    hasSupportedMarkets,
    isConnected,
    connectionFailed,
    getTickerForMarket,
    getTickerForSymbol,
    now,
  }
}
