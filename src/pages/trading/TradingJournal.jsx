import TradingPageShell from './TradingPageShell.jsx'

export default function TradingJournal({ onBack }) {
  return (
    <TradingPageShell title="매매일지" onBack={onBack}>
      <p className="trading__placeholder">아직 기록된 거래가 없습니다.</p>
    </TradingPageShell>
  )
}
