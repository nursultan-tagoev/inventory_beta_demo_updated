import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Badge, Spin } from '../components/ui'
import { fmt } from '../lib/format'

const ST = { draft: ['Черновик', 'slate'], awaiting_sign: ['Ожидает подписи', 'amber'], signed: ['Подписан (эл.)', 'green'], signed_manual: ['Подписан (скан)', 'green'] }

export default function Acts({ data }) {
  const [acts, setActs] = useState(null)
  const [f, setF] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const { recipients } = data
  const rName = (id, snap) => snap || recipients.find((r) => r.id === id)?.name || '—'

  const load = () => supabase.from('acts').select('*').order('created_at', { ascending: false }).then(({ data: d }) => setActs(d || []))
  useEffect(() => { load() }, [])

  const list = (acts || []).filter((a) => (f === 'all' || a.type === f) && (!q || (a.number || '').toLowerCase().includes(q.toLowerCase()) || (a.recipient_name || '').toLowerCase().includes(q.toLowerCase())))

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24, animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 20, fontWeight: 600 }}>Акты приёма-передачи</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по номеру или получателю…" style={{ marginLeft: 'auto', height: 38, padding: '0 14px', borderRadius: 11, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 14, minWidth: 240 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['all', 'Все'], ['out', 'Выдача'], ['return', 'Возврат']].map(([t, l]) => <button key={t} onClick={() => setF(t)} style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${f === t ? 'var(--ink)' : 'var(--brd)'}`, fontSize: 12, fontWeight: f === t ? 600 : 400, background: f === t ? 'var(--ink-l)' : 'var(--sur)', color: f === t ? 'var(--ink)' : 'var(--tx2)' }}>{l}</button>)}
      </div>

      {acts === null ? <div style={{ padding: 50, textAlign: 'center' }}><Spin /></div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {list.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Актов пока нет. Они появляются здесь после того, как вы сформируете акт при выдаче или возврате.</div>}
          {list.map((a, i) => (
            <div key={a.id} onClick={() => setOpen(a)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: i < list.length - 1 ? '1px solid var(--brd)' : 'none', cursor: 'pointer' }}>
              <div style={{ width: 40, textAlign: 'center', fontSize: 20 }}>🧾</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="mono" style={{ fontWeight: 600, fontSize: 13.5 }}>{a.number}</span><Badge color={a.type === 'return' ? 'purple' : 'ink'}>{a.type === 'return' ? 'Возврат' : 'Выдача'}</Badge></div>
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>{rName(a.recipient_id, a.recipient_name)} · {a.act_date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontWeight: 600, fontSize: 13.5 }}>{fmt(a.total_sum)} сом</div>
                <div style={{ marginTop: 3 }}><Badge color={ST[a.status]?.[1] || 'slate'}>{ST[a.status]?.[0] || a.status}</Badge></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && <ActView act={open} data={data} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ActView({ act, data, onClose }) {
  const [items, setItems] = useState(null)
  useEffect(() => { supabase.from('act_items').select('*').eq('act_id', act.id).then(({ data: d }) => setItems(d || [])) }, [act.id])
  const today = new Date(act.act_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
  const isRet = act.type === 'return'
  return (
    <div className="no-print" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(3px)', overflow: 'auto', padding: '24px 12px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 780, margin: '0 auto' }}>
        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'flex-end' }}>
          <button onClick={() => window.print()} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 12.5, fontWeight: 600 }}>🖨 Печать / PDF</button>
          <button onClick={onClose} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 12.5, fontWeight: 600 }}>Закрыть</button>
        </div>
        <div id="act-print" style={{ background: '#fff', color: '#14171D', borderRadius: 8, padding: '46px 54px', boxShadow: 'var(--sh3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: '#5A6472' }}>«Наименование банка» · Отдел маркетинга</div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#5A6472' }}>Акт № <b className="mono" style={{ color: '#14171D' }}>{act.number}</b><br />от {today}</div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #14171D' }} />
          <div style={{ textAlign: 'center', margin: '18px 0 14px' }}><div className="ff" style={{ fontSize: 25 }}>Акт приёма-передачи</div><div style={{ fontSize: 13, color: '#5A6472' }}>ТМЦ · {isRet ? 'возврат' : 'выдача'}</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, fontSize: 13, marginBottom: 10 }}>
            <div><div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#98A0AE' }}>{isRet ? 'Возвращает' : 'Передал'}</div>{isRet ? act.recipient_name : act.giver_name}</div>
            <div><div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#98A0AE' }}>Принял</div>{isRet ? act.giver_name : act.recipient_name}</div>
          </div>
          <div style={{ fontSize: 12.5, color: '#5A6472', marginBottom: 6 }}>Основание: {act.basis || '—'}</div>
          {items === null ? <div style={{ padding: 20 }}>Загрузка…</div> : (
            <table className="act-tbl"><thead><tr><th style={{ width: 24 }}>№</th><th>Наименование</th><th style={{ width: 80 }}>Артикул</th><th style={{ width: 90 }}>Инв. №</th><th style={{ width: 46 }}>Ед.</th><th style={{ width: 54, textAlign: 'right' }}>Кол-во</th><th style={{ width: 74, textAlign: 'right' }}>Цена</th><th style={{ width: 84, textAlign: 'right' }}>Сумма</th></tr></thead>
              <tbody>{items.map((it, i) => <tr key={it.id}><td style={{ textAlign: 'center' }}>{i + 1}</td><td>{it.name}</td><td>{it.sku || '—'}</td><td>{it.inv_number || '—'}</td><td>{it.unit}</td><td className="mono" style={{ textAlign: 'right' }}>{it.qty}</td><td className="mono" style={{ textAlign: 'right' }}>{fmt(it.price)}</td><td className="mono" style={{ textAlign: 'right' }}>{fmt(it.sum)}</td></tr>)}</tbody>
            </table>
          )}
          <div style={{ textAlign: 'right', fontSize: 13, marginTop: 4 }}>Итого на сумму <b className="mono">{fmt(act.total_sum)} сом</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, fontSize: 12 }}>
            <div>{isRet ? 'Возвращает' : 'Передал'}: ______________<div style={{ fontSize: 10, color: '#98A0AE', marginTop: 4 }}>подпись</div></div>
            <div>Принял: ______________<div style={{ fontSize: 10, color: '#98A0AE', marginTop: 4 }}>подпись</div></div>
          </div>
        </div>
      </div>
    </div>
  )
}
