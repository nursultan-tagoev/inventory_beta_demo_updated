import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Field, Input } from './ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
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
    if (!email.trim() || !pass) { setErr('Введите email и пароль'); return }
    setErr(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    setLoading(false)
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Неверный email или пароль' : error.message)
  }

  const feats = [
    { i: '🎙', t: 'Люси — операции голосом' },
    { i: '📊', t: 'Аналитика по филиалам' },
    { i: '🧾', t: 'Акты и отчёты в пару кликов' },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ЛЕВАЯ ПАНЕЛЬ — форма */}
      <div style={{ flex: '1 1 54%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', background: 'var(--sur)' }}>
        <div style={{ width: '100%', maxWidth: 340, animation: 'fadeUp .35s ease' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 34 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: 'linear-gradient(150deg,var(--ink),var(--pu))', display: 'grid', placeItems: 'center', fontSize: 21, boxShadow: '0 8px 20px color-mix(in srgb,var(--ink) 32%,transparent)' }}>📦</div>
            <div>
              <div className="ff" style={{ fontSize: 17, lineHeight: 1.15, fontWeight: 600 }}>Система учёта</div>
              <div style={{ fontSize: 11, color: 'var(--tx3)' }}>и склада · маркетинг</div>
            </div>
          </div>

          <div className="ff" style={{ fontSize: 25, fontWeight: 600, marginBottom: 4 }}>С возвращением</div>
          <div style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 26 }}>Войдите, чтобы продолжить работу</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Email">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: .45 }}>✉</span>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@bank.kg" autoComplete="username"
                  onKeyDown={(e) => e.key === 'Enter' && submit()} style={{ paddingLeft: 38 }} />
              </div>
            </Field>

            <Field label="Пароль">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: .45 }}>🔒</span>
                <Input type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password"
                  onKeyDown={(e) => e.key === 'Enter' && submit()} style={{ paddingLeft: 38, paddingRight: 44 }} />
                <button onClick={() => setShow(!show)} tabIndex={-1}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 14 }}>
                  {show ? '🙈' : '👁'}
                </button>
              </div>
            </Field>

            {err && <div style={{ padding: '9px 12px', background: 'var(--rd-l)', border: '1px solid var(--rd)', borderRadius: 10, fontSize: 12, color: 'var(--rd-m)' }}>{err}</div>}

            <Btn onClick={submit} loading={loading} size="lg" style={{ width: '100%', marginTop: 4 }}>Войти →</Btn>
          </div>

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12.5, color: 'var(--tx3)' }}>
            Забыли пароль? Обратитесь к администратору
          </div>
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ — витрина (скрывается на телефоне) */}
      <div className="login-showcase" style={{ flex: '1 1 46%', position: 'relative', background: 'linear-gradient(155deg,var(--ink),color-mix(in srgb,var(--pu) 70%,var(--ink)))', display: 'flex', alignItems: 'center', padding: '40px 44px', color: '#fff' }}>
        <button onClick={flip} title="Тема"
          style={{ position: 'absolute', top: 20, right: 20, width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.75)', fontSize: 16, background: 'rgba(255,255,255,.12)' }}>
          {theme === 'dark' ? '☀' : '☾'}
        </button>

        <div style={{ maxWidth: 320, animation: 'fadeUp .45s ease' }}>
          <div className="ff" style={{ fontSize: 27, lineHeight: 1.28, fontWeight: 600, marginBottom: 16 }}>
            Склад под контролем — от прихода до акта
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'rgba(255,255,255,.82)', marginBottom: 30 }}>
            Учёт по складам и филиалам, выдачи, возвраты, перемещения, акты и голосовой помощник Люси — в одном месте.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {feats.map((f) => (
              <div key={f.t} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13, color: 'rgba(255,255,255,.94)' }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,.15)', display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0 }}>{f.i}</span>
                {f.t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
