import { useState, useRef, useEffect } from 'react'
import { Btn, useToast } from './ui'
import { fmt } from '../lib/format'
import { openFile } from '../lib/requests'
import { printDoc } from '../lib/print'
import { approversOf, currentApprover, approveOnScreen, approveByScan, declineApproval, revokeApproval } from '../lib/approval'

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
  return <canvas ref={cv} style={{ width: '100%', height: 128, borderRadius: 11, border: '1px dashed var(--ink)', background: 'var(--sur)', touchAction: 'none', display: 'block' }} />
}

export default function ApprovalSheet({ req, data, profile, onClose, onDone }) {
  const toast = useToast()
  const { products, recipients, branches, reqApprovers } = data
  const [pad, setPad] = useState(null)
  const [busy, setBusy] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [scanFile, setScanFile] = useState(null)
  const [eMode, setEMode] = useState(false)   // электронная подпись — скрытая опция

  const chain = approversOf(reqApprovers, req.id)
  const cur = currentApprover(chain)
  const isMyTurn = cur && cur.in_system && cur.user_id === profile.id
  const prevInSystem = cur ? chain.filter((a) => a.order_no < cur.order_no && a.in_system).slice(-1)[0] : null
  const isExternal = cur && !cur.in_system && ((prevInSystem && prevInSystem.user_id === profile.id) || req.author_id === profile.id || profile.role === 'admin')
  const mineDone = chain.find((a) => a.user_id === profile.id && a.status === 'approved')
  const pName = (id) => products.find((p) => p.id === id)?.name || '—'
  const rName = (id) => recipients.find((r) => r.id === id)?.name || ''
  const bName = (id) => branches.find((b) => b.id === id)?.name || ''

  const total = req.items.reduce((a, it) => {
    const p = products.find((x) => x.id === it.product_id)
    return a + it.qty * (p?.price || 0)
  }, 0)

  const doSign = async () => {
    const d = pad?.data()
    if (!d) return toast('Поставьте подпись', 'error')
    setBusy(true); const { error } = await approveOnScreen(cur, d, profile.id, req.id); setBusy(false)
    if (error) return toast(error, 'error')
    toast('Согласовано'); onDone()
  }
  const doScanSelf = async () => {
    if (!scanFile) return toast('Приложите подписанный документ', 'error')
    setBusy(true); const { error } = await approveByScan(cur, scanFile, profile.id, req.id); setBusy(false)
    if (error) return toast(error, 'error')
    toast('Согласовано'); onDone()
  }
  const doScan = async () => {
    if (!scanFile) return toast('Приложите скан', 'error')
    setBusy(true); const { error } = await approveByScan(cur, scanFile, profile.id, req.id); setBusy(false)
    if (error) return toast(error, 'error')
    toast('Подпись приложена'); onDone()
  }
  const doDecline = async () => {
    if (!reason.trim()) return toast('Укажите причину', 'error')
    setBusy(true); const { error } = await declineApproval(cur, reason, req.id); setBusy(false)
    if (error) return toast(error, 'error')
    toast('Отказ зафиксирован'); onDone()
  }
  const doRevoke = async () => {
    setBusy(true); const { error } = await revokeApproval(mineDone, req.id); setBusy(false)
    if (error) return toast(error, 'error')
    toast('Согласование отозвано'); onDone()
  }

  return (
    <div onClick={onClose} className="sheet-print-host" style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-up" style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: 'var(--sur)', borderRadius: '20px 20px 0 0', padding: '10px 18px calc(22px + env(safe-area-inset-bottom))' }}>
        <div className="no-print" style={{ width: 38, height: 4, background: 'var(--brd2)', borderRadius: 3, margin: '0 auto 14px' }} />

        {/* Печатный бланк заявки — виден только при печати */}
        <div id="req-print" style={{ display: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
            <div>Отдел маркетинга</div>
            <div style={{ textAlign: 'right' }}>Заявка № <b className="mono">{req.id}</b><br />от {new Date(req.created_at).toLocaleDateString('ru-RU')}</div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #14171D' }} />
          <div style={{ textAlign: 'center', margin: '12px 0 12px' }}>
            <div className="ff" style={{ fontSize: 20 }}>Заявка на выдачу</div>
            {req.priority === 'urgent' && <div style={{ fontSize: 12 }}>срочная</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12.5, marginBottom: 10 }}>
            <div><div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Запросил</div>
              {(data.profiles || []).find((p) => p.id === req.author_id)?.full_name || '—'}</div>
            <div><div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Филиал</div>{bName(req.branch_id) || '—'}</div>
            <div><div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Получатель</div>{rName(req.recipient_id) || '—'}</div>
            <div><div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Цель</div>{req.purpose || '—'}</div>
          </div>
          {req.basis_type === 'sz' && <div style={{ fontSize: 12, marginBottom: 8 }}>Основание: {req.sz_number} от {req.sz_date ? new Date(req.sz_date).toLocaleDateString('ru-RU') : '—'}{req.sz_approvers ? ` · согласовали: ${req.sz_approvers}` : ''}</div>}
          <table className="act-tbl"><thead><tr><th style={{ width: 26 }}>№</th><th>Наименование</th><th style={{ width: 60, textAlign: 'right' }}>Кол-во</th><th style={{ width: 80, textAlign: 'right' }}>Цена</th><th style={{ width: 90, textAlign: 'right' }}>Сумма</th></tr></thead>
            <tbody>{req.items.map((it, i) => {
              const pr = products.find((x) => x.id === it.product_id)
              return <tr key={i}><td style={{ textAlign: 'center' }}>{i + 1}</td><td>{pName(it.product_id)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{it.qty}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(pr?.price || 0)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt(it.qty * (pr?.price || 0))}</td></tr>
            })}</tbody>
          </table>
          <div style={{ textAlign: 'right', fontSize: 12.5, marginTop: 5 }}>Итого <b className="mono">{fmt(total)} сом</b></div>
          <div style={{ marginTop: 24, fontSize: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Согласование</div>
            {chain.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 20, marginBottom: 18, alignItems: 'flex-end' }}>
                <div style={{ width: 210 }}>{a.approver_role}<br /><b>{a.approver_name}</b></div>
                <div style={{ flex: 1, borderBottom: '1px solid #14171D', height: 20 }} />
                <div style={{ width: 90, borderBottom: '1px solid #14171D', height: 20 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 20, fontSize: 10, color: '#5A6472' }}>
              <div style={{ width: 210 }} /><div style={{ flex: 1 }}>подпись</div><div style={{ width: 90 }}>дата</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
          <span className="ff" style={{ fontSize: 17, fontWeight: 600 }}>Заявка №{req.id}</span>
          {req.priority === 'urgent' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--rd-l)', color: 'var(--rd-m)', fontWeight: 600 }}>Срочно</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 13 }}>
          {[rName(req.recipient_id), bName(req.branch_id), req.purpose].filter(Boolean).join(' · ')}
        </div>

        {/* Позиции */}
        <div style={{ padding: '11px 13px', background: 'var(--bg)', borderRadius: 10, fontSize: 12.5, marginBottom: 12 }}>
          {req.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span>{pName(it.product_id)}</span><span className="mono">{it.qty} шт</span>
            </div>
          ))}
          {total > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, paddingTop: 7, borderTop: '1px solid var(--brd)', fontWeight: 600 }}>
            <span>Итого</span><span className="mono">{fmt(total)} сом</span>
          </div>}
        </div>

        {/* Основание */}
        {req.basis_type === 'sz' && (
          <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, fontSize: 11.5, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ color: 'var(--tx3)' }}>Документ:</span><span className="mono">{req.sz_number}</span></div>
            {req.sz_approvers && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}><span style={{ color: 'var(--tx3)' }}>Согласовали:</span><span style={{ textAlign: 'right' }}>{req.sz_approvers}</span></div>}
            {req.sz_scan_path && <button onClick={async () => { const { error } = await openFile(req.sz_scan_path); if (error) toast(error, 'error') }}
              style={{ display: 'block', width: '100%', textAlign: 'center', minHeight: 42, border: '1px solid var(--ink)', borderRadius: 9, background: 'var(--ink-l)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600 }}>📄 Открыть служебную записку</button>}
          </div>
        )}
        {req.priority === 'urgent' && req.urgent_reason && (
          <div style={{ padding: '9px 12px', background: 'var(--rd-l)', borderRadius: 9, fontSize: 11.5, color: 'var(--rd-m)', marginBottom: 12 }}>
            <b>Срочно:</b> {req.urgent_reason}
          </div>
        )}

        {/* Цепочка */}
        <div style={{ marginBottom: 14 }}>
          {chain.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', gap: 11 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
                  background: a.status === 'approved' ? 'var(--gr)' : a.status === 'declined' ? 'var(--rd)' : (cur && a.id === cur.id) ? 'var(--ink)' : 'var(--sur2)',
                  border: a.status === 'waiting' && (!cur || a.id !== cur.id) ? '1px solid var(--brd2)' : 'none' }}>
                  {a.status === 'approved' ? '✓' : a.status === 'declined' ? '×' : ''}
                </div>
                {i < chain.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 16, background: a.status === 'approved' ? 'var(--gr)' : 'var(--brd)' }} />}
              </div>
              <div style={{ paddingBottom: i < chain.length - 1 ? 10 : 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{a.approver_name || '—'}</span>
                  {!a.in_system && <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 20, background: 'var(--am-l)', color: 'var(--am-m)' }}>вне системы</span>}
                  {cur && a.id === cur.id && <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 20, background: 'var(--ink-l)', color: 'var(--ink)' }}>сейчас</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                  {a.approver_role}
                  {a.status === 'approved' && a.acted_at ? ` · ${new Date(a.acted_at).toLocaleDateString('ru-RU')} · ${a.method === 'scan' ? 'скан' : 'на экране'}` : ''}
                  {a.status === 'declined' ? ` · отказ: ${a.decline_reason || ''}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Действия */}
        {isMyTurn && !declining && !eMode && (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)', marginBottom: 8 }}>Подписание документа</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', background: 'var(--bg)', borderRadius: 10, fontSize: 12, color: 'var(--tx2)', marginBottom: 11 }}>
              <span style={{ fontSize: 17 }}>🖨</span>
              <span>Распечатайте заявку, подпишите и приложите скан подписанного документа.</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '0 14px', border: `1px dashed ${scanFile ? 'var(--gr)' : 'var(--brd2)'}`, borderRadius: 11, background: scanFile ? 'var(--gr-l)' : 'var(--sur)', cursor: 'pointer', marginBottom: 11 }}>
              <span style={{ fontSize: 19 }}>{scanFile ? '✓' : '📎'}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: scanFile ? 'var(--gr-m)' : 'var(--tx2)' }}>{scanFile ? scanFile.name : 'Приложить подписанный документ'}</span>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setScanFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={doScanSelf} loading={busy} style={{ flex: 1, minHeight: 48 }}>✓ Согласовать</Btn>
              <Btn v="secondary" onClick={() => setDeclining(true)} style={{ minHeight: 48 }}>Отказать</Btn>
            </div>
            <button onClick={() => setEMode(true)} style={{ width: '100%', minHeight: 38, marginTop: 9, background: 'transparent', color: 'var(--tx3)', fontSize: 11 }}>
              Подписать электронно на экране
            </button>
          </>
        )}

        {isMyTurn && !declining && eMode && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)' }}>Электронная подпись</span>
              <button onClick={() => setEMode(false)} style={{ marginLeft: 'auto', color: 'var(--ink)', fontSize: 11 }}>← к бумажной</button>
            </div>
            <SignPad onRef={setPad} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--tx3)', margin: '6px 0 12px' }}>
              <span>Распишитесь пальцем или мышью</span>
              <button onClick={() => pad?.clear()} style={{ color: 'var(--ink)', fontSize: 11 }}>Очистить</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={doSign} loading={busy} style={{ flex: 1, minHeight: 48 }}>✓ Согласовать электронно</Btn>
              <Btn v="secondary" onClick={() => setDeclining(true)} style={{ minHeight: 48 }}>Отказать</Btn>
            </div>
          </>
        )}

        {isExternal && !declining && (
          <div className="card" style={{ padding: 14, background: 'var(--am-l)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--am-m)', marginBottom: 11 }}>
              <b>{cur.approver_name}</b> — вне системы. Распечатайте заявку, получите подпись и приложите скан.
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

        {mineDone && req.status === 'new' && (
          <Btn v="secondary" onClick={doRevoke} loading={busy} style={{ width: '100%', minHeight: 44, marginTop: 10 }}>Отозвать моё согласование</Btn>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Btn v="secondary" onClick={() => printDoc('req-print')} style={{ flex: 1, minHeight: 44 }}>🖨 Печать</Btn>
          <Btn v="secondary" onClick={onClose} style={{ flex: 1, minHeight: 44 }}>Закрыть</Btn>
        </div>
      </div>
    </div>
  )
}
