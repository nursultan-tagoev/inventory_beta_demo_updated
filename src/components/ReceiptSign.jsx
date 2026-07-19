import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, useToast } from './ui'
import { fmt } from '../lib/format'
import { uploadFile } from '../lib/requests'
import { printDoc } from '../lib/print'

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
  return <canvas ref={cv} style={{ width: '100%', height: 110, borderRadius: 11, border: '1px dashed var(--ink)', background: 'var(--sur)', touchAction: 'none', display: 'block' }} />
}

export default function ReceiptSign({ act, data, profile, onClose, onDone }) {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [pad, setPad] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scanFile, setScanFile] = useState(null)

  useEffect(() => { supabase.from('act_items').select('*').eq('act_id', act.id).then(({ data: d }) => setItems(d || [])) }, [act.id])

  const finish = async (path, method) => {
    const { error } = await supabase.from('acts').update({
      recipient_signed: true, recipient_sign_path: path, recipient_signed_at: new Date().toISOString(),
      status: method === 'scan' ? 'signed_manual' : 'signed',
    }).eq('id', act.id)
    if (error) return toast(error.message, 'error')
    if (act.request_id) await supabase.from('requests').update({ status: 'received' }).eq('id', act.request_id)
    toast('Получение подтверждено'); onDone()
  }

  const signScreen = async () => {
    const d = pad?.data()
    if (!d) return toast('Поставьте подпись', 'error')
    setBusy(true)
    try {
      const blob = await (await fetch(d)).blob()
      const path = await uploadFile('receipt', 'sig.png', blob)
      await finish(path, 'screen')
    } catch (e) { toast('Ошибка: ' + e.message, 'error') }
    setBusy(false)
  }
  const signScan = async () => {
    if (!scanFile) return toast('Приложите скан', 'error')
    setBusy(true)
    try { const path = await uploadFile('receipt', scanFile.name, scanFile); await finish(path, 'scan') }
    catch (e) { toast('Ошибка: ' + e.message, 'error') }
    setBusy(false)
  }

  const total = (items || []).reduce((a, it) => a + (it.sum || 0), 0)

  return (
    <div onClick={onClose} className="sheet-print-host" style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-up" style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: 'var(--sur)', borderRadius: '20px 20px 0 0', padding: '10px 18px calc(22px + env(safe-area-inset-bottom))' }}>
        <div className="no-print" style={{ width: 38, height: 4, background: 'var(--brd2)', borderRadius: 3, margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 13.5, fontWeight: 700 }}>{act.number}</span>
          <span style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 20, background: act.recipient_signed ? 'var(--gr-l)' : 'var(--am-l)', color: act.recipient_signed ? 'var(--gr-m)' : 'var(--am-m)', fontWeight: 600 }}>
            {act.recipient_signed ? 'Получение подтверждено' : 'Ждёт вашей подписи'}
          </span>
        </div>

        <div style={{ padding: '11px 13px', background: 'var(--bg)', borderRadius: 10, fontSize: 12, lineHeight: 1.8, marginBottom: 13 }}>
          <div><span style={{ color: 'var(--tx3)' }}>Передал:</span> {act.giver_name || '—'}</div>
          <div><span style={{ color: 'var(--tx3)' }}>Принял:</span> {act.recipient_name || '—'}</div>
          {act.basis && <div><span style={{ color: 'var(--tx3)' }}>Основание:</span> {act.basis}</div>}
          {items === null ? <div style={{ color: 'var(--tx3)' }}>Загрузка…</div> : items.map((it) => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{it.name}</span><span className="mono">{it.qty} × {fmt(it.price)}</span>
            </div>
          ))}
          {total > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--brd)', fontWeight: 600 }}>
            <span>Итого</span><span className="mono">{fmt(total)} сом</span>
          </div>}
        </div>

        {act.recipient_signed ? (
          <div style={{ padding: '12px 14px', background: 'var(--gr-l)', borderRadius: 10, fontSize: 12.5, color: 'var(--gr-m)', textAlign: 'center' }}>
            Получение подтверждено {act.recipient_signed_at ? new Date(act.recipient_signed_at).toLocaleDateString('ru-RU') : ''}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>Подтвердите получение</div>
            <SignPad onRef={setPad} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--tx3)', margin: '6px 0 12px' }}>
              <span>Распишитесь пальцем или мышью</span>
              <button onClick={() => pad?.clear()} style={{ color: 'var(--ink)', fontSize: 11 }}>Очистить</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={signScreen} loading={busy} style={{ flex: 1, minHeight: 48 }}>✓ Подтвердить получение</Btn>
              <Btn v="secondary" onClick={() => printDoc('act-print')} style={{ minHeight: 48 }}>🖨</Btn>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 40, marginTop: 9, fontSize: 11, color: 'var(--tx3)', cursor: 'pointer' }}>
              {scanFile ? `✓ ${scanFile.name}` : 'Или приложить подписанный документ'}
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setScanFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>
            {scanFile && <Btn v="secondary" onClick={signScan} loading={busy} style={{ width: '100%', minHeight: 44, marginTop: 8 }}>Подтвердить документом</Btn>}
          </>
        )}

        <Btn v="secondary" onClick={onClose} style={{ width: '100%', minHeight: 44, marginTop: 10 }}>Закрыть</Btn>
      </div>
    </div>
  )
}
