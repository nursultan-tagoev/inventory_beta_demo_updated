import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Field, Input } from './ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'light')

  const flip = () => {
    const n = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', n)
    try { localStorage.setItem('mkt_theme', n) } catch (e) {}
    setTheme(n)
  }

  const submit = async () => {
    setErr(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    setLoading(false)
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Неверный email или пароль' : error.message)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '18px 20px' }}>
        <button onClick={flip} style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', color: 'var(--tx2)', fontSize: 17, border: '1px solid var(--brd)', background: 'var(--sur)' }}>{theme === 'dark' ? '☀' : '☾'}</button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px 8vh' }}>
        <div style={{ width: '100%', maxWidth: 384, animation: 'fadeUp .3s ease' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 30 }}>
            <div style={{ width: 54, height: 54, borderRadius: 15, background: 'linear-gradient(150deg,var(--ink),var(--pu))', display: 'grid', placeItems: 'center', fontSize: 26, boxShadow: '0 8px 22px color-mix(in srgb,var(--ink) 36%,transparent)', marginBottom: 16 }}>📦</div>
            <div className="ff" style={{ fontSize: 27, lineHeight: 1.05, textAlign: 'center' }}>Система учёта<br />и склада</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@bank.kg" onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
            <Field label="Пароль"><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
            {err && <div style={{ padding: '9px 12px', background: 'var(--rd-l)', border: '1px solid var(--rd)', borderRadius: 10, fontSize: 12, color: 'var(--rd-m)' }}>{err}</div>}
            <Btn onClick={submit} loading={loading} size="lg" style={{ width: '100%', marginTop: 4 }}>Войти</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
