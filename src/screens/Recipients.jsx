import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Field, Input, Select, useToast, Confirm } from '../components/ui'
import SearchSelect from '../components/SearchSelect'

// Упрощаем имя для сравнения: «Асанов Н.» и «асанов н» — один человек
const norm = (s) => String(s || '').toLowerCase().replace(/[.,\-\s]+/g, ' ').trim()

export default function Recipients({ data, can }) {
  const toast = useToast()
  const { recipients, branches, reload } = data
  const [f, setF] = useState({ name: '', dept: '', branch_id: '' })
  const [merge, setMerge] = useState(null)
  const [edit, setEdit] = useState(null)          // правка одного
  const [picked, setPicked] = useState([])        // отмеченные для массовой правки
  const [bulkDept, setBulkDept] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [busy, setBusy] = useState(false)

  // Сколько раз человеку выдавали: удалять того, по кому есть история, нельзя
  const [used, setUsed] = useState({})
  useEffect(() => {
    supabase.from('movements').select('recipient_id').not('recipient_id', 'is', null)
      .then(({ data }) => {
        const c = {}
        for (const m of data || []) c[m.recipient_id] = (c[m.recipient_id] || 0) + 1
        setUsed(c)
      })
  }, [recipients?.length])

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

      {(recipients || []).some((r) => !r.dept) && picked.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', marginBottom: 12, borderRadius: 11, background: 'var(--am-l)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--am-m)', flex: 1 }}>
            Без департамента: {(recipients || []).filter((r) => !r.dept).length}
          </span>
          <button onClick={() => setPicked((recipients || []).filter((r) => !r.dept).map((r) => r.id))}
            style={{ fontSize: 12, color: 'var(--am-m)', fontWeight: 600, minHeight: 34, padding: '0 8px' }}>отметить все</button>
        </div>
      )}

      {/* Массовое назначение: у многих департамент не проставлен,
          разбирать по одному никто не станет */}
      {picked.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--ink-l)', border: '1px solid var(--ink)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>Отмечено: {picked.length}</span>
            <button onClick={() => setPicked([])} style={{ fontSize: 11.5, color: 'var(--tx3)', minHeight: 34, padding: '0 8px' }}>снять</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <SearchSelect value={bulkDept} onChange={setBulkDept}
                placeholder="— департамент / управление —" groupBy
                options={(data.departments || []).map((d) => ({
                  value: d.name, label: d.name,
                  group: d.kind === 'branch' ? 'Филиалы' : 'Департаменты и управления',
                }))} />
            </div>
            <Btn loading={busy} onClick={async () => {
              if (!bulkDept) return toast('Выберите департамент', 'error')
              setBusy(true)
              const { error } = await supabase.from('recipients').update({ dept: bulkDept }).in('id', picked)
              setBusy(false)
              if (error) return toast(error.message, 'error')
              toast(`Назначено: ${picked.length}`)
              setPicked([]); setBulkDept(''); reload()
            }} style={{ minHeight: 44 }}>Назначить всем</Btn>
          </div>
        </div>
      )}

      {edit && (
        <div onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 16, overflow: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 400, padding: 20 }}>
            <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>Изменить получателя</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <Field label="Имя">
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Департамент / управление">
                <SearchSelect value={edit.dept || ''} onChange={(v) => setEdit({ ...edit, dept: v })}
                  placeholder="— не указан —" groupBy
                  options={(data.departments || []).map((d) => ({
                    value: d.name, label: d.name,
                    group: d.kind === 'branch' ? 'Филиалы' : 'Департаменты и управления',
                  }))} />
              </Field>
              <Field label="Филиал">
                <Select value={edit.branch_id || ''} onChange={(e) => setEdit({ ...edit, branch_id: e.target.value })}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Btn loading={busy} onClick={async () => {
                  if (!edit.name?.trim()) return toast('Введите имя', 'error')
                  setBusy(true)
                  const { error } = await supabase.from('recipients').update({
                    name: edit.name.trim(), dept: edit.dept || null,
                    branch_id: edit.branch_id ? Number(edit.branch_id) : null,
                  }).eq('id', edit.id)
                  setBusy(false)
                  if (error) return toast(error.message, 'error')
                  toast('Сохранено'); setEdit(null); reload()
                }} style={{ flex: 1, minHeight: 46 }}>Сохранить</Btn>
                <Btn v="secondary" onClick={() => setEdit(null)} style={{ minHeight: 46 }}>Отмена</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <Confirm
          danger={!used[confirmDel.id]}
          title={used[confirmDel.id] ? 'Удалить нельзя' : 'Удалить получателя?'}
          message={used[confirmDel.id]
            ? `По «${confirmDel.name}» есть выдачи (${used[confirmDel.id]}). Удаление оставило бы акты без получателя — исправьте имя вместо удаления.`
            : `«${confirmDel.name}» будет удалён. По нему не было выдач, поэтому история не пострадает.`}
          onCancel={() => setConfirmDel(null)}
          onOk={async () => {
            if (used[confirmDel.id]) return setConfirmDel(null)
            const { error } = await supabase.from('recipients').delete().eq('id', confirmDel.id)
            setConfirmDel(null)
            if (error) return toast(error.message, 'error')
            toast('Удалён'); reload()
          }} />
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        {recipients.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока никого. Добавьте людей, которым выдаёте товары.</div>}
        {recipients.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 18px', borderBottom: i < recipients.length - 1 ? '1px solid var(--brd)' : 'none' }}>
            <input type="checkbox" checked={picked.includes(r.id)}
              onChange={(e) => setPicked((l) => (e.target.checked ? [...l, r.id] : l.filter((x) => x !== r.id)))}
              style={{ width: 17, height: 17, minHeight: 17, accentColor: 'var(--ink)', flexShrink: 0 }} />
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: r.dept ? 'var(--gr)' : 'var(--am)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{r.name[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: r.dept ? 'var(--tx3)' : 'var(--am-m)' }}>
                {r.dept || 'департамент не указан'}
                {r.branch_id ? ` · ${branches.find((b) => b.id === r.branch_id)?.name || ''}` : ''}
                {used[r.id] ? ` · выдач ${used[r.id]}` : ''}
              </div>
            </div>
            <button onClick={() => setEdit({ ...r })}
              style={{ fontSize: 11.5, color: 'var(--tx3)', minHeight: 36, padding: '0 8px' }}>изменить</button>
            <button onClick={() => setConfirmDel(r)}
              style={{ fontSize: 11.5, color: used[r.id] ? 'var(--tx3)' : 'var(--rd-m)', minHeight: 36, padding: '0 8px' }}>удалить</button>
          </div>
        ))}
      </div>
    </div>
  )
}
