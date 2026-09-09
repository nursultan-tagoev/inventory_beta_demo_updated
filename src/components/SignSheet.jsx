import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, useToast } from './ui'
import { fmt } from '../lib/format'
import { openFile } from '../lib/requests'
import { signersOf, currentSigner, signOnScreen, signByScan, declineSign, revokeSign, issueByAct } from '../lib/signing'

/* Холст для росчерка */
function SignPad({ onRef }) {
  const cv = useRef(null)
  useEffect(() => {
    const c = cv.current; if (!c) return
    const dpr = window.devicePixelRatio || 1
    const r = c.getBoundingClientRect()
    c.width = r.width * dpr; c.height = r.height * dpr
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#4B45E4'
    let drawing = false, empty = true
    const pos = (e) => { const b = c.getBoundingClientRect(); const t = e.touches?.[0] || e; return [t.clientX - b.left, t.clientY - b.top] }
    const start = (e) => { e.preventDefault(); drawing = true; empty = false; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y) }
    const move = (e) => { if (!drawing) return; e.preventDefault(); const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke() }
    const end = () => { drawing = false }
    c.addEventListener('mousedown', start); c.addEventListener('mousemove', move); window.addEventListener('mouseup', end)
    c.addEventListener('touchstart', start, { passive: false }); c.addEventListener('touchmove', move, { passive: false }); c.addEventListener('touchend', end)
    onRef({ data: () => empty ? null : c.toDataURL('image/png'), clear: () => { ctx.clearRect(0, 0, c.width, c.height); empty = true } })
    return () => { window.removeEventListener('mouseup', end) }
  }, [])
  return <canvas ref={cv} style={{ width: '100%', height: 130, borderRadius: 11, border: '1px dashed var(--ink)', background: 'var(--sur)', touchAction: 'none', display: 'block' }} />
}

export default function SignSheet({ act, data, profile, onClose, onDone }) {
  const toast = useToast()
  const { actSigners, products } = data
  const [items, setItems] = useState(null)
  const [pad, setPad] = useState(null)
  const [busy, setBusy] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [scanFile, setScanFile] = useState(null)

  useEffect(() => { supabase.from('act_items').select('*').eq('act_id', act.id).then(({ data: d }) => setItems(d || [])) }, [act.id])

  const chain = signersOf(actSigners, act.id)
  const cur = currentSigner(chain)
  const isMyTurn = cur && cur.in_system && cur.user_id === profile.id
  const isAdminTurn = cur && ['admin', 'warehouse'].includes(profile.role)
  const isExternal = cur && !cur.in_system
  const mySigned = chain.find((s) => s.user_id === profile.id && s.status === 'signed')
  const allSigned = chain.length > 0 && chain.every((s) => s.status === 'signed')

  const finish = async () => {
    // после подписи последнего — проводим выдачу
    const fresh = await supabase.from('act_signers').select('*').eq('act_id', act.id)
    const done = (fresh.data || []).every((s) => s.status === 'signed')
    if (done && !act.issued) {
      const { data: its } = await supabase.from('act_items').select('*').eq('act_id', act.id)
      const { error } = await issueByAct(act, its || [], profile.id)
      if (error) return toast(error, 'error')
      toast('Товар выдан — акт закрыт')
    }
    onDone()
  }

  const doSign = async () => {
    const d = pad?.data()
    if (!d) return toast('Поставьте подпись', 'error')
    setBusy(true)
    const { error } = await signOnScreen(cur, d, profile.id)
    setBusy(false)
    if (error) return toast(error, 'error')
    toast('Подписано'); finish()
  }
  const doScan = async () => {
    if (!scanFile) return toast('Приложите скан', 'error')
    setBusy(true)
    const { error } = await signByScan(cur, scanFile, profile.id)
    setBusy(false)
    if (error) return toast(error, 'error')
    toast('Подпись приложена'); finish()
  }
  const doDecline = async () => {
    if (!reason.trim()) return toast('Укажите причину', 'error')
    setBusy(true)
    const { error } = await declineSign(cur, reason, act.id)
    setBusy(false)
    if (error) return toast(error, 'error')
    toast('Отказ зафиксирован — выдачи не будет'); onDone()
  }
  const doRevoke = async () => {
    setBusy(true); const { error } = await revokeSign(mySigned); setBusy(false)
    if (error) return toast(error, 'error')
    toast('Подпись отозвана'); onDone()
  }

  const dot = (s) => {
    const st = s.status === 'signed' ? ['var(--gr)', '#fff', '✓'] : s.status === 'declined' ? ['var(--rd)', '#fff', '×']
      : (cur && s.id === cur.id) ? ['var(--ink)', '#fff', ''] : ['var(--sur2)', 'var(--tx3)', '']
    return <div style={{ width: 26, height: 26, borderRadius: '50%', background: st[0], color: st[1], display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, border: st[0] === 'var(--sur2)' ? '1px solid var(--brd2)' : 'none' }}>{st[2]}</div>
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-up" style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: 'var(--sur)', borderRadius: '20px 20px 0 0', padding: '10px 18px calc(22px + env(safe-area-inset-bottom))' }}>
        <div style={{ width: 38, height: 4, background: 'var(--brd2)', borderRadius: 3, margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 13.5, fontWeight: 700 }}>{act.number}</span>
          <span style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 20, background: allSigned ? 'var(--gr-l)' : act.declined ? 'var(--rd-l)' : 'var(--am-l)', color: allSigned ? 'var(--gr-m)' : act.declined ? 'var(--rd-m)' : 'var(--am-m)', fontWeight: 600 }}>
            {act.declined ? 'Отказ' : allSigned ? 'Подписан' : `Подписей ${chain.filter((s) => s.status === 'signed').length} из ${chain.length}`}
          </span>
        </div>

        {/* Позиции */}
        <div style={{ padding: '11px 13px', background: 'var(--bg)', borderRadius: 10, fontSize: 12, marginBottom: 13 }}>
          {items === null ? <div style={{ color: 'var(--tx3)' }}>Загрузка…</div> : items.map((it) => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span>{it.name}</span><span className="mono">{it.qty} × {fmt(it.price)}</span>
            </div>
          ))}
          {act.basis && <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid var(--brd)', color: 'var(--tx3)' }}>Основание: {act.basis}</div>}
        </div>

        {/* Цепочка */}
        <div style={{ marginBottom: 14 }}>
          {chain.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', gap: 11 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {dot(s)}
                {i < chain.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 16, background: s.status === 'signed' ? 'var(--gr)' : 'var(--brd)' }} />}
              </div>
              <div style={{ paddingBottom: i < chain.length - 1 ? 10 : 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.signer_name || '—'}</span>
                  {!s.in_system && <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 20, background: 'var(--am-l)', color: 'var(--am-m)' }}>вне системы</span>}
                  {cur && s.id === cur.id && <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 20, background: 'var(--ink-l)', color: 'var(--ink)' }}>сейчас</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                  {s.signer_role}
                  {s.status === 'signed' && s.signed_at ? ` · ${new Date(s.signed_at).toLocaleDateString('ru-RU')} · ${s.method === 'scan' ? 'скан' : 'на экране'}` : ''}
                  {s.status === 'declined' ? ` · отказ: ${s.decline_reason || ''}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Действия */}
        {act.declined && <div style={{ padding: '11px 13px', background: 'var(--rd-l)', borderRadius: 10, fontSize: 12, color: 'var(--rd-m)' }}>Отказ в подписи: {act.decline_reason}. Выдачи не будет, резерв снят.</div>}

        {!act.declined && !allSigned && (isMyTurn || (isAdminTurn && !isExternal && cur?.user_id === profile.id)) && !declining && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>Ваша подпись</div>
            <SignPad onRef={setPad} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--tx3)', margin: '6px 0 12px' }}>
              <span>Распишитесь пальцем или мышью</span>
              <button onClick={() => pad?.clear()} style={{ color: 'var(--ink)', fontSize: 11 }}>Очистить</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={doSign} loading={busy} style={{ flex: 1, minHeight: 48 }}>✓ Подписать</Btn>
              <Btn v="secondary" onClick={() => setDeclining(true)} style={{ minHeight: 48 }}>Отказать</Btn>
            </div>
          </>
        )}

        {!act.declined && !allSigned && isExternal && ['admin', 'warehouse'].includes(profile.role) && !declining && (
          <div className="card" style={{ padding: 14, background: 'var(--am-l)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--am-m)', marginBottom: 11 }}>
              <b>{cur.signer_name}</b> — вне системы. Распечатайте акт, получите подпись и приложите скан.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 13px', border: `1px dashed ${scanFile ? 'var(--gr)' : 'var(--brd2)'}`, borderRadius: 10, background: 'var(--sur)', cursor: 'pointer', marginBottom: 10 }}>
              <span style={{ fontSize: 17 }}>{scanFile ? '✓' : '📎'}</span>
              <span style={{ fontSize: 12.5 }}>{scanFile ? scanFile.name : 'Скан с подписью'}</span>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setScanFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={doScan} loading={busy} style={{ flex: 1, minHeight: 46 }}>Приложить</Btn>
              <Btn v="secondary" onClick={() => setDeclining(true)} style={{ minHeight: 46 }}>Отказ</Btn>
            </div>
          </div>
        )}

        {declining && (
          <div className="card" style={{ padding: 14, background: 'var(--rd-l)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--rd-m)', marginBottom: 9 }}>Причина отказа — обязательно</div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="Почему отказ…"
              style={{ width: '100%', minHeight: 70, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn v="danger" onClick={doDecline} loading={busy} style={{ flex: 1, minHeight: 46 }}>Отказать</Btn>
              <Btn v="secondary" onClick={() => setDeclining(false)} style={{ minHeight: 46 }}>Назад</Btn>
            </div>
          </div>
        )}

        {mySigned && !allSigned && !act.declined && (
          <Btn v="secondary" onClick={doRevoke} loading={busy} style={{ width: '100%', minHeight: 44, marginTop: 10 }}>Отозвать мою подпись</Btn>
        )}

        {allSigned && !act.declined && (
          <div style={{ padding: '12px 14px', background: 'var(--gr-l)', borderRadius: 10, fontSize: 12.5, color: 'var(--gr-m)', textAlign: 'center' }}>
            Все подписи собраны{act.issued ? ' · товар выдан' : ''}
          </div>
        )}

        <Btn v="secondary" onClick={onClose} style={{ width: '100%', minHeight: 44, marginTop: 10 }}>Закрыть</Btn>
      </div>
    </div>
  )
}
