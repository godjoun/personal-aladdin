import { APP_AREAS } from '../../utils/appRoutes.js'
import '../../styles/AppLayout.css'

const NAV_ITEMS = [
  { id: APP_AREAS.ASSETS, label: '자산', description: '투자 대시보드' },
  { id: APP_AREAS.TRADING, label: 'TRADING', description: '기록 · 연습 · 성과' },
]

export default function AppSidebar({ activeArea, onNavigate }) {
  return (
    <nav className="app-sidebar" aria-label="주요 메뉴">
      <div className="app-sidebar__brand">
        <p className="app-sidebar__logo">ALADDIN</p>
        <p className="app-sidebar__tagline">내 투자</p>
      </div>
      <ul className="app-sidebar__list">
        {NAV_ITEMS.map((item) => {
          const isActive = activeArea === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`app-sidebar__link${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate({ area: item.id })}
              >
                <span className="app-sidebar__link-label">{item.label}</span>
                <span className="app-sidebar__link-desc">{item.description}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
