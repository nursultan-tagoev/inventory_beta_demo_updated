import { useState } from 'react'
const I = {
  home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
  catalog: <path d="M3 6h18M3 12h18M3 18h18" />,
  items: <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9ZM12 12l8.5-4.5M12 12v9M12 12 3.5 7.5" />,
  movements: <path d="M7 4v12m0 0-3-3m3 3 3-3M17 20V8m0 0 3 3m-3-3-3 3" />,
  acts: <path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5" />,
  lucy: <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3ZM6 11a6 6 0 0 0 12 0M12 19v3" />,
  recipients: <path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
  reports: <path d="M4 20h16M7 20V10M12 20V4M17 20v-7" />,
  requests: <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />,
}
const Ico = ({ k, s = 18 }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{I[k]}</svg>
)

// Блок 1: показываем только готовые разделы. Остальные включаются в своих блоках.
/* Что выносим в нижнее меню телефона: то, чем пользуются каждый день */
const MAIN = {
  admin:    ['home', 'requests', 'movements', 'items'],
  manager:  ['home', 'requests', 'movements', 'reports'],
  employee: ['home', 'requests', 'catalog', 'movements'],
  director: ['home', 'reports', 'movements', 'requests'],
}

const NAV = [
  { id: 'home', label: 'Главная', roles: ['admin', 'manager', 'employee', 'director'] },
  { id: 'catalog', label: 'Каталог', roles: ['manager', 'employee'] },
  { id: 'items', label: 'Товары', roles: ['admin', 'director'] },
  { id: 'movements', label: 'Движения', roles: ['admin', 'manager', 'employee', 'director'] },
  { id: 'requests', label: 'Заявки', roles: ['admin', 'manager', 'employee', 'director'] },
  { id: 'acts', label: 'Акты', roles: ['admin', 'manager', 'director'] },
  { id: 'inventory', label: 'Инвентаризация', roles: ['admin', 'director'] },
  { id: 'reports', label: 'Аналитика', roles: ['admin', 'director', 'manager'] },
  { id: 'lucy', label: 'Люси', roles: ['admin', 'manager', 'employee', 'director'] },
  { id: 'settings', label: 'Справочники', roles: ['admin'] },
  // Блок 2: { id: 'requests', label: 'Заявки' }, { id: 'acts', label: 'Акты' }, { id: 'recipients', label: 'Получатели' }
  // Блок 3: { id: 'reports', label: 'Аналитика' }, { id: 'inventory', label: 'Инвентаризация' }
]
import { Sheet } from './ui'

const ROLE_RU = { admin: 'Администратор', manager: 'Менеджер', employee: 'Сотрудник', director: 'Директор' }

export default function Sidebar({ view, setView, profile, onLogout, badges = {}, branchName, onTour }) {
  const [more, setMore] = useState(false)
  const role = profile?.role || 'employee'
  const items = NAV.filter((n) => n.roles.includes(role))
  // Четвёрка для нижнего меню и всё остальное — в «Ещё»
  const mainIds = MAIN[role] || MAIN.employee
  const mainItems = mainIds.map((id) => items.find((n) => n.id === id)).filter(Boolean)
  const restItems = items.filter((n) => !mainIds.includes(n.id))
  const restBadge = restItems.reduce((a, n) => a + (badges[n.id] || 0), 0)
  const toggleTheme = () => {
    const c = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', c)
    try { localStorage.setItem('mkt_theme', c) } catch (e) {}
  }

  return (
    <>
      {/* Десктоп — боковое меню */}
      <aside className="side-nav" style={{ width: 226, flexShrink: 0, background: 'var(--nav)', display: 'flex', flexDirection: 'column', padding: '16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 18px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(150deg,var(--ink),var(--pu))', display: 'grid', placeItems: 'center', fontSize: 17 }}>📦</div>
          <div>
            <div className="ff" style={{ fontSize: 16, color: '#fff', lineHeight: 1.1 }}>Учёт склада</div>
            <div style={{ fontSize: 10, color: 'var(--navm)' }}>маркетинг</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {items.map((n) => (
            <button key={n.id} data-tour={'nav-' + n.id} onClick={() => setView(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 12px', borderRadius: 10,
              color: view === n.id ? '#fff' : 'var(--navm)', background: view === n.id ? 'var(--nav3)' : 'transparent',
              fontSize: 13.5, fontWeight: view === n.id ? 600 : 500, textAlign: 'left', transition: 'all .15s',
            }}
              onMouseEnter={(e) => { if (view !== n.id) e.currentTarget.style.background = 'var(--nav2)' }}
              onMouseLeave={(e) => { if (view !== n.id) e.currentTarget.style.background = 'transparent' }}>
              <Ico k={n.id} />{n.label}
              {badges[n.id] > 0 && <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{badges[n.id]}</span>}
            </button>
          ))}
        </nav>

        <div style={{ borderTop: '1px solid var(--nav2)', paddingTop: 10, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--ink)', display: 'grid', placeItems: 'center', fontSize: 12, color: '#fff', fontWeight: 600 }}>
              {(profile?.full_name || profile?.email || '?')[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || profile?.email}</div>
              <div style={{ fontSize: 10.5, color: 'var(--navm)' }}>{ROLE_RU[role]}{branchName ? ' · ' + branchName : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={toggleTheme} style={{ flex: 1, height: 32, borderRadius: 8, color: 'var(--navm)', fontSize: 12, background: 'var(--nav2)' }}>◐ Тема</button>
            <button onClick={onTour} title="Пройти обучение заново" style={{ height: 32, padding: '0 10px', borderRadius: 8, color: 'var(--navm)', fontSize: 12, background: 'var(--nav2)' }}>Обучение</button>
            <button onClick={onLogout} style={{ flex: 1, height: 32, borderRadius: 8, color: 'var(--navm)', fontSize: 12, background: 'var(--nav2)' }}>Выйти</button>
          </div>
        </div>
      </aside>

      {/* Телефон — нижнее меню: четыре главных плюс «Ещё» */}
      <nav className="bottom-nav">
        {mainItems.map((n) => (
          <button key={n.id} data-tour={'mnav-' + n.id} onClick={() => setView(n.id)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 2px', color: view === n.id ? 'var(--ink)' : 'var(--tx3)' }}>
            <div style={{ position: 'relative' }}><Ico k={n.id} s={21} />{badges[n.id] > 0 && <span style={{ position: 'absolute', top: -4, right: -8, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 8, background: 'var(--ink)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{badges[n.id]}</span>}</div>
            <span style={{ fontSize: 9.5, fontWeight: view === n.id ? 600 : 500 }}>{n.label}</span>
          </button>
        ))}
        <button onClick={() => setMore(true)} data-tour="mnav-more"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 2px', color: more ? 'var(--ink)' : 'var(--tx3)' }}>
          <div style={{ position: 'relative', width: 21, height: 21, display: 'grid', placeItems: 'center' }}>
            <span style={{ fontSize: 17, lineHeight: 1 }}>⋯</span>
            {restBadge > 0 && <span style={{ position: 'absolute', top: -4, right: -8, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 8, background: 'var(--ink)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{restBadge}</span>}
          </div>
          <span style={{ fontSize: 9.5, fontWeight: more ? 600 : 500 }}>Ещё</span>
        </button>
      </nav>

      {/* Шторка «Ещё»: остальные разделы и профиль */}
      <Sheet open={more} onClose={() => setMore(false)} title="Ещё">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {restItems.length > 0 && (
            <div style={{ border: '1px solid var(--brd)', borderRadius: 12, overflow: 'hidden' }}>
              {restItems.map((n, i) => (
                <button key={n.id} onClick={() => { setView(n.id); setMore(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', minHeight: 52,
                    borderTop: i ? '1px solid var(--brd)' : 'none', color: view === n.id ? 'var(--ink)' : 'var(--tx)', textAlign: 'left' }}>
                  <Ico k={n.id} s={20} />
                  <span style={{ fontSize: 14, fontWeight: view === n.id ? 600 : 500, flex: 1 }}>{n.label}</span>
                  {badges[n.id] > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{badges[n.id]}</span>}
                  <span style={{ color: 'var(--tx3)', fontSize: 16 }}>›</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ padding: '13px 14px', border: '1px solid var(--brd)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{profile?.full_name || profile?.email}</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
              {ROLE_RU[profile?.role] || profile?.role}{branchName ? ' · ' + branchName : ''}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={toggleTheme} style={{ flex: 1, minWidth: 100, minHeight: 46, borderRadius: 11, background: 'var(--sur2)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>◐ Тема</button>
            <button onClick={() => { setMore(false); onTour && onTour() }} style={{ flex: 1, minWidth: 100, minHeight: 46, borderRadius: 11, background: 'var(--sur2)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>Обучение</button>
          </div>
          <button onClick={onLogout} style={{ width: '100%', minHeight: 48, borderRadius: 11, background: 'var(--rd-l)', color: 'var(--rd-m)', fontSize: 13.5, fontWeight: 600 }}>Выйти из аккаунта</button>
        </div>
      </Sheet>
    </>
  )
}
