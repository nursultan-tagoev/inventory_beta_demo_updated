import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Input, Select, useToast, Confirm } from '../components/ui'

const NAV = [
  { id: 'hier', l: 'Иерархия', ico: '🗂' },
  { id: 'warehouses', l: 'Склады', ico: '🏬' },
  { id: 'locations', l: 'Места хранения', ico: '📍' },
  { id: 'branches', l: 'Филиалы-адресаты', ico: '🗺' },
  { id: 'categories', l: 'Категории', ico: '🏷' },
  { id: 'suppliers', l: 'Поставщики', ico: '🚚' },
]

export default function Settings({ data }) {
  const toast = useToast()
  const [tab, setTab] = useState('hier')
  const { directions, productTypes, campaigns, warehouses, locations, branches, categories, suppliers, reload } = data

  const ins = async (table, row) => {
    const { error } = await supabase.from(table).insert(row)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    toast('Добавлено'); reload()
  }
  const del = async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return toast(error.message.includes('foreign key') ? 'Нельзя удалить — есть связанные записи. Переименуйте.' : 'Ошибка: ' + error.message, 'error')
    toast('Удалено'); reload()
  }
  const upd = async (table, id, patch) => {
    const { error } = await supabase.from(table).update(patch).eq('id', id)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    toast('Сохранено'); reload()
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 80px', animation: 'fadeUp .3s ease' }}>
      <div className="ff" style={{ fontSize: 21, fontWeight: 600, marginBottom: 16 }}>Справочники</div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Левое меню */}
        <div className="card" style={{ width: 200, padding: 8, flexShrink: 0 }}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 38, padding: '0 11px', borderRadius: 9,
              fontSize: 12.5, fontWeight: tab === n.id ? 600 : 500, textAlign: 'left',
              background: tab === n.id ? 'var(--ink-l)' : 'transparent', color: tab === n.id ? 'var(--ink)' : 'var(--tx2)',
            }}><span style={{ fontSize: 14 }}>{n.ico}</span>{n.l}</button>
          ))}
        </div>

        {/* Контент */}
        <div style={{ flex: 1, minWidth: 300 }}>
          {tab === 'hier' && <Hierarchy {...{ directions, productTypes, campaigns, ins, del }} />}
          {tab === 'warehouses' && <Simple title="Склады" hint="Где физически лежит товар и считается остаток." table="warehouses" rows={warehouses} cols={[['name', 'Название'], ['city', 'Город']]} ins={ins} del={del} upd={upd} />}
          {tab === 'locations' && <Places {...{ locations, warehouses, ins, del }} />}
          {tab === 'branches' && <Simple title="Филиалы-адресаты" hint="Куда выдаём товар. Город — для группировки в аналитике." table="branches" rows={branches} cols={[['name', 'Название'], ['city', 'Город']]} ins={ins} del={del} upd={upd} />}
          {tab === 'categories' && <Simple title="Категории" table="categories" rows={categories} cols={[['name', 'Название']]} ins={ins} del={del} upd={upd} />}
          {tab === 'suppliers' && <Simple title="Поставщики" table="suppliers" rows={suppliers} cols={[['name', 'Название']]} ins={ins} del={del} upd={upd} />}
        </div>
      </div>
    </div>
  )
}

/* ── Иерархия: Направление → Тип → Кампания ── */
function Hierarchy({ directions, productTypes, campaigns, ins, del }) {
  const [nd, setNd] = useState('')
  const [nt, setNt] = useState({})   // { [dirId]: name }
  const [nc, setNc] = useState({})   // { [typeId]: name }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>Иерархия классификатора</div>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>Направление → Тип → Кампания. Товар относится к кампании.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input value={nd} onChange={(e) => setNd(e.target.value)} placeholder="Новое направление (Розница, Корпоратив…)" style={{ flex: 1 }} />
          <Btn onClick={() => { if (nd.trim()) { ins('directions', { name: nd.trim() }); setNd('') } }}>＋ Направление</Btn>
        </div>
      </div>

      {directions.length === 0 && <div className="card" style={{ padding: 34, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Начните с направления — например «Розница».</div>}

      {directions.map((d) => {
        const types = productTypes.filter((t) => t.direction_id === d.id)
        return (
          <div key={d.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 15 }}>💼</span>
              <b style={{ fontSize: 14 }}>{d.name}</b>
              <span style={{ fontSize: 10, color: 'var(--tx3)', background: 'var(--ink-l)', color: 'var(--ink)', padding: '2px 7px', borderRadius: 6 }}>направление</span>
              <button onClick={() => del('directions', d.id)} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>удалить</button>
            </div>

            {types.map((t) => {
              const camps = campaigns.filter((c) => c.product_type_id === t.id)
              return (
                <div key={t.id} style={{ marginLeft: 12, paddingLeft: 12, borderLeft: '2px solid var(--brd)', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>🚩</span>
                    <b style={{ fontSize: 13 }}>{t.name}</b>
                    <span style={{ fontSize: 10, color: 'var(--tx3)' }}>тип</span>
                    <button onClick={() => del('product_types', t.id)} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>×</button>
                  </div>

                  {camps.map((c) => (
                    <div key={c.id} style={{ marginLeft: 12, paddingLeft: 12, borderLeft: '2px solid var(--brd)', display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0 4px 12px', fontSize: 12.5 }}>
                      <span style={{ fontSize: 12 }}>🏷</span>{c.name}
                      <span style={{ fontSize: 10, color: 'var(--tx3)' }}>кампания</span>
                      <button onClick={() => del('campaigns', c.id)} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>×</button>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 6, marginLeft: 12, marginTop: 6 }}>
                    <Input value={nc[t.id] || ''} onChange={(e) => setNc({ ...nc, [t.id]: e.target.value })} placeholder="Кампания (UFC, Новый год…)" style={{ height: 34, fontSize: 12.5, flex: 1 }} />
                    <Btn size="sm" v="secondary" onClick={() => { const v = (nc[t.id] || '').trim(); if (v) { ins('campaigns', { name: v, product_type_id: t.id }); setNc({ ...nc, [t.id]: '' }) } }}>＋</Btn>
                  </div>
                </div>
              )
            })}

            <div style={{ display: 'flex', gap: 6, marginLeft: 12, marginTop: 8 }}>
              <Input value={nt[d.id] || ''} onChange={(e) => setNt({ ...nt, [d.id]: e.target.value })} placeholder="Тип (Акции, Брендинг…)" style={{ height: 34, fontSize: 12.5, flex: 1 }} />
              <Btn size="sm" v="secondary" onClick={() => { const v = (nt[d.id] || '').trim(); if (v) { ins('product_types', { name: v, direction_id: d.id }); setNt({ ...nt, [d.id]: '' }) } }}>＋ Тип</Btn>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Места хранения (привязаны к складу) ── */
function Places({ locations, warehouses, ins, del }) {
  const [f, setF] = useState({ name: '', warehouse_id: '' })
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || '—'
  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>Места хранения</div>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>Полки и комнаты внутри склада — подсказка «где лежит».</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Стеллаж А-3" style={{ flex: 1, minWidth: 140 }} />
          <Select value={f.warehouse_id} onChange={(e) => setF({ ...f, warehouse_id: e.target.value })} style={{ width: 150 }}>
            <option value="">Склад…</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Btn onClick={() => { if (f.name.trim() && f.warehouse_id) { ins('locations', { name: f.name.trim(), warehouse_id: Number(f.warehouse_id) }); setF({ name: '', warehouse_id: '' }) } }}>＋ Добавить</Btn>
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {locations.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пусто.</div>}
        {locations.map((l, i) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: i < locations.length - 1 ? '1px solid var(--brd)' : 'none', fontSize: 13 }}>
            <span style={{ flex: 1, fontWeight: 500 }}>{l.name}</span>
            <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>склад {whName(l.warehouse_id)}</span>
            <button onClick={() => del('locations', l.id)} style={{ fontSize: 11, color: 'var(--tx3)' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Простой справочник ── */
function Simple({ title, hint, table, rows, cols, ins, del, upd }) {
  const [f, setF] = useState({})
  const [edit, setEdit] = useState(null)
  const add = () => {
    const row = {}
    for (const [k] of cols) { const v = (f[k] || '').trim(); if (v) row[k] = v }
    if (!row[cols[0][0]]) return
    ins(table, row); setF({})
  }
  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{title}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>{hint}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {cols.map(([k, l]) => (
            <Input key={k} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={l} style={{ flex: 1, minWidth: 130 }} />
          ))}
          <Btn onClick={add}>＋ Добавить</Btn>
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {rows.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пусто.</div>}
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--brd)' : 'none', fontSize: 13 }}>
            {edit && edit.id === r.id ? <>
              {cols.map(([k, l]) => (
                <Input key={k} value={edit[k] || ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} placeholder={l} style={{ flex: 1, height: 34 }} />
              ))}
              <Btn size="sm" onClick={() => { const patch = {}; cols.forEach(([k]) => { patch[k] = (edit[k] || '').trim() || null }); upd(table, r.id, patch); setEdit(null) }}>✓</Btn>
              <Btn size="sm" v="secondary" onClick={() => setEdit(null)}>×</Btn>
            </> : <>
              <span style={{ flex: 1, fontWeight: 500 }}>{r.name}</span>
              {r.city && <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{r.city}</span>}
              {upd && <button onClick={() => setEdit({ id: r.id, ...Object.fromEntries(cols.map(([k]) => [k, r[k] || ''])) })} style={{ fontSize: 13, color: 'var(--ink)', padding: '0 5px' }}>✎</button>}
              <button onClick={() => del(table, r.id)} style={{ fontSize: 13, color: 'var(--tx3)', padding: '0 5px' }}>×</button>
            </>}
          </div>
        ))}
      </div>
    </div>
  )
}
