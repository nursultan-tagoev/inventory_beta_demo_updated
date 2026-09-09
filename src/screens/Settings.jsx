import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Input, Select, Field, Badge, useToast, Confirm } from '../components/ui'
import Suppliers from '../components/Suppliers'
import Users from '../components/Users'

const NAV = [
  { id: 'hier', l: 'Иерархия', ico: '🗂' },
  { id: 'warehouses', l: 'Склады', ico: '🏬', super: true },
  { id: 'locations', l: 'Места хранения', ico: '📍' },
  { id: 'branches', l: 'Филиалы', ico: '🗺', super: true },
  { id: 'categories', l: 'Категории', ico: '🏷' },
  { id: 'suppliers', l: 'Поставщики', ico: '🚚' },
  { id: 'appr', l: 'Согласование', ico: '🧭', super: true },
  { id: 'users', l: 'Пользователи', ico: '👥', super: true },
]

export default function Settings({ data, profile }) {
  const isSuper = profile?.role === 'admin'   // структура и учётки — только суперадмину
  const navItems = NAV.filter((n) => isSuper || !n.super)
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

      <div className="side-wrap" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Меню: на ноутбуке сбоку, на телефоне лентой сверху */}
        <div className="card side-nav" style={{ width: 200, padding: 8, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          {navItems.map((n) => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 38, padding: '0 11px', borderRadius: 9,
              fontSize: 12.5, fontWeight: tab === n.id ? 600 : 500, textAlign: 'left',
              background: tab === n.id ? 'var(--ink-l)' : 'transparent', color: tab === n.id ? 'var(--ink)' : 'var(--tx2)',
            }}><span style={{ fontSize: 14 }}>{n.ico}</span>{n.l}</button>
          ))}
        </div>

        {/* Контент */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          {tab === 'hier' && <Hierarchy {...{ directions, productTypes, campaigns, ins, del }} />}
          {tab === 'warehouses' && <Simple title="Склады" hint="Где физически лежит товар и считается остаток." table="warehouses" rows={warehouses} cols={[['name', 'Название'], ['city', 'Город']]} ins={ins} del={del} upd={upd} />}
          {tab === 'locations' && <Places {...{ locations, warehouses, ins, del }} />}
          {tab === 'branches' && <Simple title="Филиалы-адресаты" hint="Куда выдаём товар. Город — для группировки в аналитике." table="branches" rows={branches} cols={[['name', 'Название'], ['city', 'Город']]} ins={ins} del={del} upd={upd} />}
          {tab === 'categories' && <Simple title="Категории" table="categories" rows={categories} cols={[['name', 'Название']]} ins={ins} del={del} upd={upd} />}
          {tab === 'appr' && <Approvals data={data} toast={toast} ins={ins} del={del} />}
          {tab === 'suppliers' && <Suppliers data={data} />}
          {tab === 'users' && <Users data={data} />}
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

/* ── Согласование: уровни, люди по филиалам, внешние ── */
function Approvals({ data, toast, ins, del }) {
  const { profiles, branches, externals, reload } = data
  const [tab, setTab] = useState('levels')
  const [open, setOpen] = useState({})
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [ext, setExt] = useState({ full_name: '', position: '' })

  const LV = [
    ['1', 'Специалист', 'создаёт заявку по согласованной СЗ', 'var(--ink-l)', 'var(--ink)'],
    ['2', 'Руководитель филиала', 'согласует и отправляет на склад', 'var(--gr-l)', 'var(--gr-m)'],
    ['3', 'Склад · МОЛ', 'выдаёт по отправленной заявке', 'var(--sur2)', 'var(--tx2)'],
  ]
  const ROLE = { admin: 'Склад · администратор', director: 'Директор', manager: 'Руководитель филиала', employee: 'Специалист' }

  // группировка по филиалам
  const byBranch = (branches || []).map((b) => ({
    ...b,
    head: (profiles || []).find((p) => p.role === 'manager' && p.branch_id === b.id),
    specs: (profiles || []).filter((p) => p.role === 'employee' && p.branch_id === b.id),
  }))
  const noBranch = (profiles || []).filter((p) => !p.branch_id && ['manager', 'employee'].includes(p.role))
  const problems = byBranch.filter((b) => !b.head)
  const filtered = q ? byBranch.filter((b) => (b.name + ' ' + (b.head?.full_name || '') + ' ' + b.specs.map((s) => s.full_name).join(' ')).toLowerCase().includes(q.toLowerCase())) : byBranch

  const saveProfile = async () => {
    const { error } = await supabase.from('profiles').update({ role: edit.role, branch_id: edit.branch_id ? Number(edit.branch_id) : null, position: edit.position || null }).eq('id', edit.id)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    toast('Сохранено'); setEdit(null); reload()
  }
  const addExt = async () => {
    if (!ext.full_name.trim()) return toast('Введите ФИО', 'error')
    const { error } = await supabase.from('external_approvers').insert({ full_name: ext.full_name.trim(), position: ext.position || null, level: 3 })
    if (error) return toast('Ошибка: ' + error.message, 'error')
    toast('Добавлен'); setExt({ full_name: '', position: '' }); reload()
  }
  const delExt = async (id) => {
    const { error } = await supabase.from('external_approvers').delete().eq('id', id)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    toast('Удалён'); reload()
  }

  const person = (p, isHead) => (
    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px 9px 38px', borderTop: '1px solid var(--brd)' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: isHead ? 'var(--gr-l)' : 'var(--ink-l)', color: isHead ? 'var(--gr-m)' : 'var(--ink)', display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 600, flexShrink: 0 }}>
        {(p.full_name || p.email || '?').slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{p.full_name || p.email}</div>
        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{ROLE[p.role]}{p.email ? ' · ' + p.email : ''}</div>
      </div>
      <button onClick={() => setEdit({ id: p.id, role: p.role, branch_id: p.branch_id || '', position: p.position || '' })}
        style={{ color: 'var(--ink)', fontSize: 13, padding: 5, minHeight: 38 }}>✎</button>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['levels', 'Уровни и люди'], ['ext', 'Вне системы'], ['routes', 'Маршруты']].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ fontSize: 12, padding: '8px 13px', minHeight: 38, borderRadius: 8, border: 'none', background: tab === t ? 'var(--ink-l)' : 'var(--sur)', color: tab === t ? 'var(--ink)' : 'var(--tx2)', fontWeight: tab === t ? 600 : 400 }}>{l}</button>
        ))}
      </div>

      {tab === 'levels' && <>
        <div className="card" style={{ padding: 15, marginBottom: 11 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Уровни согласования</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2, marginBottom: 12 }}>Маршрут строится сам — от заявителя вверх до склада. Настраивать по филиалам ничего не нужно.</div>
          {LV.map((r, i) => (
            <div key={r[0]} style={{ display: 'flex', gap: 11 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: r[3], color: r[4], display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11.5 }} className="mono">{r[0]}</div>
                {i < LV.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 14, background: 'var(--brd)' }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: i < LV.length - 1 ? 9 : 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r[1]}</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{r[2]}</div>
              </div>
            </div>
          ))}
        </div>

        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: филиал или ФИО" style={{ marginBottom: 10 }} />

        {problems.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', background: 'var(--am-l)', borderRadius: 10, fontSize: 11.5, color: 'var(--am-m)', marginBottom: 11 }}>
            ⚠️ <span><b>{problems.length}</b> {problems.length === 1 ? 'филиал' : 'филиала'} без руководителя — цепочка там короче</span>
          </div>
        )}

        <div className="card" style={{ overflow: 'hidden' }}>
          {filtered.map((b, i) => (
            <div key={b.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--brd)' : 'none' }}>
              <div onClick={() => setOpen({ ...open, [b.id]: !open[b.id] })}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', background: open[b.id] ? 'var(--bg)' : 'transparent', minHeight: 48 }}>
                <span style={{ fontSize: 13, color: 'var(--tx3)' }}>{open[b.id] ? '▾' : '▸'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{b.head ? b.head.full_name || b.head.email : 'руководитель не назначен'}</div>
                </div>
                <Badge color={b.head ? 'slate' : 'amber'}>{b.head ? `${1 + b.specs.length} чел.` : 'нет рук.'}</Badge>
              </div>
              {open[b.id] && <>
                {b.head ? person(b.head, true) : <div style={{ padding: '10px 13px 10px 38px', borderTop: '1px solid var(--brd)', fontSize: 11.5, color: 'var(--am-m)' }}>Руководитель не назначен</div>}
                {b.specs.map((sp) => person(sp, false))}
              </>}
            </div>
          ))}
        </div>

        {noBranch.length > 0 && <div className="card" style={{ marginTop: 11, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--brd)', fontSize: 12.5, fontWeight: 600, color: 'var(--am-m)' }}>Без филиала — {noBranch.length}</div>
          {noBranch.map((p) => person(p, false))}
        </div>}

        {edit && <div onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(8,10,14,.5)' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 400, padding: 20 }}>
            <div className="ff" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Уровень и филиал</div>
            <Field label="Уровень"><Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
              <option value="employee">Специалист</option>
              <option value="manager">Руководитель филиала</option>
              <option value="admin">Склад · администратор</option>
              <option value="director">Директор</option>
            </Select></Field>
            <div style={{ height: 11 }} />
            <Field label="Филиал"><Select value={edit.branch_id} onChange={(e) => setEdit({ ...edit, branch_id: e.target.value })}>
              <option value="">— без филиала —</option>
              {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select></Field>
            <div style={{ height: 11 }} />
            <Field label="Должность"><Input value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })} placeholder="Необязательно" /></Field>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Btn onClick={saveProfile} style={{ flex: 1, minHeight: 46 }}>Сохранить</Btn>
              <Btn v="secondary" onClick={() => setEdit(null)} style={{ minHeight: 46 }}>Отмена</Btn>
            </div>
          </div>
        </div>}
      </>}

      {tab === 'ext' && <>
        <div className="card" style={{ padding: 15, marginBottom: 11 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Согласующие вне системы</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2, marginBottom: 12 }}>Те, кто в приложение не заходит. Склад печатает акт, получает подпись живьём и прикладывает скан.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Input value={ext.full_name} onChange={(e) => setExt({ ...ext, full_name: e.target.value })} placeholder="ФИО" style={{ flex: 1, minWidth: 140 }} />
            <Input value={ext.position} onChange={(e) => setExt({ ...ext, position: e.target.value })} placeholder="Должность" style={{ flex: 1, minWidth: 140 }} />
            <Btn onClick={addExt} style={{ minHeight: 44 }}>＋ Добавить</Btn>
          </div>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {(externals || []).length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока никого</div>}
          {(externals || []).map((e, i, arr) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--brd)' : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--am-l)', color: 'var(--am-m)', display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 600 }}>
                {(e.full_name || '?').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{e.full_name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{e.position || '—'}</div>
              </div>
              <button onClick={() => delExt(e.id)} style={{ color: 'var(--tx3)', fontSize: 13, padding: 5, minHeight: 38 }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 10 }}>Имя попадает в акт снимком на момент подписи — если человек сменится, старые акты сохранят прежнее ФИО.</div>
      </>}

      {tab === 'routes' && <>
        <div className="card" style={{ padding: 15, marginBottom: 11 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Как пойдут заявки</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>Проверка настройки — маршруты собраны по уровням.</div>
        </div>
        {[
          ['От специалиста', ['Специалист', 'Рук. филиала', ...(externals || []).map((e) => e.full_name.split(' ')[0]), 'Склад']],
          ['От руководителя филиала', ['Рук. филиала', ...(externals || []).map((e) => e.full_name.split(' ')[0]), 'Склад']],
          ['Мелкая заявка без СЗ', ['Заявитель', 'Склад']],
        ].map(([title, route]) => (
          <div key={title} className="card" style={{ padding: '13px 15px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</span>
              <Badge>{route.length} {route.length < 5 ? 'звена' : 'звеньев'}</Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, fontSize: 11.5 }}>
              {route.map((n, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ padding: '3px 9px', borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--brd)' }}>{n}</span>
                  {i < route.length - 1 && <span style={{ color: 'var(--tx3)' }}>→</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </>}
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
