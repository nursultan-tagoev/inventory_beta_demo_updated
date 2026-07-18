import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import SignSheet from '../components/SignSheet'
import { signersOf, currentSigner } from '../lib/signing'
import { Badge, Spin } from '../components/ui'
import { fmt } from '../lib/format'

const ST = { draft: ['Черновик', 'slate'], awaiting_sign: ['Ожидает подписи', 'amber'], signed: ['Подписан (эл.)', 'green'], signed_manual: ['Подписан (скан)', 'green'], annulled: ['Аннулирован', 'red'] }

export default function Acts({ data, profile }) {
  const [acts, setActs] = useState(null)
  const [f, setF] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const [signAct, setSignAct] = useState(null)
  const { recipients } = data
  const rName = (id, snap) => snap || recipients.find((r) => r.id === id)?.name || '—'

  const load = () => supabase.from('acts').select('*').order('created_at', { ascending: false }).then(({ data: d }) => setActs(d || []))
  useEffect(() => { load() }, [])

  const list = (acts || []).filter((a) => {
    if (f === 'annulled') return a.annulled
    if (f !== 'all' && a.type !== f) return false
    if (q && !((a.number || '').toLowerCase().includes(q.toLowerCase()) || (a.recipient_name || '').toLowerCase().includes(q.toLowerCase()))) return false
    return true
  })

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24, animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 20, fontWeight: 600 }}>Акты приёма-передачи</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по номеру или получателю…" style={{ marginLeft: 'auto', height: 38, padding: '0 14px', borderRadius: 11, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 14, minWidth: 240 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['all', 'Все'], ['out', 'Выдача'], ['return', 'Возврат'], ['annulled', 'Аннулированные']].map(([t, l]) => <button key={t} onClick={() => setF(t)} style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${f === t ? 'var(--ink)' : 'var(--brd)'}`, fontSize: 12, fontWeight: f === t ? 600 : 400, background: f === t ? 'var(--ink-l)' : 'var(--sur)', color: f === t ? 'var(--ink)' : 'var(--tx2)' }}>{l}</button>)}
      </div>

      {acts === null ? <div style={{ padding: 50, textAlign: 'center' }}><Spin /></div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {list.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Актов пока нет. Они появляются здесь после того, как вы сформируете акт при выдаче или возврате.</div>}
          {list.map((a, i) => (
            <div key={a.id} onClick={() => setOpen(a)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: i < list.length - 1 ? '1px solid var(--brd)' : 'none', cursor: 'pointer', opacity: a.annulled ? 0.55 : 1 }}>
              <div style={{ width: 40, textAlign: 'center', fontSize: 20 }}>🧾</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="mono" style={{ fontWeight: 600, fontSize: 13.5, textDecoration: a.annulled ? 'line-through' : 'none' }}>{a.number}</span><Badge color={a.type === 'return' ? 'purple' : 'ink'}>{a.type === 'return' ? 'Возврат' : 'Выдача'}</Badge></div>
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>{rName(a.recipient_id, a.recipient_name)} · {a.act_date}</div>
              </div>
              <div style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                {(() => { const ch = signersOf(data.actSigners, a.id); const cur = currentSigner(ch);
                  const mine = cur && ((cur.in_system && cur.user_id === profile?.id) || (!cur.in_system && profile?.role === 'admin'))
                  return mine ? <button onClick={() => setSignAct(a)} style={{ minHeight: 34, padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Подписать</button> : null })()}
                <div className="mono" style={{ fontWeight: 600, fontSize: 13.5 }}>{fmt(a.total_sum)} сом</div>
                <div style={{ marginTop: 3 }}><Badge color={ST[a.status]?.[1] || 'slate'}>{ST[a.status]?.[0] || a.status}</Badge></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {signAct && <SignSheet act={signAct} data={data} profile={profile} onClose={() => setSignAct(null)} onDone={() => { setSignAct(null); load() }} />}
      {open && <ActView act={open} data={data} onClose={() => setOpen(null)} onChanged={() => { load(); setOpen(null) }} />}
    </div>
  )
}

function SigProgress({ act, data }) {
  const chain = signersOf(data.actSigners, act.id)
  if (!chain.length) return null
  const cur = currentSigner(chain)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '4px 0 3px' }}>
      {chain.map((s, i) => (
        <span key={s.id} style={{ display: 'flex', alignItems: 'center' }} title={`${s.signer_name || ''} · ${s.signer_role || ''}`}>
          <span style={{ width: 15, height: 15, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 9, color: '#fff',
            background: s.status === 'signed' ? 'var(--gr)' : s.status === 'declined' ? 'var(--rd)' : (cur && s.id === cur.id) ? 'var(--ink)' : 'var(--sur2)',
            border: s.status === 'waiting' && (!cur || s.id !== cur.id) ? '1px solid var(--brd2)' : 'none' }}>{s.status === 'signed' ? '✓' : s.status === 'declined' ? '×' : ''}</span>
          {i < chain.length - 1 && <span style={{ width: 9, height: 2, background: s.status === 'signed' ? 'var(--gr)' : 'var(--brd)' }} />}
        </span>
      ))}
      <span style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--tx3)' }}>
        {cur ? `ждём: ${cur.signer_name || '—'}` : 'все подписали'}
      </span>
    </div>
  )
}

function ActView({ act, data, onClose, onChanged }) {
  const [items, setItems] = useState(null)
  const [annulling, setAnnulling] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.from('act_items').select('*').eq('act_id', act.id).then(({ data: d }) => setItems(d || [])) }, [act.id])
  const today = new Date(act.act_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
  const isRet = act.type === 'return'

  const doAnnul = async () => {
    if (!reason.trim()) return
    setBusy(true)
    const { error } = await supabase.rpc('annul_act', { p_act_id: act.id, p_reason: reason.trim() })
    setBusy(false)
    if (error) { alert('Ошибка: ' + error.message); return }
    onChanged && onChanged()
  }
  return (
    <div className="act-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(3px)', overflow: 'auto', padding: '24px 12px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 780, margin: '0 auto' }}>
        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'flex-end' }}>
          {!act.annulled && <button onClick={() => setAnnulling(!annulling)} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: '1px solid var(--rd)', background: 'var(--rd-l)', color: 'var(--rd-m)', fontSize: 12.5, fontWeight: 600 }}>Аннулировать</button>}
          <button onClick={() => window.print()} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 12.5, fontWeight: 600 }}>🖨 Печать / PDF</button>
          <button onClick={onClose} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 12.5, fontWeight: 600 }}>Закрыть</button>
        </div>
        {annulling && !act.annulled && (
          <div className="no-print" style={{ background: 'var(--sur)', border: '1.5px solid var(--rd)', borderRadius: 12, padding: 18, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span className="ff" style={{ fontSize: 15, fontWeight: 600, color: 'var(--rd-m)' }}>Аннулировать {act.number}?</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 12 }}>Акт будет помечен недействительным (номер сохранится). Связанная операция откатится — товар вернётся на склад.</div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина аннулирования (обязательно)…" autoFocus
              style={{ width: '100%', minHeight: 60, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--brd2)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={doAnnul} disabled={busy || !reason.trim()} style={{ flex: 1, height: 40, borderRadius: 9, border: 'none', background: 'var(--rd)', color: '#fff', fontSize: 13, fontWeight: 600, opacity: busy || !reason.trim() ? 0.6 : 1 }}>{busy ? 'Аннулирую…' : 'Аннулировать и вернуть остаток'}</button>
              <button onClick={() => setAnnulling(false)} style={{ height: 40, padding: '0 16px', borderRadius: 9, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 13 }}>Отмена</button>
            </div>
          </div>
        )}
        {act.annulled && <div className="no-print" style={{ background: 'var(--rd-l)', border: '1px solid var(--rd)', borderRadius: 10, padding: '11px 14px', marginBottom: 12, fontSize: 12.5, color: 'var(--rd-m)' }}>Акт аннулирован{act.annul_reason ? `: ${act.annul_reason}` : ''}. Остаток возвращён.</div>}
        <div id="act-print" style={{ background: '#fff', color: '#14171D', borderRadius: 8, padding: '28px 32px', boxShadow: 'var(--sh3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: '#5A6472' }}>Отдел маркетинга</div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#5A6472' }}>Акт № <b className="mono" style={{ color: '#14171D' }}>{act.number}</b><br />от {today}</div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #14171D' }} />
          <div style={{ textAlign: 'center', margin: '12px 0 10px' }}><div className="ff" style={{ fontSize: 21 }}>Акт приёма-передачи</div><div style={{ fontSize: 13, color: '#5A6472' }}>· {isRet ? 'возврат' : 'выдача'}</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12.5, marginBottom: 8 }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26, fontSize: 12, gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 3 }}>{isRet ? 'Возвращает' : 'Передал'}</div>
              <div style={{ borderBottom: '1px solid #14171D', height: 22 }} />
              <div style={{ fontSize: 10, color: '#98A0AE', marginTop: 3 }}>подпись · {isRet ? act.recipient_name : act.giver_name}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 3 }}>Принял</div>
              <div style={{ borderBottom: '1px solid #14171D', height: 22 }} />
              <div style={{ fontSize: 10, color: '#98A0AE', marginTop: 3 }}>подпись · {isRet ? act.giver_name : act.recipient_name}</div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: '#98A0AE', marginTop: 14 }}>Дата получения: ______________</div>
        </div>
      </div>
    </div>
  )
}
