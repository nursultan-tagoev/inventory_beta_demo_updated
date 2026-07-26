import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Input, useToast } from './ui'
import { fmt } from '../lib/format'

/* Поставщики: контакты, оценка по поставкам, история */
export default function Suppliers({ data, toast: t }) {
  const toast = useToast()
  const { suppliers, movements, products, reload } = data
  const [open, setOpen] = useState(null)
  const [add, setAdd] = useState(false)
  const [deliveries, setDeliveries] = useState([])
  const [f, setF] = useState({ name: '', contact_person: '', phone: '', email: '', contract: '', notes: '' })

  useEffect(() => {
    supabase.from('deliveries').select('*').order('created_at', { ascending: false }).limit(500)
      .then(({ data: d }) => setDeliveries(d || []))
  }, [suppliers])

  // Статистика по поставщику
  const stats = (sid) => {
    const list = deliveries.filter((d) => d.supplier_id === sid)
    if (!list.length) return null
    const onTime = list.filter((d) => d.on_time).length
    const withDef = list.filter((d) => (d.defects || 0) > 0).length
    const totalDef = list.reduce((a, d) => a + (d.defects || 0), 0)
    // балл: в срок и без брака 5 · одно из двух 3,5 · оба минуса 2
    const score = list.reduce((a, d) => {
      const ok = d.on_time, clean = (d.defects || 0) === 0
      return a + (ok && clean ? 5 : ok || clean ? 3.5 : 2)
    }, 0) / list.length
    // Что и сколько привезли — из приходов, привязанных к поставкам
    const ids = new Set(list.map((d) => d.id))
    const mv = (movements || []).filter((m) => m.type === 'in' && (ids.has(m.delivery_id) || (!m.delivery_id && m.supplier_id === sid)))
    const units = mv.reduce((a, m) => a + (m.qty || 0), 0)
    const skus = new Set(mv.map((m) => m.product_id)).size
    const defRate = units + totalDef > 0 ? Math.round((totalDef / (units + totalDef)) * 1000) / 10 : 0
    const lastAt = list[0]?.created_at || null
    return { count: list.length, onTime, withDef, totalDef, units, skus, defRate, lastAt, score: Math.round(score * 10) / 10 }
  }

  const stars = (n) => {
    const full = Math.round(n)
    return <span style={{ letterSpacing: 1 }}>{[1, 2, 3, 4, 5].map((i) => (
      <span key={i} style={{ color: i <= full ? '#D9A55E' : 'var(--brd2)', fontSize: 13 }}>★</span>
    ))}</span>
  }

  const save = async () => {
    if (!f.name.trim()) return toast('Введите название', 'error')
    const row = { name: f.name.trim(), contact_person: f.contact_person || null, phone: f.phone || null,
      email: f.email || null, contract: f.contract || null, notes: f.notes || null }
    const { error } = open?.id
      ? await supabase.from('suppliers').update(row).eq('id', open.id)
      : await supabase.from('suppliers').insert(row)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    toast('Сохранено'); setAdd(false); setOpen(null)
    setF({ name: '', contact_person: '', phone: '', email: '', contract: '', notes: '' })
    reload()
  }

  const edit = (s) => { setOpen(s); setF({ name: s.name || '', contact_person: s.contact_person || '', phone: s.phone || '', email: s.email || '', contract: s.contract || '', notes: s.notes || '' }); setAdd(true) }

  // Поставки конкретного поставщика
  const supDeliveries = (sid) => deliveries.filter((d) => d.supplier_id === sid).slice(0, 8)
  const pName = (id) => (products || []).find((p) => p.id === id)?.name || 'товар'
  // Что привезли в рамках одной поставки
  const dlvItems = (dlvId) => (movements || []).filter((m) => m.type === 'in' && m.delivery_id === dlvId)

  const lbl = (t) => <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 5 }}>{t}</div>

  return (
    <div>
      <div className="card" style={{ padding: 15, marginBottom: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Поставщики</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>Оценка считается сама — из отметок при приёмке.</div>
          </div>
          <Btn size="sm" onClick={() => { setOpen(null); setF({ name: '', contact_person: '', phone: '', email: '', contract: '', notes: '' }); setAdd(true) }}
            style={{ marginLeft: 'auto', minHeight: 40 }}>＋ Поставщик</Btn>
        </div>
      </div>

      {/* Форма */}
      {add && (
        <div className="card" style={{ padding: 15, marginBottom: 11, border: '1.5px solid var(--ink)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>{open ? 'Изменить' : 'Новый поставщик'}</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>{lbl('Название')}<Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ТОО «Мерч Плюс»" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>{lbl('Контактное лицо')}<Input value={f.contact_person} onChange={(e) => setF({ ...f, contact_person: e.target.value })} /></div>
              <div>{lbl('Телефон')}<Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>{lbl('Почта')}<Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} inputMode="email" /></div>
              <div>{lbl('Договор')}<Input value={f.contract} onChange={(e) => setF({ ...f, contract: e.target.value })} placeholder="№ 14 от 12.01.2026" /></div>
            </div>
            <div>{lbl('Заметки')}<Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Скидки, особенности" /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
            <Btn onClick={save} style={{ minHeight: 44 }}>Сохранить</Btn>
            <Btn v="secondary" onClick={() => { setAdd(false); setOpen(null) }} style={{ minHeight: 44 }}>Отмена</Btn>
          </div>
        </div>
      )}

      {/* Список */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {(suppliers || []).length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока пусто</div>}
        {(suppliers || []).map((s, i, arr) => {
          const st = stats(s.id)
          const isOpen = open?.id === s.id && !add
          return (
            <div key={s.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--brd)' : 'none' }}>
              <div onClick={() => setOpen(isOpen ? null : s)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 15px', cursor: 'pointer' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--ink-l)', color: 'var(--ink)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                  {(s.name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                    {[s.contact_person, s.phone].filter(Boolean).join(' · ') || 'контакты не заполнены'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {st ? <>
                    <div>{stars(st.score)}</div>
                    <div style={{ fontSize: 10, color: st.totalDef ? 'var(--rd-m)' : 'var(--gr-m)' }}>
                      {st.totalDef ? `брак ${st.totalDef}` : 'без брака'}
                    </div>
                  </> : <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>нет поставок</span>}
                </div>
              </div>

              {isOpen && (
                <div style={{ padding: '0 15px 14px' }}>
                  {st && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 11 }}>
                      {[['Поставок', st.count, ''], ['В срок', `${st.onTime} из ${st.count}`, 'var(--gr-m)'],
                        ['Привезено', `${fmt(st.units)} шт`, 'var(--gr-m)'], ['Наименований', `${st.skus}`, ''],
                        ['Брака всего', `${st.totalDef} шт`, st.totalDef ? 'var(--rd-m)' : ''],
                        ['Доля брака', `${st.defRate}%`, st.defRate > 5 ? 'var(--rd-m)' : st.defRate > 0 ? 'var(--am-m)' : 'var(--gr-m)']].map(([l, v, c]) => (
                        <div key={l} style={{ background: 'var(--bg)', borderRadius: 10, padding: '9px 11px' }}>
                          <div style={{ fontSize: 9.5, color: 'var(--tx3)' }}>{l}</div>
                          <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: c || 'var(--tx)' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(s.contract || s.email) && (
                    <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginBottom: 10, lineHeight: 1.7 }}>
                      {s.email && <div><span style={{ color: 'var(--tx3)' }}>Почта:</span> {s.email}</div>}
                      {s.contract && <div><span style={{ color: 'var(--tx3)' }}>Договор:</span> {s.contract}</div>}
                    </div>
                  )}

                  {s.notes && <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 11 }}>{s.notes}</div>}

                  {/* История поставок */}
                  {supDeliveries(s.id).length > 0 && (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>Последние поставки</div>
                      <div style={{ border: '1px solid var(--brd)', borderRadius: 10, overflow: 'hidden', marginBottom: 11 }}>
                        {supDeliveries(s.id).map((d, j, a) => (
                          <div key={d.id} style={{ padding: '9px 12px', borderBottom: j < a.length - 1 ? '1px solid var(--brd)' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span className="mono" style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                                {new Date(d.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                              </span>
                              <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 20, background: d.on_time ? 'var(--gr-l)' : 'var(--am-l)', color: d.on_time ? 'var(--gr-m)' : 'var(--am-m)' }}>
                                {d.on_time ? 'в срок' : 'опоздание'}
                              </span>
                              {(d.defects || 0) > 0 && <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 20, background: 'var(--rd-l)', color: 'var(--rd-m)' }}>брак {d.defects}</span>}
                            </div>
                            {dlvItems(d.id).length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                                {dlvItems(d.id).map((m) => (
                                  <span key={m.id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--brd)', color: 'var(--tx2)' }}>
                                    {pName(m.product_id)} · <b className="mono">{m.qty}</b>
                                  </span>
                                ))}
                              </div>
                            )}
                            {d.comment && <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 4, fontStyle: 'italic' }}>«{d.comment}»</div>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <button onClick={() => edit(s)} style={{ fontSize: 12, color: 'var(--ink)', minHeight: 40, padding: '0 10px' }}>✎ Изменить</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
