import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Field, Input, Select, useToast } from '../components/ui'

export default function Recipients({ data, can }) {
  const toast = useToast()
  const { recipients, branches, reload } = data
  const [f, setF] = useState({ name: '', dept: '', branch_id: '' })
  const [merge, setMerge] = useState(null)

  /* Двойники: без связи человека могли завести повторно, а при отправке
     очереди совпадение ловится только по точному имени. */
  const dupes = (() => {
    const g = {}
    for (const r of recipients || []) (g[norm(r.name)] ||= []).push(r)
    return Object.values(g).filter((x) => x.length > 1)
  })()
  const [loading, setLoading] = useState(false)
  const add = async () => {
    if (!f.name.trim()) return toast('Укажите имя', 'error')
    setLoading(true)
    const { error } = await supabase.from('recipients').insert({ name: f.name.trim(), dept: f.dept?.trim() || null, branch_id: Number(f.branch_id) || null })
    setLoading(false)
    if (error) return toast('Ошибка: ' + error.message, 'error')
    setF({ name: '', dept: '', branch_id: '' }); toast('Добавлен'); reload()
  }
  const doMerge = async (keep, drop) => {
    // Переносим операции на того, кого оставляем, и убираем двойника
    await supabase.from('movements').update({ recipient_id: keep.id }).eq('recipient_id', drop.id)
    await supabase.from('acts').update({ recipient_id: keep.id }).eq('recipient_id', drop.id)
    const { error } = await supabase.from('recipients').delete().eq('id', drop.id)
    if (error) return toast(error.message, 'error')
    toast('Объединено')
    setMerge(null)
    reload()
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 24, animation: 'fadeUp .3s ease' }}>
      <div className="ff" style={{ fontSize: 20, fontWeight: 600, marginBottom: 18 }}>Получатели</div>
      {can('edit') && <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <Field label="Имя"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Полное имя" /></Field>
          <Field label="Департамент">
            <Select value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}>
              <option value="">—</option>
              {(data.departments || []).map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Филиал"><Select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <Btn onClick={add} loading={loading}>Добавить</Btn>
        </div>
      </div>}
      {/* Двойники: обычно появляются, когда человека завели без связи */}
      {dupes.length > 0 && (
        <div className="card" style={{ padding: 15, marginBottom: 12, background: 'var(--am-l)', border: '1px solid var(--am)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--am-m)', marginBottom: 8 }}>
            Похоже, один человек заведён дважды · {dupes.length}
          </div>
          {dupes.map((g) => (
            <div key={g[0].id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderTop: '1px solid var(--am)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140, fontSize: 12.5 }}>
                {g.map((r) => `${r.name}${r.dept ? ' · ' + r.dept : ''}`).join('  ·  ')}
              </div>
              <Btn size="sm" onClick={() => setMerge(g)} style={{ minHeight: 36 }}>Объединить</Btn>
            </div>
          ))}
        </div>
      )}

      {merge && (
        <div onClick={() => setMerge(null)} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 400, padding: 20 }}>
            <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Кого оставить?</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.6, marginBottom: 14 }}>
              Операции и акты второго перейдут на выбранного, сам он будет удалён.
            </div>
            {merge.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 0', borderTop: '1px solid var(--brd)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{r.dept || 'без департамента'}</div>
                </div>
                <Btn size="sm" onClick={() => doMerge(r, merge.find((x) => x.id !== r.id))} style={{ minHeight: 36 }}>Оставить</Btn>
              </div>
            ))}
            <Btn v="secondary" onClick={() => setMerge(null)} style={{ width: '100%', minHeight: 44, marginTop: 14 }}>Отмена</Btn>
          </div>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        {recipients.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока никого. Добавьте людей, которым выдаёте товары.</div>}
        {recipients.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < recipients.length - 1 ? '1px solid var(--brd)' : 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gr)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 13 }}>{r.name[0]}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}{r.dept ? ` · ${r.dept}` : ''}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>{branches.find((b) => b.id === r.branch_id)?.name || '—'}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}
