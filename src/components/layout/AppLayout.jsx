import AppSidebar from './AppSidebar.jsx'

export default function AppLayout({ activeArea, onNavigate, children }) {
  return (
    <div className="app-shell">
      <AppSidebar activeArea={activeArea} onNavigate={onNavigate} />
      <div className="app-shell__content">{children}</div>
    </div>
  )
}
