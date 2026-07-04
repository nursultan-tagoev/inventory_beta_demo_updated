import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Input, Select, useToast } from '../components/ui'

const TABS = [
  { id: 'categories', l: 'Категории', table: 'categories', fields: ['name'] },
  { id: 'product_types', l: 'Типы', table: 'product_types', fields: ['name'] },
  { id: 'directions', l: 'Направления', table: 'directions', fields: ['name'] },
  { id: 'suppliers', l: 'Поставщики', table: 'suppliers', fields: ['name', 'contact'] },
  { id: 'locations', l: 'Места', table: 'locations', fields: ['name'] },
  { id: 'branches', l: 'Филиалы', table: 'branches', fields: ['name', 'city'] },
]

export default function Settings({ data }) {
  const toast = useToast()
  const [tab, setTab] = useState('categories')
  const [nf, setNf] = useState({})
  const cur = TABS.find((t) => t.id === tab)
  const rows = data[{ categories: 'categories', product_types: 'productTypes', directions: 'directions', suppliers: 'suppliers', locations: 'locations', branches: 'branches' }[tab]] || []

  const add = async () => {
    if (!nf.name?.trim()) return toast('Название обязательно', 'error')
    const payload = {}; cur.fields.forEach((f) => { if (nf[f]) payload[f] = nf[f] })
    const { error } = await supabase.from(cur.table).insert(payload)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    setNf({}); toast('Добавлено'); data.reload()
  }
  const del = async (id) => {
    const { error } = await supabase.from(cur.table).delete().eq('id', id)
    if (error) return toast('Не удалось — запись используется', 'error')
    toast('Удалено'); data.reload()
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, animation: 'fadeUp .3s ease' }}>
      <div className="ff" style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Справочники</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((t) => <button key={t.id} onClick={() => { setTab(t.id); setNf({}) }} style={{ padding: '6px 14px', borderRadius: 9, border: `1px solid ${tab === t.id ? 'var(--ink)' : 'var(--brd)'}`, fontSize: 12.5, fontWeight: tab === t.id ? 600 : 400, background: tab === t.id ? 'var(--ink-l)' : 'var(--sur)', color: tab === t.id ? 'var(--ink)' : 'var(--tx2)' }}>{t.l}</button>)}
      </div>
      <div className="card" style={{ padding: 16, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {cur.fields.map((f) => <div key={f} style={{ flex: 1, minWidth: 140 }}><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{f === 'name' ? 'Название' : f === 'contact' ? 'Контакт' : f === 'city' ? 'Город' : f}</span><Input value={nf[f] || ''} onChange={(e) => setNf({ ...nf, [f]: e.target.value })} /></div>)}
        <Btn onClick={add}>Добавить</Btn>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {rows.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пусто.</div>}
        {rows.map((r, i) => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--brd)' : 'none' }}>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{r.name}{r.city ? `, ${r.city}` : ''}{r.contact ? ` · ${r.contact}` : ''}</span>
          <button onClick={() => del(r.id)} style={{ color: 'var(--tx3)', fontSize: 13, padding: '4px 8px' }}>Удалить</button>
        </div>)}
      </div>
    </div>
  )
}
