const NAV = [
  { id: 'home', label: 'Главная', icon: '◉', roles: ['admin', 'manager', 'employee', 'director'] },
  { id: 'items', label: 'Товары', icon: '▤', roles: ['admin', 'manager', 'employee', 'director'] },
  { id: 'movements', label: 'Движения', icon: '⇅', roles: ['admin', 'manager', 'employee', 'director'] },
  { id: 'acts', label: 'Акты', icon: '🧾', roles: ['admin', 'manager', 'director'] },
  { id: 'lucy', label: 'Люси', icon: '🎙', roles: ['admin', 'manager', 'employee', 'director'] },
  { id: 'recipients', label: 'Получатели', icon: '☺', roles: ['admin', 'manager', 'director'] },
  { id: 'reports', label: 'Аналитика', icon: '▧', roles: ['admin', 'director'] },
  { id: 'settings', label: 'Справочники', icon: '⚙', roles: ['admin'] },
]

export default function Sidebar({ view, setView, profile, onLogout }) {
  const role = profile?.role || 'employee'
  const items = NAV.filter((n) => n.roles.includes(role))
  const toggleTheme = () => {
    const c = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', c)
    try { localStorage.setItem('mkt_theme', c) } catch (e) {}
  }
  return (
    <aside style={{ width: 232, flexShrink: 0, background: 'var(--nav)', display: 'flex', flexDirection: 'column', padding: '16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 16px' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(150deg,var(--ink),var(--pu))', display: 'grid', placeItems: 'center', fontSize: 17 }}>📦</div>
        <div><div className="ff" style={{ fontSize: 17, color: '#fff' }}>Система учёта</div><div style={{ fontSize: 10, color: 'var(--navm)' }}>и склада</div></div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {items.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)} style={{
            display: 'flex', alignItems: 'center', gap: 12, height: 42, padding: '0 12px', borderRadius: 10,
            color: view === n.id ? '#fff' : 'var(--navm)', background: view === n.id ? 'var(--nav3)' : 'transparent',
            fontSize: 13.5, fontWeight: view === n.id ? 600 : 500, textAlign: 'left', transition: 'all .15s',
          }}
            onMouseEnter={(e) => { if (view !== n.id) e.currentTarget.style.background = 'var(--nav2)' }}
            onMouseLeave={(e) => { if (view !== n.id) e.currentTarget.style.background = 'transparent' }}>
            <span style={{ width: 20, textAlign: 'center', fontSize: 15 }}>{n.icon}</span>{n.label}
          </button>
        ))}
      </nav>
      <div style={{ borderTop: '1px solid var(--nav2)', paddingTop: 10, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', marginBottom: 6 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--nav3)', display: 'grid', placeItems: 'center', fontSize: 12, color: '#fff', fontWeight: 600 }}>{(profile?.full_name || profile?.email || '?')[0]?.toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || profile?.email}</div>
            <div style={{ fontSize: 10.5, color: 'var(--navm)' }}>{{ admin: 'Администратор', manager: 'Менеджер', employee: 'Сотрудник', director: 'Руководитель' }[role]}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={toggleTheme} style={{ flex: 1, height: 32, borderRadius: 8, color: 'var(--navm)', fontSize: 12, background: 'var(--nav2)' }}>◐ Тема</button>
          <button onClick={onLogout} style={{ flex: 1, height: 32, borderRadius: 8, color: 'var(--navm)', fontSize: 12, background: 'var(--nav2)' }}>Выйти</button>
        </div>
      </div>
    </aside>
  )
}
