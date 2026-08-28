import TradingPageShell from './TradingPageShell.jsx'

export default function PaperTrading({ onBack }) {
  return (
    <TradingPageShell title="모의투자" onBack={onBack}>
      <p className="trading__placeholder">아직 모의투자가 시작되지 않았습니다.</p>
    </TradingPageShell>
  )
}
