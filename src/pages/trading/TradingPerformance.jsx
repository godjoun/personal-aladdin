import TradingPageShell from './TradingPageShell.jsx'

export default function TradingPerformance({ onBack }) {
  return (
    <TradingPageShell title="성과" onBack={onBack}>
      <p className="trading__placeholder">분석할 거래 기록이 없습니다.</p>
    </TradingPageShell>
  )
}
