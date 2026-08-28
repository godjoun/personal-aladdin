import '../../styles/Trading.css'

export default function TradingPageShell({ title, onBack, children }) {
  return (
    <div className="trading trading--subpage" aria-label={title}>
      <header className="trading__header">
        <button type="button" className="trading__back" onClick={onBack}>
          ← TRADING
        </button>
        <h1 className="trading__title">{title}</h1>
      </header>
      <section className="trading__panel">{children}</section>
    </div>
  )
}
