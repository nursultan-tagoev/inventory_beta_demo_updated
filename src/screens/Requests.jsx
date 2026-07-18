import { useState, useMemo } from 'react'
import { Btn, Field, Input, Select, Badge, Sheet, useToast } from '../components/ui'
import { chainOf, freeAll, freeAt } from '../lib/data'
import { createRequest, updateRequest, setStatus, cancelRequest, closePartial, issueRequest, openFile } from '../lib/requests'
import { buildApprovalChain, approversOf, currentApprover, createApprovalChain } from '../lib/approval'
import ApprovalSheet from '../components/ApprovalSheet'

const ST = {
  new: ['На согласовании', 'amber'], approved: ['Согласована — к выдаче', 'green'],
  issued: ['Выдано', 'ink'], partial: ['Выдано частично', 'amber'],
  rejected: ['Отклонена', 'red'], revision: ['На переделке', 'amber'], received: ['Получено', 'ink'],
}
const KIND = { receive: 'на получение', issue: 'на выдачу' }
const PRIO = { low: ['Низкий', 'slate'], normal: ['Обычный', 'slate'], urgent: ['Срочно', 'red'] }

export default function Requests({ data, profile, can }) {
  const toast = useToast()
  const { requests, products, recipients, branches, warehouses, profiles, freeByWh, stockByWh, reload } = data
  const isAdmin = profile?.role === 'admin'
  const [tab, setTab] = useState(isAdmin ? 'toissue' : 'mine')
  const [form, setForm] = useState(false)
  const [editReq, setEditReq] = useState(null)
  const [issue, setIssue] = useState(null)
  const [apprSheet, setApprSheet] = useState(null)
  const [reject, setReject] = useState(null)

  const pName = (id) => products.find((p) => p.id === id)?.name || '—'
  const rName = (id) => recipients.find((r) => r.id === id)?.name || ''
  const bName = (id) => branches.find((b) => b.id === id)?.name || ''

  const mine = requests.filter((r) => r.author_id === profile?.id)
  // На исполнение — только согласованные
  const toIssue = requests.filter((r) => r.status === 'approved')
  // Мне на согласование
  const toApprove = requests.filter((r) => {
    const cur = currentApprover(approversOf(data.reqApprovers, r.id))
    if (r.status !== 'new' || !cur) return false
    if (cur.in_system) return cur.user_id === profile?.id
    // Внешний согласующий: подпись приносит автор заявки (он ходил), админ может помочь
    return r.author_id === profile?.id || profile?.role === 'admin'
  })
  const inApproval = requests.filter((r) => r.status === 'new')
  const list = tab === 'toissue' ? toIssue : tab === 'approve' ? toApprove : tab === 'inappr' ? inApproval
    : tab === 'all' ? requests : mine

  const act = async (fn, okMsg) => { const { error } = await fn; if (error) return toast(error, 'error'); toast(okMsg); reload() }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 90px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 21, fontWeight: 600 }}>Заявки</span>
        {isAdmin && toIssue.length > 0 && <Badge color="green">{toIssue.length} к выдаче</Badge>}
        {!isAdmin && <Btn size="sm" onClick={() => { setEditReq(null); setForm(true) }} style={{ marginLeft: 'auto' }}>＋ Новая заявка</Btn>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', overflowX: 'auto' }}>
        {(isAdmin
          ? [['toissue', `К выдаче${toIssue.length ? ' · ' + toIssue.length : ''}`], ['approve', `Мне на подпись${toApprove.length ? ' · ' + toApprove.length : ''}`], ['inappr', 'На согласовании'], ['all', 'Все']]
          : [['mine', 'Мои заявки'], ['approve', `Мне на согласование${toApprove.length ? ' · ' + toApprove.length : ''}`]]
        ).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ fontSize: 12.5, padding: '8px 14px', minHeight: 38, borderRadius: 20, border: 'none', whiteSpace: 'nowrap', background: tab === t ? 'var(--ink-l)' : 'var(--sur)', color: tab === t ? 'var(--ink)' : 'var(--tx3)', fontWeight: tab === t ? 600 : 500 }}>{l}</button>
        ))}
      </div>

      {!list.length && <div className="card" style={{ padding: 44, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>{isAdmin ? 'Заявок нет' : 'У вас пока нет заявок'}</div>
        <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{isAdmin ? 'Новые появятся здесь автоматически' : 'Создайте первую — укажите товары и основание'}</div>
      </div>}

      {list.map((r) => (
        <Card key={r.id} r={r} data={data} isAdmin={isAdmin} me={profile?.id} profile={profile} pName={pName} rName={rName} bName={bName}
          onIssue={() => setIssue(r)} onApprove={() => setApprSheet(r)} onReject={() => setReject({ req: r, mode: 'reject' })}
          onRevision={() => setReject({ req: r, mode: 'revision' })}
          onEdit={() => { setEditReq(r); setForm(true) }}
          onCancel={() => act(cancelRequest(r.id), 'Заявка отменена')}
          onReceived={() => act(setStatus(r.id, 'received'), 'Получение подтверждено')}
          onClosePartial={() => act(closePartial(r.id), 'Заявка завершена')} />
      ))}

      <Sheet open={form} onClose={() => setForm(false)} title={editReq ? 'Изменить заявку' : 'Новая заявка'}>
        {form && <RequestForm data={data} profile={profile} editReq={editReq} onDone={() => { setForm(false); reload() }} />}
      </Sheet>

      {issue && <IssueModal req={issue} data={data} profile={profile} onClose={() => setIssue(null)} onDone={() => { setIssue(null); reload() }} />}
      {apprSheet && <ApprovalSheet req={apprSheet} data={data} profile={profile} onClose={() => setApprSheet(null)} onDone={() => { setApprSheet(null); reload() }} />}
      {reject && <RejectModal info={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); reload() }} />}
    </div>
  )
}

function Card({ r, data, isAdmin, me, pName, rName, bName, profile, onIssue, onApprove, onReject, onRevision, onEdit, onCancel, onReceived, onClosePartial }) {
  const st = ST[r.status] || ST.new
  const mineOwn = r.author_id === me
  const canEdit = !isAdmin && mineOwn && ['new', 'revision'].includes(r.status)
  const canCancel = !isAdmin && mineOwn && r.status === 'new'
  const canReceive = !isAdmin && mineOwn && ['approved', 'partial'].includes(r.status)
  const isNew = r.status === 'new'
  const urgent = r.priority === 'urgent'

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 10, border: isAdmin && isNew ? '2px solid var(--ink)' : urgent ? '1px solid var(--rd)' : '1px solid var(--brd)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 190 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)' }}>№{r.id}</span>
            
            {urgent && <Badge color="red">Срочно</Badge>}
            <Badge color={st[1]}>{st[0]}</Badge>
            {r.basis_type === 'sz' ? <Badge color="green">СЗ</Badge> : <Badge color="amber">без СЗ</Badge>}
          </div>
          {r.items.map((it, i) => (
            <div key={i} style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
              {it.approved_qty != null && it.approved_qty !== it.qty
                ? <>{it.approved_qty} × {pName(it.product_id)} <span style={{ fontSize: 11, color: 'var(--am-m)' }}>(просили {it.qty})</span></>
                : <>{it.qty} × {pName(it.product_id)}</>}
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: 'var(--tx2)', marginTop: 5, lineHeight: 1.6 }}>
            {(() => { const author = (data.profiles || []).find((p) => p.id === r.author_id)
              return <>
                {author && <div><span style={{ color: 'var(--tx3)' }}>Запросил:</span> <b>{author.full_name || author.email}</b>{author.branch_id ? ` · ${bName(author.branch_id)}` : ''}</div>}
                {r.recipient_id && <div><span style={{ color: 'var(--tx3)' }}>Получатель:</span> {rName(r.recipient_id)}</div>}
                {r.purpose && <div><span style={{ color: 'var(--tx3)' }}>Цель:</span> {r.purpose}</div>}
              </> })()}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'right' }}>
          {new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </div>
      </div>

      {/* Основание */}
      {r.basis_type === 'sz' && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 9, fontSize: 11.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ color: 'var(--tx3)' }}>Документ:</span><span className="mono">{r.sz_number} {r.sz_date ? 'от ' + new Date(r.sz_date).toLocaleDateString('ru-RU') : ''}</span></div>
          {r.sz_approvers && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}><span style={{ color: 'var(--tx3)' }}>Согласовали:</span><span style={{ textAlign: 'right' }}>{r.sz_approvers}</span></div>}
          {r.sz_scan_path && <button onClick={async (e) => { e.stopPropagation(); const { error } = await openFile(r.sz_scan_path); if (error) alert(error) }}
            style={{ display: 'block', width: '100%', textAlign: 'center', minHeight: 40, border: '1px solid var(--ink)', borderRadius: 8, background: 'var(--ink-l)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600 }}>📄 Открыть служебную записку</button>}
        </div>
      )}
      {r.basis_type === 'none' && r.no_sz_reason && (
        <div style={{ marginTop: 9, padding: '8px 11px', background: 'var(--am-l)', borderRadius: 8, fontSize: 11.5, color: 'var(--am-m)' }}>«{r.no_sz_reason}»</div>
      )}
      {urgent && r.urgent_reason && (
        <div style={{ marginTop: 9, padding: '8px 11px', background: 'var(--rd-l)', borderRadius: 8, fontSize: 11.5, color: 'var(--rd-m)' }}>
          <b>Срочно:</b> {r.urgent_reason}{r.urgent_due ? ` · до ${new Date(r.urgent_due).toLocaleDateString('ru-RU')}` : ''}
        </div>
      )}
      {r.admin_comment && ['rejected', 'revision'].includes(r.status) && (
        <div style={{ marginTop: 9, padding: '8px 11px', background: r.status === 'rejected' ? 'var(--rd-l)' : 'var(--am-l)', borderRadius: 8, fontSize: 11.5, color: r.status === 'rejected' ? 'var(--rd-m)' : 'var(--am-m)' }}>
          <b>{r.status === 'rejected' ? 'Причина: ' : 'Комментарий: '}</b>{r.admin_comment}
        </div>
      )}

      {/* Цепочка согласования */}
      {(() => {
        const chain = approversOf(data.reqApprovers, r.id)
        if (!chain.length) return null
        const cur = currentApprover(chain)
        const okCount = chain.filter((a) => a.status === 'approved').length
        const act = (data.acts || []).find((a) => a.id === r.act_id)
        return (
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
              {chain.map((a, i) => (
                <span key={a.id} style={{ display: 'flex', alignItems: 'center' }} title={`${a.approver_name || ''} · ${a.approver_role || ''}`}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 9.5, color: '#fff',
                    background: a.status === 'approved' ? 'var(--gr)' : a.status === 'declined' ? 'var(--rd)' : (cur && a.id === cur.id) ? 'var(--ink)' : 'var(--sur2)',
                    border: a.status === 'waiting' && (!cur || a.id !== cur.id) ? '1px solid var(--brd2)' : 'none' }}>
                    {a.status === 'approved' ? '✓' : a.status === 'declined' ? '×' : ''}
                  </span>
                  {i < chain.length - 1 && <span style={{ width: 10, height: 2, background: a.status === 'approved' ? 'var(--gr)' : 'var(--brd)' }} />}
                </span>
              ))}
              <span style={{ marginLeft: 9, fontSize: 10.5, color: 'var(--tx3)' }}>
                {r.status === 'rejected' ? 'отказ' : act ? `выдано · акт ${act.number}` : cur ? `сейчас: ${cur.approver_name || '—'}` : `согласовано ${okCount} из ${chain.length}`}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Админ: выдать согласованную */}
      {isAdmin && r.status === 'approved' && (
        <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
          <Btn size="sm" onClick={onIssue} style={{ flex: 1, minWidth: 150, minHeight: 42 }}>📤 Выдать — оформить акт</Btn>
          <Btn size="sm" v="secondary" onClick={onReject} style={{ minHeight: 42 }}>Отклонить</Btn>
        </div>
      )}
      {/* Согласующий: моя очередь */}
      {(() => {
        const chain = approversOf(data.reqApprovers, r.id)
        const cur = currentApprover(chain)
        if (r.status !== 'new' || !cur) return null
        const mineTurn = cur.in_system ? cur.user_id === me : (r.author_id === me || isAdmin)
        if (!mineTurn) return null
        const isExt = !cur.in_system
        return (
          <div style={{ marginTop: 12 }}>
            {isExt && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--am-l)', borderRadius: 9, fontSize: 12, color: 'var(--am-m)', marginBottom: 9 }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <span>Распечатайте заявку, получите подпись <b>{cur.approver_name}</b> и приложите скан</span>
            </div>}
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <Btn size="sm" onClick={onApprove} style={{ flex: 1, minWidth: 160, minHeight: 44 }}>
                {isExt ? '📎 Приложить подпись' : '✓ Согласовать'}
              </Btn>
              <Btn size="sm" v="secondary" onClick={onRevision} style={{ minHeight: 44 }}>На переделку</Btn>
              <Btn size="sm" v="secondary" onClick={onReject} style={{ minHeight: 44 }}>Отклонить</Btn>
            </div>
          </div>
        )
      })()}
      {(canEdit || canCancel || canReceive) && (
        <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
          {canReceive && <Btn size="sm" onClick={onReceived} style={{ minHeight: 42 }}>Подтвердить получение</Btn>}
          {r.status === 'partial' && mineOwn && <Btn size="sm" v="secondary" onClick={onClosePartial} style={{ minHeight: 42 }}>Хватит, завершить</Btn>}
          {canEdit && <Btn size="sm" v="secondary" onClick={onEdit} style={{ minHeight: 42 }}>Изменить</Btn>}
          {canCancel && <Btn size="sm" v="secondary" onClick={onCancel} style={{ minHeight: 42 }}>Отменить</Btn>}
        </div>
      )}
    </div>
  )
}

function RequestForm({ data, profile, editReq, onDone }) {
  const toast = useToast()
  const { products, recipients, branches, freeByWh, stockByWh, directions, productTypes, campaigns } = data
  const kind = 'issue'
  const isAdminUser = profile?.role === 'admin'
  const [basis, setBasis] = useState(isAdminUser ? (editReq?.basis_type || 'sz') : 'sz')
  const [items, setItems] = useState(editReq?.items?.map((it) => ({ product_id: it.product_id, qty: it.qty })) || [{ product_id: '', qty: 1 }])
  const [f, setF] = useState({
    recipient_id: editReq?.recipient_id || '', branch_id: editReq?.branch_id || profile?.branch_id || '',
    purpose: editReq?.purpose || '', sz_number: editReq?.sz_number || '', sz_date: editReq?.sz_date || '',
    sz_approvers: editReq?.sz_approvers || '', no_sz_reason: editReq?.no_sz_reason || '',
    priority: editReq?.priority || 'normal', urgent_reason: editReq?.urgent_reason || '', urgent_due: editReq?.urgent_due || '',
  })
  const [scanFile, setScan] = useState(null)
  const [loading, setLoading] = useState(false)
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const setItem = (i, k, v) => setItems((s) => s.map((it, j) => j === i ? { ...it, [k]: v } : it))

  const shortage = items.map((it) => {
    if (!it.product_id) return null
    const free = freeAll(freeByWh, stockByWh, it.product_id)
    return it.qty > free ? { name: products.find((p) => p.id == it.product_id)?.name, free } : null
  }).filter(Boolean)

  const submit = async () => {
    if (shortage.length) return toast(`На складе только ${shortage[0].free} — ${shortage[0].name}`, 'error')
    setLoading(true)
    const payload = { kind, basis_type: basis, items, scanFile, ...f }
    const res = editReq ? await updateRequest(editReq.id, payload) : await createRequest(payload, profile.id)
    if (res.error) { setLoading(false); return toast(res.error, 'error') }
    // Цепочка согласования
    const reqId = res.data?.id || editReq?.id
    if (reqId) {
      const author = (data.profiles || []).find((p) => p.id === profile.id) || profile
      const chain = buildApprovalChain({ author, profiles: data.profiles, externals: data.externals, branchId: f.branch_id })
      if (!editReq) await createApprovalChain(reqId, chain)
    }
    setLoading(false)
    toast(editReq ? 'Заявка обновлена' : 'Заявка отправлена на согласование'); onDone()
  }

  const seg = (val, cur, set, label, color) => (
    <button key={val} onClick={() => set(val)} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: `1px solid ${cur === val ? (color || 'var(--ink)') : 'var(--brd2)'}`, background: cur === val ? (color ? color + '18' : 'var(--ink-l)') : 'var(--sur)', color: cur === val ? (color || 'var(--ink)') : 'var(--tx2)', fontSize: 12.5, fontWeight: cur === val ? 600 : 500 }}>{label}</button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--tx3)', marginBottom: 6 }}>Позиции</div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <Select value={it.product_id} onChange={(e) => setItem(i, 'product_id', e.target.value)}>
                <option value="">— товар —</option>
                {products.filter((p) => !p.archived).map((p) => {
                  const ch = chainOf(p, { directions, productTypes, campaigns })
                  return <option key={p.id} value={p.id}>{p.name}{ch ? ` · ${ch}` : ''}</option>
                })}
              </Select>
            </div>
            <Input type="number" inputMode="numeric" value={it.qty} onChange={(e) => setItem(i, 'qty', Number(e.target.value))} style={{ width: 76 }} />
            {items.length > 1 && <button onClick={() => setItems((s) => s.filter((_, j) => j !== i))} style={{ width: 42, minHeight: 44, borderRadius: 10, color: 'var(--tx3)', fontSize: 17 }}>×</button>}
          </div>
        ))}
        <button onClick={() => setItems((s) => [...s, { product_id: '', qty: 1 }])} style={{ width: '100%', minHeight: 42, border: '1px dashed var(--brd2)', borderRadius: 10, background: 'transparent', color: 'var(--ink)', fontSize: 12.5 }}>＋ Добавить позицию</button>
      </div>

      {shortage.length > 0 && <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--am-l)', borderRadius: 9, fontSize: 11.5, color: 'var(--am-m)' }}>
        ⚠️ {shortage[0].name} — свободно только {shortage[0].free}. Уменьшите количество.
      </div>}

      {isAdminUser
        ? <Field label="Основание"><div style={{ display: 'flex', gap: 8 }}>{seg('sz', basis, setBasis, 'По служебной записке')}{seg('none', basis, setBasis, 'Без СЗ')}</div></Field>
        : <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: 'var(--ink-l)', borderRadius: 10, fontSize: 11.5, color: 'var(--ink)' }}>
            <span style={{ fontSize: 15 }}>📄</span>
            <span>Заявка оформляется <b>по служебной записке</b> — заполните реквизиты согласования ниже.</span>
          </div>}

      {basis === 'sz' ? (
        <div className="card" style={{ padding: 14, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
            <Field label="Номер документа"><Input value={f.sz_number} onChange={(e) => up('sz_number', e.target.value)} placeholder="СЗ-2026-0142" /></Field>
            <Field label="Дата"><Input type="date" value={f.sz_date} onChange={(e) => up('sz_date', e.target.value)} /></Field>
          </div>
          <Field label="Кто согласовал"><Input value={f.sz_approvers} onChange={(e) => up('sz_approvers', e.target.value)} placeholder="ФИО и должности" /></Field>
          <Field label="Согласованная служебная записка">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 13px', border: `1px dashed ${scanFile ? 'var(--gr)' : 'var(--ink)'}`, borderRadius: 10, background: scanFile ? 'var(--gr-l)' : 'var(--ink-l)', cursor: 'pointer' }}>
              <span style={{ fontSize: 18 }}>{scanFile ? '✓' : '📎'}</span>
              <span style={{ fontSize: 12.5, color: scanFile ? 'var(--gr-m)' : 'var(--ink)', fontWeight: 600 }}>{scanFile ? scanFile.name : 'Приложить документ (PDF, JPG)'}</span>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setScan(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>
          </Field>
        </div>
      ) : (
        <Field label="Причина"><Input value={f.no_sz_reason} onChange={(e) => up('no_sz_reason', e.target.value)} placeholder="Для чего нужен товар" /></Field>
      )}

      <Field label="Приоритет"><div style={{ display: 'flex', gap: 8 }}>
        {seg('low', f.priority, (v) => up('priority', v), 'Низкий')}
        {seg('normal', f.priority, (v) => up('priority', v), 'Обычный')}
        {seg('urgent', f.priority, (v) => up('priority', v), 'Срочно', 'var(--rd)')}
      </div></Field>
      {f.priority === 'urgent' && (
        <div className="card" style={{ padding: 14, background: 'var(--rd-l)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Обоснование срочности"><Input value={f.urgent_reason} onChange={(e) => up('urgent_reason', e.target.value)} placeholder="Почему срочно" /></Field>
          <Field label="Нужно до"><Input type="date" value={f.urgent_due} onChange={(e) => up('urgent_due', e.target.value)} /></Field>
        </div>
      )}

      {kind === 'issue' && <Field label="Получатель">
        <Select value={f.recipient_id} onChange={(e) => { up('recipient_id', e.target.value); const rr = recipients.find((x) => x.id == e.target.value); if (rr?.branch_id) up('branch_id', rr.branch_id) }}>
          <option value="">— выбрать —</option>
          {recipients.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>}

      <Field label="Филиал-адресат">
        <Select value={f.branch_id} onChange={(e) => up('branch_id', e.target.value)}>
          <option value="">— выбрать —</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>

      <Field label="Цель / примечание"><Input value={f.purpose} onChange={(e) => up('purpose', e.target.value)} placeholder="Конференция, акция…" /></Field>

      {/* Предпросмотр маршрута */}
      {(() => {
        const author = (data.profiles || []).find((p) => p.id === profile.id) || profile
        const route = [...buildApprovalChain({ author, profiles: data.profiles, externals: data.externals, branchId: f.branch_id }),
          { name: 'Склад', role: 'исполнение' }]
        if (!route.length) return null
        return (
          <div style={{ padding: '11px 13px', background: 'var(--ink-l)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>🧭</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>Пойдёт на согласование</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--tx3)' }}>{route.length} {route.length === 1 ? 'звено' : route.length < 5 ? 'звена' : 'звеньев'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, fontSize: 11.5 }}>
              {route.map((r, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span title={r.role} style={{ padding: '3px 9px', borderRadius: 20, background: 'var(--sur)', border: '1px solid var(--brd)' }}>{(r.name || '').split(' ')[0]}</span>
                  {i < route.length - 1 && <span style={{ color: 'var(--tx3)' }}>→</span>}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      <Btn onClick={submit} loading={loading} disabled={shortage.length > 0} size="lg" style={{ minHeight: 48 }}>{editReq ? 'Сохранить и отправить' : 'Отправить заявку'}</Btn>
    </div>
  )
}

function IssueModal({ req, data, profile, onClose, onDone }) {
  const toast = useToast()
  const { warehouses, freeByWh, stockByWh, products, profiles, recipients, branches } = data
  const [wh, setWh] = useState(req.warehouse_id || warehouses[0]?.id || '')
  const [qty, setQty] = useState(Object.fromEntries(req.items.map((it) => [it.id, it.qty])))
  const [loading, setLoading] = useState(false)
  const pName = (id) => products.find((p) => p.id === id)?.name || '—'

  const go = async () => {
    setLoading(true)
    const itemsWithInfo = req.items.map((it) => {
      const p = products.find((x) => x.id === it.product_id)
      return { ...it, name: p?.name || '', sku: p?.sku || null, price: p?.price || 0 }
    })
    const { error } = await issueRequest({ ...req, items: itemsWithInfo }, wh, qty, freeByWh, profile)
    setLoading(false)
    if (error) return toast(error, 'error')
    toast('Выдано — акт сформирован'); onDone()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 460, padding: 20, maxHeight: '86vh', overflowY: 'auto' }}>
        <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Выдать по заявке №{req.id}</div>
        <div style={{ fontSize: 12.5, color: 'var(--tx3)', marginBottom: 16 }}>Заявка согласована. Товар спишется со склада, сформируется акт для подписи получателем.</div>

        <Field label="Склад-источник">
          <Select value={wh} onChange={(e) => setWh(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>

        <div style={{ margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)' }}>Сколько выдать</div>
          {req.items.map((it) => {
            const free = freeAt(freeByWh, stockByWh, it.product_id, wh)
            const give = Number(qty[it.id] ?? it.qty)
            const ok = give <= free + it.qty
            return (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: ok ? 'var(--bg)' : 'var(--rd-l)', borderRadius: 9 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{pName(it.product_id)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>просили {it.qty} · свободно {free}</div>
                </div>
                <Input type="number" inputMode="numeric" value={qty[it.id] ?? it.qty}
                  onChange={(e) => setQty({ ...qty, [it.id]: Number(e.target.value) })} style={{ width: 72, height: 40 }} />
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={go} loading={loading} style={{ flex: 1, minHeight: 46 }}>Выдать и оформить акт</Btn>
          <Btn v="secondary" onClick={onClose} style={{ minHeight: 46 }}>Отмена</Btn>
        </div>
      </div>
    </div>
  )
}

function RejectModal({ info, onClose, onDone }) {
  const toast = useToast()
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const isReject = info.mode === 'reject'
  const go = async () => {
    if (!comment.trim()) return toast('Комментарий обязателен', 'error')
    setLoading(true)
    const { error } = await setStatus(info.req.id, isReject ? 'rejected' : 'revision', comment.trim())
    setLoading(false)
    if (error) return toast(error, 'error')
    toast(isReject ? 'Заявка отклонена' : 'Отправлена на переделку'); onDone()
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 420, padding: 20 }}>
        <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{isReject ? 'Отклонить' : 'На переделку'} · №{info.req.id}</div>
        <div style={{ fontSize: 12.5, color: 'var(--tx3)', marginBottom: 14 }}>{isReject ? 'Укажите причину.' : 'Что нужно исправить?'}</div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} autoFocus placeholder="Комментарий (обязательно)…"
          style={{ width: '100%', minHeight: 84, padding: '11px 12px', borderRadius: 10, border: '1px solid var(--brd2)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Btn onClick={go} loading={loading} v={isReject ? 'danger' : 'primary'} style={{ flex: 1, minHeight: 46 }}>{isReject ? 'Отклонить' : 'На переделку'}</Btn>
          <Btn v="secondary" onClick={onClose} style={{ minHeight: 46 }}>Отмена</Btn>
        </div>
      </div>
    </div>
  )
}
