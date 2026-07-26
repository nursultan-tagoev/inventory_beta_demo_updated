import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, useToast } from './ui'
import { changeOwnPassword } from '../lib/users'

/* Первый вход: временный пароль выдал админ — человек заменяет его на свой.
   Восстановления по почте нет (адреса служебные), поэтому предупреждаем честно. */
export default function FirstPassword({ profile, onDone }) {
  const toast = useToast()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const weak = p1.length > 0 && p1.length < 8
  const mismatch = p2.length > 0 && p1 !== p2

  const submit = async () => {
    if (p1.length < 8) return toast('Пароль не короче 8 символов', 'error')
    if (p1 !== p2) return toast('Пароли не совпадают', 'error')
    setBusy(true)
    const { error } = await changeOwnPassword(p1)
    setBusy(false)
    if (error) return toast(error, 'error')
    toast('Пароль сохранён')
    onDone()
  }

  const inp = {
    width: '100%', minHeight: 50, padding: '0 14px', border: '1.5px solid var(--brd)',
    borderRadius: 12, background: 'var(--sur)', fontSize: 14, color: 'var(--tx)',
  }
  const name = (profile?.full_name || profile?.email || '').replace(/@.*$/, '').split(' ')[0]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 26, animation: 'fadeUp .3s ease' }}>
        <div className="ff" style={{ fontSize: 21, fontWeight: 600, marginBottom: 6 }}>Придумайте пароль</div>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 18 }}>
          {name ? name + ', в' : 'В'}ы вошли с временным паролем. Замените его на свой — временный перестанет работать.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div>
            <input type={show ? 'text' : 'password'} value={p1} onChange={(e) => setP1(e.target.value)}
              placeholder="Новый пароль" autoFocus style={{ ...inp, borderColor: weak ? 'var(--am)' : 'var(--brd)' }} />
            {weak && <div style={{ fontSize: 11, color: 'var(--am-m)', marginTop: 5 }}>Нужно хотя бы 8 символов</div>}
          </div>
          <div>
            <input type={show ? 'text' : 'password'} value={p2} onChange={(e) => setP2(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder="Ещё раз" style={{ ...inp, borderColor: mismatch ? 'var(--rd)' : 'var(--brd)' }} />
            {mismatch && <div style={{ fontSize: 11, color: 'var(--rd-m)', marginTop: 5 }}>Пароли не совпадают</div>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--tx3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Показать пароль
          </label>
        </div>

        <div style={{ padding: '11px 13px', background: 'var(--am-l)', borderRadius: 11, fontSize: 11.5, color: 'var(--am-m)', lineHeight: 1.55, margin: '14px 0' }}>
          Запомните его. Почта здесь служебная, писем система не шлёт — если забудете, новый пароль сможет выдать только администратор склада.
        </div>

        <Btn onClick={submit} loading={busy} size="lg" style={{ width: '100%', minHeight: 50 }}>Сохранить и войти</Btn>
        <button onClick={() => supabase.auth.signOut()}
          style={{ width: '100%', marginTop: 10, minHeight: 40, fontSize: 12, color: 'var(--tx3)', background: 'transparent' }}>
          Выйти
        </button>
      </div>
    </div>
  )
}
