import { useState, useRef, useEffect } from 'react'
import { Btn, useToast } from './ui'
import { fmt } from '../lib/format'
import { createAct } from '../lib/acts'

function SignPad({ label, onRef }) {
  const ref = useRef(null); const draw = useRef(false); const [signed, setSigned] = useState(false)
  useEffect(() => { const c = ref.current; if (!c?.getContext) return; const x = c.getContext('2d'); if (!x) return; const w = c.offsetWidth || 260; c.width = w * 2; c.height = 90 * 2; x.scale(2, 2); x.lineWidth = 2; x.lineCap = 'round'; x.strokeStyle = '#14171D'; if (onRef) onRef(() => (signed ? c.toDataURL('image/png') : null)) }, [signed])
  const P = (e) => { const r = ref.current.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return [t.clientX - r.left, t.clientY - r.top] }
  const d = (e) => { const x = ref.current.getContext('2d'); if (!x) return; draw.current = true; x.beginPath(); const p = P(e); x.moveTo(p[0], p[1]) }
  const m = (e) => { if (!draw.current) return; if (e.cancelable) e.preventDefault(); const x = ref.current.getContext('2d'); const p = P(e); x.lineTo(p[0], p[1]); x.stroke(); setSigned(true) }
  const clr = () => { const c = ref.current; c.getContext('2d')?.clearRect(0, 0, c.width, c.height); setSigned(false) }
  return <div><div style={{ border: '1px dashed var(--brd2)', borderRadius: 8, background: 'var(--sur)' }}><canvas ref={ref} onMouseDown={d} onMouseMove={m} onMouseUp={() => (draw.current = false)} onMouseLeave={() => (draw.current = false)} onTouchStart={d} onTouchMove={m} onTouchEnd={() => (draw.current = false)} style={{ width: '100%', height: 90, display: 'block', touchAction: 'none', cursor: 'crosshair' }} /></div><div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span style={{ fontSize: 11, color: 'var(--tx3)' }}>{label}{signed ? ' · подписано' : ''}</span><button onClick={clr} style={{ fontSize: 11, color: 'var(--tx3)' }}>очистить</button></div></div>
}

export default function ActModal({ init, profile, onClose, onSaved }) {
  const toast = useToast()
  const today = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
  const isRet = init.type === 'return'
  const [org, setOrg] = useState('«Наименование банка» · Отдел маркетинга')
  const [branch, setBranch] = useState(init.branchName || 'Центральный филиал')
  const [giver, setGiver] = useState('[МОЛ — Ф.И.О., должность]')
  const [recv, setRecv] = useState(init.recipient || '')
  const [basis, setBasis] = useState(init.purpose ? 'Цель: ' + init.purpose : 'Служебная записка № ___')
  const [showInv, setShowInv] = useState(true)
  const [mode, setMode] = useState('e')
  const [rows, setRows] = useState(init.items.map((it) => ({ name: it.name, sku: it.sku || '', inv: '', unit: 'шт', qty: it.qty, price: it.price || 0, cond: 'новое', product_id: it.product_id, warehouse_id: it.warehouse_id })))
  const [scan, setScan] = useState(null)
  const [savedNo, setSavedNo] = useState(null)
  const [saving, setSaving] = useState(false)
  const sigG = useRef(null), sigR = useRef(null)
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const total = rows.reduce((a, r) => a + (+r.qty || 0) * (+r.price || 0), 0)
  const totalQty = rows.reduce((a, r) => a + (+r.qty || 0), 0)

  const save = async () => {
    setSaving(true)
    try {
      const res = await createAct({
        act: { type: isRet ? 'return' : 'out', act_date: new Date().toISOString().slice(0, 10), recipient_id: init.recipient_id || null, recipient_name: recv, giver_name: giver, basis, total_sum: total, sign_mode: mode === 'e' ? 'electronic' : 'manual', branch_id: init.branch_id || null, source_act_id: init.source_act_id || null, created_by: profile.id },
        items: rows, sigGiver: sigG.current?.() || null, sigRecipient: sigR.current?.() || null, scanFile: scan,
      })
      setSavedNo(res.number); toast('Акт ' + res.number + ' сохранён'); onSaved?.()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  return (
    <div className="no-print" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(3px)', overflow: 'auto', padding: '24px 12px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setShowInv((v) => !v)} style={{ height: 34, padding: '0 13px', borderRadius: 9, border: `1px solid ${showInv ? 'var(--ink)' : 'var(--brd2)'}`, background: showInv ? 'var(--ink-l)' : 'var(--sur)', color: showInv ? 'var(--ink)' : 'var(--tx2)', fontSize: 12.5, fontWeight: 600 }}>Инв. №</button>
          <div style={{ display: 'inline-flex', background: 'var(--sur2)', borderRadius: 9, padding: 3 }}>
            {[['e', 'Эл. подпись'], ['m', 'Ручная']].map(([v, l]) => <button key={v} onClick={() => setMode(v)} style={{ height: 28, padding: '0 12px', borderRadius: 7, fontSize: 12, fontWeight: mode === v ? 600 : 400, background: mode === v ? 'var(--sur)' : 'transparent', color: mode === v ? 'var(--tx)' : 'var(--tx2)' }}>{l}</button>)}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn v="secondary" size="sm" onClick={() => window.print()}>🖨 Печать / PDF</Btn>
            <Btn size="sm" onClick={save} loading={saving}>Сохранить акт</Btn>
            <Btn v="secondary" size="sm" onClick={onClose}>Закрыть</Btn>
          </div>
        </div>

        <div id="act-print" style={{ background: '#fff', color: '#14171D', borderRadius: 8, padding: '46px 54px', boxShadow: 'var(--sh3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <input className="act-in" value={org} onChange={(e) => setOrg(e.target.value)} style={{ width: 320, fontSize: 12, color: '#5A6472' }} />
            <div style={{ textAlign: 'right', fontSize: 12, color: '#5A6472' }}>Акт № <b className="mono" style={{ color: '#14171D' }}>{savedNo || (isRet ? 'АЗ' : 'АВ') + '-…'}</b><br />от {today}</div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #14171D' }} />
          <div style={{ textAlign: 'center', margin: '18px 0 4px' }}>
            <div className="ff" style={{ fontSize: 25 }}>Акт приёма-передачи</div>
            <div style={{ fontSize: 13, color: '#5A6472' }}>товарно-материальных ценностей · {isRet ? 'возврат' : 'выдача'}</div>
          </div>
          <div style={{ textAlign: 'center', marginBottom: 14 }}><input className="act-in" value={branch} onChange={(e) => setBranch(e.target.value)} style={{ width: '55%', fontSize: 12.5, color: '#5A6472', textAlign: 'center' }} /></div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, fontSize: 13, marginBottom: 6 }}>
            <div><div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#98A0AE' }}>{isRet ? 'Возвращает' : 'Передал (МОЛ)'}</div><input className="act-in" value={isRet ? recv : giver} onChange={(e) => (isRet ? setRecv : setGiver)(e.target.value)} style={{ width: '100%' }} /></div>
            <div><div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#98A0AE' }}>{isRet ? 'Принял' : 'Принял'}</div><input className="act-in" value={isRet ? giver : recv} onChange={(e) => (isRet ? setGiver : setRecv)(e.target.value)} style={{ width: '100%' }} /></div>
          </div>
          <div style={{ fontSize: 12.5, color: '#5A6472', margin: '6px 0' }}>Основание: <input className="act-in" value={basis} onChange={(e) => setBasis(e.target.value)} style={{ width: '70%' }} /></div>

          <table className="act-tbl">
            <thead><tr><th style={{ width: 24 }}>№</th><th>Наименование</th><th style={{ width: 70 }}>Артикул</th>{showInv && <th style={{ width: 88 }}>Инв. №</th>}<th style={{ width: 40 }}>Ед.</th><th style={{ width: 52, textAlign: 'right' }}>Кол-во</th><th style={{ width: 72, textAlign: 'right' }}>Цена</th><th style={{ width: 82, textAlign: 'right' }}>Сумма</th><th style={{ width: 70 }}>Сост.</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>
              <td style={{ textAlign: 'center' }}>{i + 1}</td>
              <td><input value={r.name} onChange={(e) => setRow(i, 'name', e.target.value)} /></td>
              <td><input value={r.sku} onChange={(e) => setRow(i, 'sku', e.target.value)} /></td>
              {showInv && <td><input value={r.inv} placeholder="—" onChange={(e) => setRow(i, 'inv', e.target.value)} /></td>}
              <td><input value={r.unit} onChange={(e) => setRow(i, 'unit', e.target.value)} /></td>
              <td className="mono" style={{ textAlign: 'right' }}><input value={r.qty} onChange={(e) => setRow(i, 'qty', e.target.value)} style={{ textAlign: 'right' }} /></td>
              <td className="mono" style={{ textAlign: 'right' }}><input value={r.price} onChange={(e) => setRow(i, 'price', e.target.value)} style={{ textAlign: 'right' }} /></td>
              <td className="mono" style={{ textAlign: 'right' }}>{fmt((+r.qty || 0) * (+r.price || 0))}</td>
              <td><input value={r.cond} onChange={(e) => setRow(i, 'cond', e.target.value)} /></td>
            </tr>)}</tbody>
          </table>
          <div style={{ textAlign: 'right', fontSize: 13, marginTop: 2 }}>Итого: <b className="mono">{rows.length}</b> поз., <b className="mono">{totalQty}</b> ед., на сумму <b className="mono">{fmt(total)} сом</b></div>

          <div style={{ marginTop: 24 }}>
            {mode === 'e'
              ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }}>
                <div><div style={{ fontSize: 12, color: '#5A6472', marginBottom: 6 }}>{isRet ? 'Возвращает' : 'Передал'}: <b>{isRet ? recv : giver}</b></div><SignPad label="Подпись" onRef={(fn) => (sigG.current = fn)} /></div>
                <div><div style={{ fontSize: 12, color: '#5A6472', marginBottom: 6 }}>Принял: <b>{isRet ? giver : recv}</b></div><SignPad label="Подпись" onRef={(fn) => (sigR.current = fn)} /></div>
              </div>
              : <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26, marginBottom: 12 }}>
                  <div style={{ fontSize: 13 }}>{isRet ? 'Возвращает' : 'Передал'}: <b>{isRet ? recv : giver}</b><div style={{ borderBottom: '1px solid #14171D', height: 32, marginTop: 8 }} /><div style={{ fontSize: 10, color: '#98A0AE' }}>подпись / дата</div></div>
                  <div style={{ fontSize: 13 }}>Принял: <b>{isRet ? giver : recv}</b><div style={{ borderBottom: '1px solid #14171D', height: 32, marginTop: 8 }} /><div style={{ fontSize: 10, color: '#98A0AE' }}>подпись / дата</div></div>
                </div>
                <div className="no-print" style={{ fontSize: 12, color: '#5A6472', padding: '10px 12px', background: '#F6F7F9', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>Скачайте PDF, подпишите и загрузите скан:</span>
                  <label style={{ cursor: 'pointer', padding: '6px 12px', border: '1px solid #CBD1DA', borderRadius: 8, fontWeight: 600 }}>Выбрать файл<input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => setScan(e.target.files?.[0] || null)} /></label>
                  {scan && <span style={{ color: '#0E9E72', fontWeight: 600 }}>✓ {scan.name}</span>}
                </div>
              </div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, fontSize: 10.5, color: '#98A0AE' }}><span>М.П.</span><span>{savedNo ? 'Сохранён: ' + savedNo : 'Черновик — нажмите «Сохранить акт»'}</span></div>
        </div>
      </div>
    </div>
  )
}
