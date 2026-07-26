import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useAppData } from './lib/data'
import { Spin, ToastProvider } from './components/ui'
import Login from './components/Login'
import FirstPassword from './components/FirstPassword'
import Tour from './components/Tour'
import Inventory from './screens/Inventory'
import InstallPrompt from './components/InstallPrompt'
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
  admin: ['home', 'items', 'movements', 'requests', 'acts', 'inventory', 'lucy', 'recipients', 'reports', 'settings'],
  manager: ['home', 'catalog', 'movements', 'requests', 'acts', 'reports', 'lucy'],
  director: ['home', 'items', 'movements', 'requests', 'acts', 'inventory', 'reports'],
  employee: ['home', 'catalog', 'movements', 'requests', 'lucy'],
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profErr, setProfErr] = useState(null)
  const [tour, setTour] = useState(false)
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
    if (!session) { setProfile(null); setProfErr(null); return }
    let alive = true
    // Профиль НИКОГДА не выдумываем: не прочитали — значит ошибка, а не «специалист».
    // Иначе сбой сети молча понижает админа в правах.
    const load = async (attempt = 0) => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      if (!alive) return
      if (data) { setProfile(data); setProfErr(null); return }
      if (attempt < 2) { setTimeout(() => load(attempt + 1), 700); return }
      setProfErr(error?.message || 'Профиль не найден в базе')
    }
    load()
    return () => { alive = false }
  }, [session])

  // Первый вход: показываем обучение один раз, после смены пароля
  useEffect(() => {
    if (profile && !profile.onboarded_at && !profile.must_change_password) setTour(true)
  }, [profile?.id, profile?.must_change_password, profile?.onboarded_at])

  const finishTour = async () => {
    setTour(false)
    if (profile && !profile.onboarded_at) {
      const at = new Date().toISOString()
      await supabase.from('profiles').update({ onboarded_at: at }).eq('id', profile.id)
      setProfile((p) => (p ? { ...p, onboarded_at: at } : p))
    }
  }

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
  if (profErr) return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 20 }}>
      <div className="card" style={{ maxWidth: 400, padding: 26, textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 10 }}>⚠️</div>
        <div className="ff" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Не удалось загрузить профиль</div>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 16 }}>
          Права не определены, поэтому вход остановлен. Проверьте связь и повторите.
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 16, wordBreak: 'break-word' }}>{profErr}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => { setProfErr(null); setSession((s) => (s ? { ...s } : s)) }}
            style={{ padding: '10px 16px', borderRadius: 9, background: 'var(--ink)', color: '#fff', fontWeight: 600 }}>Повторить</button>
          <button onClick={logout} style={{ padding: '10px 16px', borderRadius: 9, background: 'var(--sur2)', color: 'var(--tx2)', fontWeight: 600 }}>Выйти</button>
        </div>
      </div>
    </div>
  )
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
    reports: <Reports data={data} profile={profile} />,
    acts: <Acts data={data} profile={profile} />,
    settings: <Settings data={data} />,
    inventory: <Inventory data={data} profile={profile} />,
    requests: <Requests data={data} profile={profile} can={can} draftItems={draftItems} onDraftUsed={() => setDraftItems(null)} />,
    lucy: <Lucy data={data} profile={profile} can={can} setView={setView} autostart={assistAuto} onAutostart={() => setAssistAuto(false)} />,
  }

  return (
    <ToastProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar view={safeView} setView={setView} profile={profile} onLogout={logout} onTour={() => setTour(true)} branchName={(data.branches || []).find((b) => b.id === profile?.branch_id)?.name} badges={{ requests: (data.requests || []).filter((r) => r.status === 'new' && (role === 'admin' || r.author_id === profile.id)).length }} />
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
        <InstallPrompt />
        {tour && <Tour role={role} setView={setView} onClose={() => setTour(false)} onFinish={finishTour} />}
      </div>
    </ToastProvider>
  )
}
