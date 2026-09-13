import { useState, useRef, useEffect } from 'react'
import { Btn, useToast } from './ui'
import { fmt } from '../lib/format'
import { createAct } from '../lib/acts'
import { supabase } from '../supabaseClient'
import ActSheet, { amountInWords } from './ActSheet'
import { printDoc } from '../lib/print'

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
  const isRet = init.type === 'return'

  /* Два режима: заполнение и предпросмотр бланка.
     Раньше бланк редактировали прямо на нём — на телефоне это разваливалось. */
  const [view, setView] = useState('form')

  // Справочник подразделений: компонент вызывается из разных мест и data не получает
  const [deps, setDeps] = useState([])
  useEffect(() => {
    supabase.from('departments').select('id,name,kind').eq('is_active', true)
      .order('kind').order('name').then(({ data }) => setDeps(data || []))
  }, [])

  const [f, setF] = useState({
    act_kind: isRet ? 'возврата товарно-материальных ценностей' : 'приёма-передачи товарно-материальных ценностей',
    city: 'г. Бишкек',
    approver_position: 'Главный бухгалтер',
    approver_name: '',
    giver_name: '', giver_position: '',
    giver2_name: '', giver2_position: '',
    recipient_name: init.recipient || '', recipient_position: '',
    recipient2_name: '', recipient2_position: '',
    basis: init.purpose ? 'Цель: ' + init.purpose : 'Служебная записка № ___',
  })
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const [rows, setRows] = useState(init.items.map((it) => ({
    name: it.name, sku: it.sku || '', unit: 'шт', qty: it.qty, price: it.price || 0,
    dept: init.dept || '', product_id: it.product_id, warehouse_id: it.warehouse_id,
  })))
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  const [mode, setMode] = useState('e')
  const [scan, setScan] = useState(null)
  const [savedNo, setSavedNo] = useState(null)
  const [saving, setSaving] = useState(false)
  const sigG = useRef(null), sigR = useRef(null)
  const sheetRef = useRef(null)

  const total = rows.reduce((a, r) => a + (+r.qty || 0) * (+r.price || 0), 0)

  // Предпросмотр собирается из тех же полей, что уйдут в базу
  const preview = {
    ...f, number: savedNo || (isRet ? 'АЗ' : 'АВ') + '-…',
    type: isRet ? 'return' : 'out', act_date: new Date().toISOString().slice(0, 10),
    total_sum: total,
  }
  const previewItems = rows.map((r, i) => ({
    id: i, name: r.name, sku: r.sku, dept: r.dept,
    qty: +r.qty || 0, price: +r.price || 0, sum: (+r.qty || 0) * (+r.price || 0),
  }))

  const save = async () => {
    if (savedNo) return toast('Акт ' + savedNo + ' уже сохранён', 'error')
    if (!f.giver_name.trim()) return toast('Укажите, кто передал', 'error')
    if (!f.recipient_name.trim()) return toast('Укажите, кто принял', 'error')
    setSaving(true)
    try {
      const res = await createAct({
        act: {
          type: isRet ? 'return' : 'out',
          act_date: new Date().toISOString().slice(0, 10),
          recipient_id: init.recipient_id || null,
          act_kind: f.act_kind, city: f.city,
          approver_position: f.approver_position || null, approver_name: f.approver_name || null,
          giver_name: f.giver_name, giver_position: f.giver_position || null,
          giver2_name: f.giver2_name || null, giver2_position: f.giver2_position || null,
          recipient_name: f.recipient_name, recipient_position: f.recipient_position || null,
          recipient2_name: f.recipient2_name || null, recipient2_position: f.recipient2_position || null,
          basis: f.basis, total_sum: total,
          sign_mode: mode === 'e' ? 'electronic' : 'manual',
          branch_id: init.branch_id || null, source_act_id: init.source_act_id || null,
          created_by: profile.id,
        },
        items: rows, sigGiver: sigG.current?.() || null, sigRecipient: sigR.current?.() || null, scanFile: scan,
      })
      setSavedNo(res.number)
      toast('Акт ' + res.number + ' сохранён')
      onSaved?.(res)
      setView('preview')
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  /* ── Оформление формы ── */
  const inp = {
    width: '100%', minHeight: 42, padding: '0 12px', borderRadius: 10,
    border: '1.5px solid var(--brd)', background: 'var(--sur)', fontSize: 14, color: 'var(--tx)',
  }
  const small = { ...inp, minHeight: 40, fontSize: 13 }
  const lbl = (t) => <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 4 }}>{t}</div>
  const Block = ({ title, extra, children }) => (
    <div style={{ padding: '14px 15px', borderBottom: '1px solid var(--brd)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: 'var(--tx3)' }}>{title}</span>
        {extra && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx3)' }}>{extra}</span>}
      </div>
      {children}
    </div>
  )

  // Карточка подписанта: ФИО и должность, обе правятся
  const Signer = ({ nameKey, posKey, removable }) => (
    <div style={{ border: '1px solid var(--brd)', borderRadius: 10, padding: 11, marginBottom: 9, position: 'relative' }}>
      <input value={f[nameKey]} onChange={(e) => up(nameKey, e.target.value)}
        placeholder="Ф.И.О." style={{ ...small, marginBottom: 8 }} />
      <input value={f[posKey]} onChange={(e) => up(posKey, e.target.value)}
        placeholder="должность" style={small} />
      {removable && (
        <button onClick={() => { up(nameKey, ''); up(posKey, '') }}
          style={{ position: 'absolute', top: 7, right: 7, width: 26, height: 26, color: 'var(--tx3)', fontSize: 15 }}>×</button>
      )}
    </div>
  )

  return (
    <div className="act-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(3px)', overflow: 'auto', padding: '24px 12px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: view === 'preview' ? 820 : 460, margin: '0 auto' }}>

        {savedNo && (
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', marginBottom: 12, borderRadius: 12, background: 'var(--gr-l)', border: '1px solid var(--gr)' }}>
            <span style={{ fontSize: 18 }}>✓</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--gr-m)' }}>Акт {savedNo} сохранён</div>
              <div style={{ fontSize: 11.5, color: 'var(--gr-m)' }}>Распечатайте, соберите подписи и загрузите скан в разделе «Акты»</div>
            </div>
          </div>
        )}

        {/* Переключатель режимов */}
        <div className="no-print" style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
          <button onClick={() => setView('form')} style={{ flex: 1, minHeight: 42, borderRadius: 10, fontSize: 13.5, fontWeight: 600,
            background: view === 'form' ? 'var(--ink)' : 'var(--sur)', color: view === 'form' ? '#fff' : 'var(--tx2)' }}>Заполнение</button>
          <button onClick={() => setView('preview')} style={{ flex: 1, minHeight: 42, borderRadius: 10, fontSize: 13.5, fontWeight: 600,
            background: view === 'preview' ? 'var(--ink)' : 'var(--sur)', color: view === 'preview' ? '#fff' : 'var(--tx2)' }}>Бланк</button>
          <button onClick={onClose} className="no-print" style={{ minHeight: 42, padding: '0 14px', borderRadius: 10, background: 'var(--sur)', color: 'var(--tx2)', fontSize: 13.5 }}>Закрыть</button>
        </div>

        {view === 'form' ? (
          <div className="card" style={{ overflow: 'hidden' }}>
            <Block title="ДОКУМЕНТ">
              {lbl('Вид акта')}
              <input value={f.act_kind} onChange={(e) => up('act_kind', e.target.value)} style={{ ...inp, marginBottom: 11 }} />
              <div style={{ display: 'flex', gap: 9 }}>
                <div style={{ flex: 1 }}>{lbl('Город')}<input value={f.city} onChange={(e) => up('city', e.target.value)} style={inp} /></div>
                <div style={{ flex: 1 }}>{lbl('Дата')}<input value={new Date().toLocaleDateString('ru-RU')} readOnly style={{ ...inp, color: 'var(--tx3)' }} /></div>
              </div>
            </Block>

            <Block title="УТВЕРЖДАЕТ">
              <input value={f.approver_position} onChange={(e) => up('approver_position', e.target.value)}
                placeholder="должность" style={{ ...inp, marginBottom: 9 }} />
              <input value={f.approver_name} onChange={(e) => up('approver_name', e.target.value)}
                placeholder="Ф.И.О." style={inp} />
            </Block>

            <Block title={isRet ? 'ВЕРНУЛИ' : 'ПЕРЕДАЛИ'} extra={f.giver2_name ? '2 из 2' : null}>
              <Signer nameKey="giver_name" posKey="giver_position" />
              {f.giver2_name || f.giver2_position
                ? <Signer nameKey="giver2_name" posKey="giver2_position" removable />
                : <button onClick={() => up('giver2_name', ' ')} style={{ width: '100%', minHeight: 42, borderRadius: 10, border: '1px dashed var(--brd)', background: 'var(--bg)', color: 'var(--tx3)', fontSize: 13 }}>＋ Ещё подписант</button>}
            </Block>

            <Block title="ПРИНЯЛИ" extra={f.recipient2_name ? '2 из 2' : null}>
              <Signer nameKey="recipient_name" posKey="recipient_position" />
              {f.recipient2_name || f.recipient2_position
                ? <Signer nameKey="recipient2_name" posKey="recipient2_position" removable />
                : <button onClick={() => up('recipient2_name', ' ')} style={{ width: '100%', minHeight: 42, borderRadius: 10, border: '1px dashed var(--brd)', background: 'var(--bg)', color: 'var(--tx3)', fontSize: 13 }}>＋ Ещё подписант</button>}
            </Block>

            <Block title="ОСНОВАНИЕ">
              <input value={f.basis} onChange={(e) => up('basis', e.target.value)} style={inp} />
            </Block>

            <Block title="ПОЗИЦИИ" extra={rows.length + ' шт'}>
              {rows.map((r, i) => (
                <div key={i} style={{ border: '1px solid var(--brd)', borderRadius: 10, padding: 11, marginBottom: 9 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35, marginBottom: 9 }}>{r.name}</div>
                  <Row label="Артикул">
                    <input value={r.sku} onChange={(e) => setRow(i, 'sku', e.target.value)} placeholder="—" style={{ ...small, width: '56%', textAlign: 'right' }} />
                  </Row>
                  <Row label="Подразделение">
                    <select value={r.dept} onChange={(e) => setRow(i, 'dept', e.target.value)} style={{ ...small, width: '56%', fontSize: 12 }}>
                      <option value="">—</option>
                      {deps.length === 0 && r.dept && <option value={r.dept}>{r.dept}</option>}
                      {deps.filter((d) => d.kind === 'dep').length > 0 && (
                        <optgroup label="Департаменты и управления">
                          {deps.filter((d) => d.kind === 'dep').map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                        </optgroup>
                      )}
                      {deps.filter((d) => d.kind === 'branch').length > 0 && (
                        <optgroup label="Филиалы">
                          {deps.filter((d) => d.kind === 'branch').map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </Row>
                  <Row label="Количество">
                    <input value={r.qty} onChange={(e) => setRow(i, 'qty', e.target.value)} style={{ ...small, width: 80, textAlign: 'right' }} />
                  </Row>
                  <Row label="Цена, сом">
                    <input value={r.price} onChange={(e) => setRow(i, 'price', e.target.value)} style={{ ...small, width: 80, textAlign: 'right' }} />
                  </Row>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 8, marginTop: 6, borderTop: '1px dashed var(--brd)' }}>
                    <span style={{ fontWeight: 500 }}>Сумма</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{fmt((+r.qty || 0) * (+r.price || 0))}</span>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 2px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>Итого</span>
                <span className="mono" style={{ fontSize: 17, fontWeight: 600 }}>{fmt(total)} сом</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.55, marginTop: 4 }}>{amountInWords(total)}</div>
            </Block>

            <Block title="ПОДПИСАНИЕ">
              <div style={{ display: 'flex', gap: 7, marginBottom: 11 }}>
                <button onClick={() => setMode('e')} style={{ flex: 1, minHeight: 40, borderRadius: 9, fontSize: 12.5,
                  background: mode === 'e' ? 'var(--ink-l)' : 'var(--sur)', color: mode === 'e' ? 'var(--ink)' : 'var(--tx3)', fontWeight: mode === 'e' ? 600 : 400 }}>На экране</button>
                <button onClick={() => setMode('m')} style={{ flex: 1, minHeight: 40, borderRadius: 9, fontSize: 12.5,
                  background: mode === 'm' ? 'var(--ink-l)' : 'var(--sur)', color: mode === 'm' ? 'var(--ink)' : 'var(--tx3)', fontWeight: mode === 'm' ? 600 : 400 }}>Скан с бумаги</button>
              </div>
              {mode === 'e' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  <SignPad label={isRet ? 'Вернул' : 'Передал'} onRef={(fn) => (sigG.current = fn)} />
                  <SignPad label="Принял" onRef={(fn) => (sigR.current = fn)} />
                </div>
              ) : (
                <label style={{ display: 'block', padding: '14px 12px', border: '1px dashed var(--brd)', borderRadius: 10, textAlign: 'center', cursor: 'pointer', fontSize: 12.5, color: 'var(--tx2)' }}>
                  {scan ? '✓ ' + scan.name : 'Распечатайте бланк, подпишите и загрузите скан'}
                  <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => setScan(e.target.files?.[0] || null)} />
                </label>
              )}
            </Block>

            <div style={{ padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Btn v="secondary" onClick={() => setView('preview')} style={{ minHeight: 46 }}>Предпросмотр бланка</Btn>
              {!savedNo && <Btn onClick={save} loading={saving} style={{ minHeight: 46 }}>Сохранить акт</Btn>}
            </div>
          </div>
        ) : (
          <>
            <div id="act-print" style={{ borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--sh3)' }}>
              <ActSheet act={preview} items={previewItems} innerRef={sheetRef} />
            </div>
            <div className="no-print" style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
              <Btn v="secondary" onClick={() => printDoc(sheetRef.current)} style={{ flex: 1, minWidth: 140, minHeight: 46 }}>Печать</Btn>
              {!savedNo && <Btn onClick={save} loading={saving} style={{ flex: 1, minWidth: 140, minHeight: 46 }}>Сохранить акт</Btn>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Строка «подпись — поле» внутри карточки позиции
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: 'var(--tx3)' }}>{label}</span>
      {children}
    </div>
  )
}
