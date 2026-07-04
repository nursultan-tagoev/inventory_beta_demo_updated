import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Field, Input, Select, useToast } from '../components/ui'

export default function Recipients({ data, can }) {
  const toast = useToast()
  const { recipients, branches, reload } = data
  const [f, setF] = useState({ name: '', branch_id: '' })
  const [loading, setLoading] = useState(false)
  const add = async () => {
    if (!f.name.trim()) return toast('Укажите имя', 'error')
    setLoading(true)
    const { error } = await supabase.from('recipients').insert({ name: f.name.trim(), branch_id: Number(f.branch_id) || null })
    setLoading(false)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    setF({ name: '', branch_id: '' }); toast('Добавлен'); reload()
  }
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 24, animation: 'fadeUp .3s ease' }}>
      <div className="ff" style={{ fontSize: 20, fontWeight: 600, marginBottom: 18 }}>Получатели</div>
      {can('edit') && <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <Field label="Имя"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Полное имя" /></Field>
          <Field label="Филиал"><Select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <Btn onClick={add} loading={loading}>Добавить</Btn>
        </div>
      </div>}
      <div className="card" style={{ overflow: 'hidden' }}>
        {recipients.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока никого. Добавьте людей, которым выдаёте товары.</div>}
        {recipients.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < recipients.length - 1 ? '1px solid var(--brd)' : 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gr)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 13 }}>{r.name[0]}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>{branches.find((b) => b.id === r.branch_id)?.name || '—'}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}
