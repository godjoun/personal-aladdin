import { useEffect } from 'react'
import { APP_AREAS } from '../../utils/appRoutes.js'
import TradingLabHome from './TradingLabHome.jsx'

/**
 * Trading Lab 영역 진입점.
 * 현재는 단일 화면이므로 하위 페이지 라우팅은 두지 않는다.
 */
export default function TradingLabArea({ area, onNavigate }) {
  useEffect(() => {
    if (area !== APP_AREAS.TRADING_LAB) {
      onNavigate({ area: APP_AREAS.TRADING_LAB })
    }
  }, [area, onNavigate])

  return <TradingLabHome />
}
