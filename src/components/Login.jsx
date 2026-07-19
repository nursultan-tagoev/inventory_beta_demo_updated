import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Btn } from './ui'

const DOMAIN = '@inventory.kg'
const LAST_KEY = 'mkt_last_login'

export default function Login() {
  const [name, setName] = useState('')       // только имя, без домена
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [known, setKnown] = useState(null)   // { login, display } — если заходил раньше
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'light')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_KEY)
      if (raw) { const d = JSON.parse(raw); setKnown(d); setName(d.login || '') }
    } catch (e) {}
  }, [])

  const flip = () => {
    const n = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', n)
    try { localStorage.setItem('mkt_theme', n) } catch (e) {}
    setTheme(n)
  }

  const submit = async () => {
    const login = (name || '').trim().toLowerCase()
    if (!login || !pass) { setErr('Введите логин и пароль'); return }
    setErr(''); setLoading(true)
    const email = login.includes('@') ? login : login + DOMAIN
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
    setLoading(false)
    if (error) {
      setErr(error.message === 'Invalid login credentials'
        ? 'Неверный логин или пароль. Проверьте раскладку клавиатуры — логин набирается латиницей.'
        : error.message)
      return
    }
    // запоминаем для следующего входа
    try {
      const prof = await supabase.from('profiles').select('full_name').eq('id', data.user.id).single()
      const display = (prof.data?.full_name || '').split(' ')[0] || ''
      localStorage.setItem(LAST_KEY, JSON.stringify({ login, display }))
    } catch (e) {}
  }

  const other = () => { setKnown(null); setName(''); setPass(''); setErr('') }

  const feats = [
    ['📋', 'Заявки и согласование', 'var(--sec-req-l)'],
    ['📦', 'Остатки по складам', 'var(--sec-cat-l)'],
    ['🎙', 'Люси — заявка голосом', 'var(--sec-mov-l)'],
  ]

  const Field = ({ label, children }) => (
    <div style={{ marginBottom: 15 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em', color: 'var(--tx3)', marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Форма */}
      <div style={{ flex: '1.1 1 54%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 26px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 340, animation: 'fadeUp .35s ease' }}>

          {/* Логотип */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11 }} className="login-mark">
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(150deg,var(--ink),#9b7ae8)', display: 'grid', placeItems: 'center', fontSize: 20, boxShadow: '0 8px 20px color-mix(in srgb,var(--ink) 22%,transparent)' }}>📦</div>
            <div style={{ textAlign: 'center' }}>
              <div className="ff" style={{ fontSize: 15.5, lineHeight: 1.2 }}>Учёт и склад</div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 1 }}>отдел маркетинга</div>
            </div>
          </div>

          <div className="ff" style={{ fontSize: 22, textAlign: 'center', margin: '28px 0 5px', lineHeight: 1.3 }}>
            {known?.display ? <>С возвращением,<br />{known.display}</> : 'Здравствуйте'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--tx3)', textAlign: 'center', marginBottom: 24, lineHeight: 1.55 }}>
            {known?.display ? 'Рады видеть снова' : 'Войдите данными, которые выдал администратор'}
          </div>

          <Field label="Логин">
            <div style={{ display: 'flex', alignItems: 'stretch', border: '1.5px solid var(--brd)', borderRadius: 14, background: 'var(--sur)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', placeItems: 'center', paddingLeft: 14, color: 'var(--tx3)', fontSize: 15 }}>👤</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ваш логин"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                style={{ flex: 1, minWidth: 0, minHeight: 52, padding: '0 10px 0 11px', border: 'none', background: 'transparent', fontSize: 14, color: 'var(--tx)' }} />
              <div style={{ display: 'grid', placeItems: 'center', padding: '0 13px', background: 'var(--sur2)', borderLeft: '1px solid var(--brd)', fontSize: 12.5, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{DOMAIN}</div>
            </div>
          </Field>

          <Field label="Пароль">
            <div style={{ position: 'relative' }}>
              <input type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)}
                autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && submit()}
                style={{ width: '100%', minHeight: 52, padding: '0 46px 0 44px', border: '1.5px solid var(--brd)', borderRadius: 14, background: 'var(--sur)', fontSize: 14, color: 'var(--tx)' }} />
              <span style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: .5 }}>🔒</span>
              <button onClick={() => setShow(!show)} tabIndex={-1}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 14 }}>
                {show ? '🙈' : '👁'}
              </button>
            </div>
          </Field>

          {err && <div style={{ display: 'flex', gap: 9, padding: '11px 13px', background: 'var(--rd-l)', border: '1px solid var(--rd)', borderRadius: 12, fontSize: 11.5, color: 'var(--rd-m)', lineHeight: 1.6, marginBottom: 14 }}>
            <span style={{ flexShrink: 0 }}>⚠️</span><span>{err}</span>
          </div>}

          <Btn onClick={submit} loading={loading} size="lg" style={{ width: '100%', minHeight: 54, borderRadius: 15, marginTop: 4 }}>Войти</Btn>

          {known && <button onClick={other} style={{ width: '100%', textAlign: 'center', marginTop: 16, fontSize: 12.5, color: 'var(--ink)', minHeight: 38 }}>Войти под другим логином</button>}

          <div style={{ textAlign: 'center', marginTop: known ? 10 : 20, fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.65 }}>
            Забыли пароль?<br />Обратитесь к администратору
          </div>
        </div>
      </div>

      {/* Витрина */}
      <div className="login-showcase" style={{ flex: '1 1 46%', position: 'relative', background: 'linear-gradient(165deg,#F7EFE0,#F2EBF7 60%,#F9F0E4)', display: 'flex', alignItems: 'center', padding: '44px 40px' }}>
        <button onClick={flip} title="Тема"
          style={{ position: 'absolute', top: 22, right: 22, width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#96897A', fontSize: 15, background: 'rgba(255,255,255,.7)' }}>
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <div style={{ maxWidth: 300, animation: 'fadeUp .45s ease' }}>
          <div className="ff" style={{ fontSize: 25, lineHeight: 1.35, color: '#3D372F', marginBottom: 14 }}>
            Всё, что нужно складу —<br />в одном спокойном месте
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.75, color: '#96897A', marginBottom: 28 }}>
            Заявки с согласованием, остатки по складам, акты и подписи. Без лишней суеты.
          </div>
          {feats.map(([ico, txt, bg]) => (
            <div key={txt} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 13, color: '#3D372F' }}>
              <span style={{ width: 34, height: 34, borderRadius: 11, background: bg, display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0 }}>{ico}</span>
              {txt}
            </div>
          ))}
          <div style={{ marginTop: 24, paddingTop: 17, borderTop: '1px solid rgba(192,138,62,.22)', fontSize: 11.5, color: '#C08A3E' }}>
            Внутренняя система · отдел маркетинга
          </div>
        </div>
      </div>
    </div>
  )
}
