import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useAppData } from './lib/data'
import { Spin, ToastProvider } from './components/ui'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import Home from './screens/Home'
import Items from './screens/Items'
import Movements from './screens/Movements'
import Recipients from './screens/Recipients'
import Reports from './screens/Reports'
import Settings from './screens/Settings'
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
  admin: ['home', 'items', 'movements', 'lucy', 'recipients', 'reports', 'settings'],
  manager: ['home', 'items', 'movements', 'lucy', 'recipients'],
  director: ['home', 'items', 'movements', 'lucy', 'recipients', 'reports'],
  employee: ['home', 'items', 'movements', 'lucy'],
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [view, setView] = useState('home')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null))
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

  const allowed = ROLE_VIEWS[role] || ROLE_VIEWS.employee
  const safeView = allowed.includes(view) ? view : 'home'

  const SCREENS = {
    home: <Home data={data} profile={profile} can={can} />,
    items: <Items data={data} can={can} />,
    movements: <Movements data={data} profile={profile} can={can} />,
    recipients: <Recipients data={data} can={can} />,
    reports: <Reports data={data} />,
    settings: <Settings data={data} />,
    lucy: <Stub title="Люси — голосовой помощник" />,
  }

  return (
    <ToastProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar view={safeView} setView={setView} profile={profile} onLogout={logout} />
        <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {data.loading && <div style={{ position: 'absolute', top: 14, right: 18, zIndex: 5 }}><Spin s={18} /></div>}
          {data.error && <div style={{ padding: '10px 24px', background: 'var(--am-l)', color: 'var(--am-m)', fontSize: 12.5, borderBottom: '1px solid var(--am)' }}>Доступ к данным закрыт: {data.error}. Проверьте, что выполнены RLS-политики.</div>}
          <ErrorBoundary k={safeView}>{SCREENS[safeView]}</ErrorBoundary>
        </main>
      </div>
    </ToastProvider>
  )
}
