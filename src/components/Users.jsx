import { useState } from 'react'
import { Btn, Input, Select, Field, useToast, Confirm } from './ui'
import { createUser, resetPassword, setActive, loginPreview } from '../lib/users'

const ROLE = { admin: 'Суперадминистратор', warehouse: 'Администратор склада', manager: 'Руководитель филиала', employee: 'Специалист', director: 'Директор' }
const RC = { admin: ['#F3E4E4', '#8B2F2F'], warehouse: ['var(--pu-l)', 'var(--pu)'], director: ['var(--am-l)', 'var(--am-m)'], manager: ['#E3F0FB', '#1D5FA8'], employee: ['var(--gr-l)', 'var(--gr-m)'] }

/* Карточка с логином и паролем — показывается один раз после создания или сброса */
function Credentials({ login, password, onClose }) {
  const toast = useToast()
  const copy = () => {
    const text = `Логин: ${login}\nПароль: ${password}`
    navigator.clipboard?.writeText(text).then(() => toast('Скопировано'), () => toast('Не удалось скопировать', 'warn'))
  }
  return (
    <div style={{ padding: '14px 15px', background: 'var(--gr-l)', border: '1px solid var(--gr)', borderRadius: 12, marginBottom: 13 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gr-m)', marginBottom: 8 }}>Доступ создан — передайте его человеку</div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9.5, color: 'var(--tx3)', textTransform: 'uppercase' }}>Логин</div>
          <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{login}</div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, color: 'var(--tx3)', textTransform: 'uppercase' }}>Временный пароль</div>
          <div className="mono" style={{ fontSize: 14, fontWeight: 600, letterSpacing: '.06em' }}>{password}</div>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 10 }}>
        Пароль показывается только сейчас — потом его не восстановить, можно будет лишь выдать новый.
        При первом входе человек сменит его на свой.
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <Btn size="sm" onClick={copy} style={{ minHeight: 40 }}>Скопировать</Btn>
        <Btn size="sm" v="secondary" onClick={onClose} style={{ minHeight: 40 }}>Готово</Btn>
      </div>
    </div>
  )
}

export default function Users({ data }) {
  const toast = useToast()
  const { profiles, branches, invalidate } = data
  const [add, setAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cred, setCred] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [q, setQ] = useState('')
  const [f, setF] = useState({ full_name: '', role: 'employee', branch_id: '', manager_id: '', position: '' })

  const heads = (profiles || []).filter((p) => p.role === 'manager' && p.is_active !== false)
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const list = (profiles || [])
    .filter((p) => !q || (p.full_name + ' ' + (p.email || '')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.is_active === false) - (b.is_active === false) || (a.full_name || '').localeCompare(b.full_name || ''))

  const bName = (id) => (branches || []).find((b) => b.id === id)?.name || ''

  const submit = async () => {
    if (!f.full_name.trim()) return toast('Введите ФИО', 'error')
    if (['employee', 'manager'].includes(f.role) && !f.branch_id) return toast('Выберите филиал', 'error')
    if (f.role === 'employee' && !f.manager_id) {
      const br = (branches || []).find((b) => b.id == f.branch_id)
      if (!br?.head_id && !br?.deputy_id) return toast('У филиала нет руководителя — выберите его здесь, иначе заявку некому согласовать', 'error')
    }
    setBusy(true)
    const { data: d, error } = await createUser({
      full_name: f.full_name.trim(), role: f.role,
      branch_id: f.branch_id ? Number(f.branch_id) : null,
      manager_id: f.manager_id || null, position: f.position || null,
    })
    setBusy(false)
    if (error) return toast(typeof error === 'string' ? error : JSON.stringify(error), 'error')
    setCred({ login: d.email, password: d.password })
    setF({ full_name: '', role: 'employee', branch_id: '', manager_id: '', position: '' })
    setAdd(false); invalidate('profiles')
  }

  const doReset = async (p) => {
    const { data: d, error } = await resetPassword(p.id)
    if (error) return toast(typeof error === 'string' ? error : JSON.stringify(error), 'error')
    setCred({ login: p.email, password: d.password })
  }
  const doToggle = async (p) => {
    const { error } = await setActive(p.id, p.is_active === false)
    if (error) return toast(typeof error === 'string' ? error : JSON.stringify(error), 'error')
    toast(p.is_active === false ? 'Доступ включён' : 'Доступ отключён'); invalidate('profiles')
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 17, fontWeight: 600 }}>Пользователи</span>
        <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{list.filter((p) => p.is_active !== false).length} активных</span>
        {!add && <Btn size="sm" onClick={() => setAdd(true)} style={{ marginLeft: 'auto', minHeight: 40 }}>＋ Добавить</Btn>}
      </div>

      {cred && <Credentials login={cred.login} password={cred.password} onClose={() => setCred(null)} />}

      {add && (
        <div className="card" style={{ padding: 15, marginBottom: 13, display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Field label="ФИО">
            <Input value={f.full_name} onChange={(e) => up('full_name', e.target.value)} placeholder="Асанов Нурбек" />
          </Field>
          {f.full_name.trim() && (
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: -5 }}>
              Логин: <b className="mono" style={{ color: 'var(--tx)' }}>{loginPreview(f.full_name)}</b>
              <span style={{ color: 'var(--tx3)' }}>@inventory.kg</span>
            </div>
          )}
          <Field label="Роль">
            <Select value={f.role} onChange={(e) => up('role', e.target.value)}>
              {['warehouse', 'manager', 'employee', 'director'].map((v) => <option key={v} value={v}>{ROLE[v]}</option>)}
            </Select>
          </Field>
          {['employee', 'manager'].includes(f.role) && (
            <Field label="Филиал">
              <Select value={f.branch_id} onChange={(e) => up('branch_id', e.target.value)}>
                <option value="">— выберите —</option>
                {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          )}
          {f.role === 'employee' && (
            <Field label="Руководитель — он согласует заявки">
              <Select value={f.manager_id} onChange={(e) => up('manager_id', e.target.value)}>
                <option value="">— выберите —</option>
                {heads.filter((h) => !f.branch_id || h.branch_id == f.branch_id).map((h) => (
                  <option key={h.id} value={h.id}>{h.full_name || h.email}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Должность">
            <Input value={f.position} onChange={(e) => up('position', e.target.value)} placeholder="Специалист отдела маркетинга" />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={submit} loading={busy} style={{ flex: 1, minHeight: 46 }}>Создать доступ</Btn>
            <Btn v="secondary" onClick={() => setAdd(false)} style={{ minHeight: 46 }}>Отмена</Btn>
          </div>
        </div>
      )}

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по имени или логину" style={{ marginBottom: 11 }} />

      <div className="card" style={{ overflow: 'hidden' }}>
        {list.map((p, i) => {
          const off = p.is_active === false
          const [bg, fg] = RC[p.role] || ['var(--sur2)', 'var(--tx3)']
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: i < list.length - 1 ? '1px solid var(--brd)' : 'none', opacity: off ? .5 : 1 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: bg, color: fg, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {(p.full_name || p.email || '?').replace(/@.*$/, '').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.full_name || p.email}</span>
                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: bg, color: fg }}>{ROLE[p.role]}</span>
                  {off && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: 'var(--rd-l)', color: 'var(--rd-m)' }}>отключён</span>}
                  {p.must_change_password && !off && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: 'var(--am-l)', color: 'var(--am-m)' }}>не менял пароль</span>}
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                  {p.email}{p.branch_id ? ' · ' + bName(p.branch_id) : ''}
                </div>
              </div>
              <button onClick={() => setConfirm({ kind: 'reset', p })} title="Выдать новый пароль"
                style={{ fontSize: 11, color: 'var(--tx3)', minHeight: 38, padding: '0 8px' }}>Пароль</button>
              <button onClick={() => setConfirm({ kind: 'toggle', p })}
                style={{ fontSize: 11, color: off ? 'var(--gr-m)' : 'var(--rd-m)', minHeight: 38, padding: '0 8px' }}>
                {off ? 'Включить' : 'Отключить'}
              </button>
            </div>
          )
        })}
      </div>

      {confirm && <Confirm
        danger={confirm.kind === 'toggle' && confirm.p?.is_active !== false}
        title={confirm?.kind === 'reset' ? 'Выдать новый пароль?' : confirm?.p?.is_active === false ? 'Включить доступ?' : 'Отключить доступ?'}
        message={confirm?.kind === 'reset'
          ? `Старый пароль ${confirm?.p?.full_name || ''} перестанет работать сразу. Новый покажу один раз — передайте его лично.`
          : confirm?.p?.is_active === false
            ? 'Человек снова сможет войти со своим паролем.'
            : 'Войти будет нельзя, но все его заявки, движения и подписи в документах сохранятся.'}
        onCancel={() => setConfirm(null)}
        onOk={async () => { const c = confirm; setConfirm(null); if (c.kind === 'reset') await doReset(c.p); else await doToggle(c.p) }}
      />}
    </div>
  )
}
