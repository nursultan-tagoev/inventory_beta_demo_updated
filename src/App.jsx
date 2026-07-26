import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useAppData } from './lib/data'
import { Spin, ToastProvider } from './components/ui'
import Login from './components/Login'
import FirstPassword from './components/FirstPassword'
import Sidebar from './components/Sidebar'
import Notifications from './components/Notifications'
import Home from './screens/Home'
import Items from './screens/Items'
import Catalog from './screens/Catalog'
import Movements from './screens/Movements'
import Recipients from './screens/Recipients'
import Reports from './screens/Reports'
import Acts from './screens/Acts'
import Settings from './screens/Settings'
import Requests from './screens/Requests'
import Lucy from './screens/Lucy'
import Stub from './screens/Stub'

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidUpdate(prev) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }) }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 40, maxWidth: 640, margin: '0 auto' }}>
        <div className="card" style={{ padding: 24 }}>
          <div className="ff" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--rd-m)' }}>Ошибка на этом экране</div>
          <div style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 12 }}>{String(this.state.err?.message || this.state.err)}</div>
          <button onClick={() => this.setState({ err: null })} style={{ padding: '8px 14px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600 }}>Повторить</button>
        </div>
      </div>
    )
    return this.props.children
  }
}

const ROLE_VIEWS = {
  admin: ['home', 'items', 'movements', 'requests', 'acts', 'lucy', 'recipients', 'reports', 'settings'],
  manager: ['home', 'catalog', 'movements', 'requests', 'acts', 'lucy'],
  director: ['home', 'items', 'movements', 'requests', 'acts', 'reports'],
  employee: ['home', 'catalog', 'movements', 'requests', 'lucy'],
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [view, setView] = useState('home')
  const [assistAuto, setAssistAuto] = useState(false)
  const [draftItems, setDraftItems] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null))
    // Обновляем только при реальной смене пользователя — иначе лишние перерисовки
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession((prev) => {
        const a = prev?.user?.id || null, b = s?.user?.id || null
        return a === b ? prev : (s || null)
      })
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data || { id: session.user.id, email: session.user.email, role: 'employee' }))
  }, [session])

  const data = useAppData(profile)
  const logout = async () => { await supabase.auth.signOut(); setView('home') }

  const role = profile?.role
  const can = (k) => {
    if (role === 'admin') return true
    if (k === 'admin') return false
    if (k === 'move' || k === 'edit') return role === 'manager'
    return false
  }

  if (session === undefined) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}><Spin s={28} /></div>
  if (!session) return <Login />
  if (!profile) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}><Spin s={28} /></div>
  // Отключённого не пускаем, даже если сессия ещё жива
  if (profile.is_active === false) return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 20 }}>
      <div className="card" style={{ maxWidth: 380, padding: 26, textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 10 }}>🔒</div>
        <div className="ff" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Доступ отключён</div>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 16 }}>Обратитесь к администратору склада.</div>
        <button onClick={logout} style={{ padding: '10px 16px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600 }}>Выйти</button>
      </div>
    </div>
  )
  if (profile.must_change_password) return (
    <ToastProvider>
      <FirstPassword profile={profile} onDone={() => setProfile((p) => ({ ...p, must_change_password: false }))} />
    </ToastProvider>
  )

  const allowed = ROLE_VIEWS[role] || ROLE_VIEWS.employee
  const safeView = allowed.includes(view) ? view : 'home'

  const SCREENS = {
    home: <Home data={data} profile={profile} can={can} setView={setView} />,
    items: <Items data={data} can={can} profile={profile} />,
    catalog: <Catalog data={data} profile={profile} onRequest={(draft) => { setDraftItems(draft); setView('requests') }} />,
    movements: <Movements data={data} profile={profile} can={can} />,
    recipients: <Recipients data={data} can={can} />,
    reports: <Reports data={data} />,
    acts: <Acts data={data} profile={profile} />,
    settings: <Settings data={data} />,
    requests: <Requests data={data} profile={profile} can={can} draftItems={draftItems} onDraftUsed={() => setDraftItems(null)} />,
    lucy: <Lucy data={data} profile={profile} can={can} setView={setView} autostart={assistAuto} onAutostart={() => setAssistAuto(false)} />,
  }

  return (
    <ToastProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar view={safeView} setView={setView} profile={profile} onLogout={logout} branchName={(data.branches || []).find((b) => b.id === profile?.branch_id)?.name} badges={{ requests: (data.requests || []).filter((r) => r.status === 'new' && (role === 'admin' || r.author_id === profile.id)).length }} />
        <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <div className="top-bar" style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--brd)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || profile?.email}</div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                {({ admin: 'склад', manager: 'руководитель филиала', employee: 'специалист', director: 'директор' })[role] || role}
                {profile?.branch_id ? ' · ' + ((data.branches || []).find((b) => b.id === profile.branch_id)?.name || '') : ''}
              </div>
            </div>
            <Notifications profile={profile} onOpen={(n) => { if (n.entity === 'request') setView('requests'); if (n.entity === 'act') setView('acts') }} />
          </div>
          {data.loading && <div style={{ position: 'absolute', top: 14, right: 18, zIndex: 5 }}><Spin s={18} /></div>}
          {data.error && <div style={{ padding: '10px 24px', background: 'var(--am-l)', color: 'var(--am-m)', fontSize: 12.5, borderBottom: '1px solid var(--am)' }}>Доступ к данным закрыт: {data.error}. Проверьте, что выполнены RLS-политики.</div>}
          <ErrorBoundary k={safeView}>{SCREENS[safeView]}</ErrorBoundary>
        </main>
        {safeView !== 'lucy' && (
          <button onClick={() => { setAssistAuto(true); setView('lucy') }} title="Люси" className="lucy-fab"
            style={{ position: 'fixed', right: 26, bottom: 26, zIndex: 70, width: 58, height: 58, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'linear-gradient(150deg,var(--ink),var(--pu))', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 8px 24px color-mix(in srgb,var(--ink) 45%,transparent),0 2px 6px rgba(0,0,0,.2)' }}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3ZM6 11a6 6 0 0 0 12 0M12 19v3" /></svg>
          </button>
        )}
      </div>
    </ToastProvider>
  )
}
