import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { chainOf } from '../lib/data'
import { Btn, Field, Input, Select, Badge, Confirm, useToast } from '../components/ui'
import { fmt, som, TL } from '../lib/format'

export default function Items({ data, can }) {
  const toast = useToast()
  const { products, categories, suppliers, locations, stock, stockByWh, warehouses, campaigns, directions, productTypes, flows, checkouts, recipients, reload } = data
  const [q, setQ] = useState('')
  const [add, setAdd] = useState(false)
  const [sel, setSel] = useState(null)
  const [nf, setNf] = useState({ name: '', sku: '', category_id: '', price: '', location_id: '', supplier_id: '', direction_id: '', product_type_id: '', campaign_id: '' })
  const [loading, setLoading] = useState(false)
  const [hier, setHier] = useState({ direction_id: '', product_type_id: '', campaign_id: '' })
  const [whF, setWhF] = useState('')

  const hTypes = hier.direction_id ? productTypes.filter((t) => t.direction_id == hier.direction_id) : productTypes
  const hCamps = hier.product_type_id ? campaigns.filter((c) => c.product_type_id == hier.product_type_id) : campaigns
  const inHier = (p) => {
    if (hier.campaign_id && p.campaign_id != hier.campaign_id) return false
    if (hier.product_type_id) {
      const c = campaigns.find((x) => x.id === p.campaign_id)
      if ((c?.product_type_id || p.product_type_id) != hier.product_type_id) return false
    }
    if (hier.direction_id) {
      const c = campaigns.find((x) => x.id === p.campaign_id)
      const t = productTypes.find((x) => x.id === (c?.product_type_id || p.product_type_id))
      if ((t?.direction_id || p.direction_id) != hier.direction_id) return false
    }
    return true
  }
  const list = products.filter((p) => !p.archived
    && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku || '').toLowerCase().includes(q.toLowerCase()))
    && inHier(p)
    && (!whF || ((stockByWh?.[p.id]?.[whF]) || 0) > 0))
  const hierActive = hier.direction_id || hier.product_type_id || hier.campaign_id || whF
  const selS = { height: 38, padding: '0 11px', borderRadius: 11, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 12.5, color: 'var(--tx)' }

  const save = async () => {
    if (!nf.name.trim()) return toast('Название обязательно', 'error')
    setLoading(true)
    const { error } = await supabase.from('products').insert({ name: nf.name.trim(), sku: nf.sku || null, category_id: nf.category_id ? Number(nf.category_id) : null, price: Number(nf.price) || 0, location_id: nf.location_id ? Number(nf.location_id) : null, supplier_id: nf.supplier_id ? Number(nf.supplier_id) : null, campaign_id: nf.campaign_id ? Number(nf.campaign_id) : null, direction_id: nf.direction_id ? Number(nf.direction_id) : null, archived: false })
    setLoading(false)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    setAdd(false); setNf({ name: '', sku: '', category_id: '', price: '', location_id: '', supplier_id: '', direction_id: '', product_type_id: '', campaign_id: '' }); toast('Товар добавлен'); reload()
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 24, animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 21, fontWeight: 600 }}>Товары</span>
        <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>{list.length} позиций</span>
        {can('edit') && <Btn size="sm" onClick={() => setAdd(!add)} style={{ marginLeft: 'auto' }}>＋ Товар</Btn>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или артикулу…"
          style={{ ...selS, flex: 1, minWidth: 170, padding: '0 13px' }} />
        <select value={hier.direction_id} onChange={(e) => setHier({ direction_id: e.target.value, product_type_id: '', campaign_id: '' })} style={selS}>
          <option value="">Направление</option>
          {directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={hier.product_type_id} onChange={(e) => setHier({ ...hier, product_type_id: e.target.value, campaign_id: '' })} style={selS}>
          <option value="">Тип</option>
          {hTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={hier.campaign_id} onChange={(e) => setHier({ ...hier, campaign_id: e.target.value })} style={selS}>
          <option value="">Кампания</option>
          {hCamps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={whF} onChange={(e) => setWhF(e.target.value)} style={selS}>
          <option value="">Все склады</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        {hierActive && <button onClick={() => { setHier({ direction_id: '', product_type_id: '', campaign_id: '' }); setWhF('') }}
          style={{ fontSize: 12, color: 'var(--ink)', padding: '0 6px' }}>✕ сбросить</button>}
      </div>

      {add && <div className="card" style={{ padding: 18, marginBottom: 16, border: '1.5px solid var(--ink)' }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Новый товар</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <Field label="Название"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} autoFocus /></Field>
          <Field label="Артикул"><Input value={nf.sku} onChange={(e) => setNf({ ...nf, sku: e.target.value })} /></Field>
          <Field label="Категория"><Select value={nf.category_id} onChange={(e) => setNf({ ...nf, category_id: e.target.value })}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Цена"><Input type="number" value={nf.price} onChange={(e) => setNf({ ...nf, price: e.target.value })} /></Field>
          <Field label="Место"><Select value={nf.location_id} onChange={(e) => setNf({ ...nf, location_id: e.target.value })}><option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Поставщик"><Select value={nf.supplier_id} onChange={(e) => setNf({ ...nf, supplier_id: e.target.value })}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', margin: '4px 0 8px' }}>Цепочка (Направление → Тип → Кампания)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 4 }}>
          <Field label="Направление"><Select value={nf.direction_id} onChange={(e) => setNf({ ...nf, direction_id: e.target.value, product_type_id: '', campaign_id: '' })}><option value="">—</option>{directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Тип"><Select value={nf.product_type_id} onChange={(e) => setNf({ ...nf, product_type_id: e.target.value, campaign_id: '' })}><option value="">—</option>{productTypes.filter((t) => !nf.direction_id || t.direction_id == nf.direction_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Кампания"><Select value={nf.campaign_id} onChange={(e) => setNf({ ...nf, campaign_id: e.target.value })}><option value="">— без категории —</option>{campaigns.filter((c) => !nf.product_type_id || c.product_type_id == nf.product_type_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        </div>
        <div style={{ display: 'flex', gap: 8 }}><Btn onClick={save} loading={loading}>Сохранить</Btn><Btn v="secondary" onClick={() => setAdd(false)}>Отмена</Btn></div>
      </div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(184px,1fr))', gap: 14 }}>
        {list.map((p) => {
          const s = stock[p.id] || 0
          const c = s === 0 ? 'var(--tx3)' : s < 5 ? 'var(--am)' : 'var(--gr)'
          const cat = categories.find((x) => x.id === p.category_id)
          return (
            <div key={p.id} onClick={() => setSel(p)} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
              <div style={{ height: 60, background: 'var(--sur2)', display: 'flex', alignItems: 'flex-end', padding: '10px 14px' }}>
                <span className="mono" style={{ fontSize: 23, fontWeight: 600, color: c }}>{s}<span style={{ fontFamily: 'var(--f)', fontSize: 11, color: 'var(--tx3)' }}> шт</span></span>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                {chainOf(p, { directions, productTypes, campaigns }) && <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3 }}>{chainOf(p, { directions, productTypes, campaigns })}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 7, paddingTop: 7, borderTop: '1px solid var(--brd)' }}>
                  {warehouses.map((w) => (
                    <span key={w.id} style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{w.name} <b className="mono" style={{ color: 'var(--tx2)' }}>{(stockByWh?.[p.id]?.[w.id]) || 0}</b></span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span className="mono" style={{ fontSize: 12, color: 'var(--tx2)' }}>{fmt(p.price)} сом</span>{cat && <Badge>{cat.name}</Badge>}</div>
              </div>
            </div>
          )
        })}
      </div>
      {list.length === 0 && !add && <div style={{ padding: 60, textAlign: 'center', color: 'var(--tx3)' }}>{q ? 'Ничего не найдено.' : 'Товаров нет. Добавьте первый или оформите приход.'}</div>}

      {sel && <ItemModal p={sel} data={data} can={can} onClose={() => setSel(null)} />}
    </div>
  )
}

function ItemModal({ p, data, can, onClose }) {
  const toast = useToast()
  const { stock, flows, checkouts, recipients, campaigns, directions, productTypes, categories, suppliers, reload } = data
  const [confirmDel, setConfirmDel] = useState(false)
  const [tab, setTab] = useState('info')
  const [hist, setHist] = useState(null)
  const [editing, setEditing] = useState(false)
  const [ef, setEf] = useState(null)

  const startEdit = () => {
    const camp = campaigns.find((c) => c.id === p.campaign_id)
    const tid = camp?.product_type_id || p.product_type_id || ''
    const type = productTypes.find((t) => t.id === tid)
    const did = type?.direction_id || p.direction_id || ''
    setEf({ name: p.name || '', sku: p.sku || '', price: p.price || '', category_id: p.category_id || '', supplier_id: p.supplier_id || '', direction_id: did, product_type_id: tid, campaign_id: p.campaign_id || '' })
    setEditing(true)
  }
  const saveEdit = async () => {
    if (!ef.name.trim()) return toast('Название обязательно', 'error')
    const { error } = await supabase.from('products').update({
      name: ef.name.trim(), sku: ef.sku || null, price: Number(ef.price) || 0,
      category_id: ef.category_id ? Number(ef.category_id) : null,
      supplier_id: ef.supplier_id ? Number(ef.supplier_id) : null,
      campaign_id: ef.campaign_id ? Number(ef.campaign_id) : null,
      direction_id: ef.direction_id ? Number(ef.direction_id) : null,
    }).eq('id', p.id)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    toast('Сохранено'); setEditing(false); reload(); onClose()
  }
  const s = stock[p.id] || 0
  const fl = flows[p.id] || { in: 0, out: 0, return: 0, writeoff: 0 }
  const onHand = checkouts.filter((c) => c.product_id === p.id)
  const rName = (id) => recipients.find((r) => r.id === id)?.name || '—'
  useEffect(() => {
    if (tab === 'history' && hist === null) {
      supabase.from('movements').select('*').eq('product_id', p.id).order('created_at', { ascending: false }).limit(100).then(({ data: d }) => setHist(d || []))
    }
  }, [tab])

  const hasMoves = (flows[p.id] && (flows[p.id].in || flows[p.id].out || flows[p.id].return || flows[p.id].writeoff))
  const removeProduct = async () => {
    if (hasMoves) {
      // есть движения — архивируем (мягко скрываем)
      const { error } = await supabase.from('products').update({ archived: true }).eq('id', p.id)
      if (error) return toast('Ошибка: ' + error.message, 'error')
      toast('Товар архивирован'); reload(); onClose()
    } else {
      // нет движений — можно удалить полностью
      const { error } = await supabase.from('products').delete().eq('id', p.id)
      if (error) return toast(error.message.includes('foreign key') ? 'Есть связанные записи — товар архивирован' : 'Ошибка: ' + error.message, 'error')
      toast('Товар удалён'); reload(); onClose()
    }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 600, maxHeight: '88vh', overflow: 'auto', animation: 'fadeUp .2s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 22px', borderBottom: '1px solid var(--brd)' }}>
          <div><div className="ff" style={{ fontSize: 18, fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>{p.sku || '—'} · {som(p.price)}</div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: s === 0 ? 'var(--rd)' : s < 5 ? 'var(--am)' : 'var(--gr)' }}>{s}<span style={{ fontSize: 13, color: 'var(--tx3)', fontFamily: 'var(--f)' }}> шт</span></div>
            {can('edit') && !editing && <button onClick={startEdit} title="Изменить товар" style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', color: 'var(--ink)', background: 'var(--ink-l)', fontSize: 15 }}>✎</button>}
            {can('edit') && <button onClick={() => setConfirmDel(true)} title="Удалить товар" style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', color: 'var(--rd-m)', background: 'var(--rd-l)', fontSize: 15 }}>🗑</button>}
          </div>
        </div>
        {confirmDel && <Confirm title="Удалить товар?" danger
          message={hasMoves ? `У товара «${p.name}» есть движения, поэтому он будет архивирован (скрыт из списка), а история сохранится.` : `Товар «${p.name}» будет удалён полностью. Действие необратимо.`}
          onOk={() => { setConfirmDel(false); removeProduct() }} onCancel={() => setConfirmDel(false)} />}
        {editing && ef && <div style={{ padding: '18px 22px' }}>
          <div className="ff" style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Изменить товар</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field label="Название"><Input value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} /></Field>
            <Field label="Артикул"><Input value={ef.sku} onChange={(e) => setEf({ ...ef, sku: e.target.value })} /></Field>
            <Field label="Цена"><Input type="number" value={ef.price} onChange={(e) => setEf({ ...ef, price: e.target.value })} /></Field>
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Цепочка (Направление → Тип → Кампания)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field label="Направление"><Select value={ef.direction_id} onChange={(e) => setEf({ ...ef, direction_id: e.target.value, product_type_id: '', campaign_id: '' })}><option value="">—</option>{directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Тип"><Select value={ef.product_type_id} onChange={(e) => setEf({ ...ef, product_type_id: e.target.value, campaign_id: '' })}><option value="">—</option>{productTypes.filter((t) => !ef.direction_id || t.direction_id == ef.direction_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Кампания"><Select value={ef.campaign_id} onChange={(e) => setEf({ ...ef, campaign_id: e.target.value })}><option value="">— без категории —</option>{campaigns.filter((c) => !ef.product_type_id || c.product_type_id == ef.product_type_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Field label="Категория"><Select value={ef.category_id} onChange={(e) => setEf({ ...ef, category_id: e.target.value })}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Поставщик"><Select value={ef.supplier_id} onChange={(e) => setEf({ ...ef, supplier_id: e.target.value })}><option value="">—</option>{suppliers.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}</Select></Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><Btn onClick={saveEdit}>Сохранить</Btn><Btn v="secondary" onClick={() => setEditing(false)}>Отмена</Btn></div>
        </div>}

        {!editing && <div style={{ display: 'flex', gap: 4, padding: '14px 22px 0' }}>
          {[['info', 'Обзор'], ['history', 'История']].map(([t, l]) => <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: tab === t ? 600 : 400, background: tab === t ? 'var(--ink-l)' : 'transparent', color: tab === t ? 'var(--ink)' : 'var(--tx2)' }}>{l}</button>)}
        </div>}
        {!editing && <div style={{ padding: 22 }}>
          {tab === 'info' && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
              {[['Приход', fl.in, 'var(--gr)'], ['Выдано', fl.out, 'var(--ink)'], ['Возврат', fl.return, 'var(--pu)'], ['Списано', fl.writeoff, 'var(--rd)']].map(([l, v, c]) => <div key={l} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}><div className="mono" style={{ fontSize: 18, fontWeight: 600, color: c }}>{v}</div><div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{l}</div></div>)}
            </div>
            {onHand.length > 0 && <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>На руках — {onHand.reduce((a, c) => a + c.remaining, 0)} шт</div>{onHand.map((c, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--brd)', fontSize: 13 }}><span>{rName(c.recipient_id)}</span><b className="mono">{c.remaining} шт{c.due_date ? <span style={{ fontWeight: 400, color: 'var(--tx3)', fontFamily: 'var(--f)' }}> · до {c.due_date}</span> : null}</b></div>)}</div>}
          </>}
          {tab === 'history' && <div>{hist === null ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--tx3)' }}>Загрузка…</div> : hist.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--tx3)' }}>Нет операций</div> : hist.map((m) => <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--brd)', fontSize: 13 }}><Badge color={{ in: 'green', out: 'ink', return: 'purple', writeoff: 'red' }[m.type]}>{TL[m.type]}</Badge><b className="mono">×{m.qty}</b><span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }} className="mono">{new Date(m.created_at).toLocaleDateString('ru-RU')}</span></div>)}</div>}
        </div>}
      </div>
    </div>
  )
}
