import { useEffect } from 'react'
import { APP_AREAS, TRADING_PAGES } from '../../utils/appRoutes.js'
import TradingHome from './TradingHome.jsx'

export default function TradingArea({ tradingPage, onNavigate }) {
  useEffect(() => {
    if (tradingPage !== TRADING_PAGES.HOME) {
      onNavigate({ area: APP_AREAS.TRADING, tradingPage: TRADING_PAGES.HOME })
    }
  }, [tradingPage, onNavigate])

  return <TradingHome />
}
