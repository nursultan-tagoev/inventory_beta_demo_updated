import { useState, useMemo } from 'react'
import { Btn, Field, Input, Select, Badge, Sheet, Confirm, useToast } from '../components/ui'
import { chainOf } from '../lib/data'
import { stockAll, stockAt } from '../lib/ops'
import { createRequest, updateRequest, setStatus, cancelRequest, approveRequest } from '../lib/requests'

const ST = {
  new: { l: 'Новая', c: 'amber' }, approved: { l: 'Одобрена', c: 'green' },
  rejected: { l: 'Отклонена', c: 'red' }, revision: { l: 'На переделке', c: 'amber' },
  received: { l: 'Получена', c: 'ink' },
}
const KIND = { receive: 'на получение', issue: 'на выдачу' }

export default function Requests({ data, profile, can }) {
  const toast = useToast()
  const { requests, products, recipients, branches, warehouses, stockByWh, directions, productTypes, campaigns, reload } = data
  const isAdmin = profile?.role === 'admin'
  const [tab, setTab] = useState(isAdmin ? 'incoming' : 'mine')
  const [form, setForm] = useState(false)
  const [editReq, setEditReq] = useState(null)
  const [approve, setApprove] = useState(null)   // заявка на одобрение
  const [reject, setReject] = useState(null)     // { req, mode: 'reject'|'revision' }

  const pName = (id) => products.find((p) => p.id === id)?.name || '—'
  const rName = (id) => recipients.find((r) => r.id === id)?.name || ''
  const bName = (id) => branches.find((b) => b.id === id)?.name || ''

  const mine = requests.filter((r) => r.author_id === profile?.id)
  const incoming = requests.filter((r) => r.status === 'new')
  const inWork = requests.filter((r) => ['approved', 'revision'].includes(r.status))

  const doCancel = async (r) => { const { error } = await cancelRequest(r.id); if (error) return toast(error, 'error'); toast('Заявка отменена'); reload() }
  const doReceived = async (r) => { const { error } = await setStatus(r.id, 'received'); if (error) return toast(error, 'error'); toast('Получение подтверждено'); reload() }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 21, fontWeight: 600 }}>Заявки</span>
        {isAdmin && incoming.length > 0 && <Badge color="ink">{incoming.length} новых</Badge>}
        {!isAdmin && <Btn size="sm" onClick={() => { setEditReq(null); setForm(true) }} style={{ marginLeft: 'auto' }}>＋ Новая заявка</Btn>}
      </div>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {(isAdmin ? [['incoming', `Новые${incoming.length ? ' · ' + incoming.length : ''}`], ['inwork', 'В работе'], ['all', 'Все']] : [['mine', 'Мои заявки']]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ fontSize: 12.5, padding: '7px 13px', borderRadius: 20, border: 'none', background: tab === t ? 'var(--ink-l)' : 'transparent', color: tab === t ? 'var(--ink)' : 'var(--tx3)', fontWeight: tab === t ? 600 : 500 }}>{l}</button>
        ))}
      </div>

      {/* Список */}
      {(() => {
        const list = tab === 'incoming' ? incoming : tab === 'inwork' ? inWork : tab === 'all' ? requests : mine
        if (!list.length) return <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>{isAdmin ? 'Нет заявок.' : 'У вас пока нет заявок. Создайте первую.'}</div>
        return list.map((r) => (
          <RequestCard key={r.id} r={r} isAdmin={isAdmin} me={profile?.id}
            pName={pName} rName={rName} bName={bName}
            onApprove={() => setApprove(r)} onReject={() => setReject({ req: r, mode: 'reject' })}
            onRevision={() => setReject({ req: r, mode: 'revision' })}
            onEdit={() => { setEditReq(r); setForm(true) }} onCancel={() => doCancel(r)} onReceived={() => doReceived(r)} />
        ))
      })()}

      {/* Форма создания/изменения */}
      <Sheet open={form} onClose={() => setForm(false)} title={editReq ? 'Изменить заявку' : 'Новая заявка'}>
        {form && <RequestForm data={data} profile={profile} editReq={editReq} onDone={() => { setForm(false); reload() }} />}
      </Sheet>

      {/* Одобрение — выбор склада */}
      {approve && <ApproveModal req={approve} data={data} profile={profile} onClose={() => setApprove(null)} onDone={() => { setApprove(null); reload() }} />}

      {/* Отклонение / переделка — комментарий */}
      {reject && <RejectModal info={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); reload() }} />}
    </div>
  )
}

function RequestCard({ r, isAdmin, me, pName, rName, bName, onApprove, onReject, onRevision, onEdit, onCancel, onReceived }) {
  const st = ST[r.status] || ST.new
  const canEdit = !isAdmin && r.author_id === me && ['new', 'revision'].includes(r.status)
  const canCancel = !isAdmin && r.author_id === me && r.status === 'new'
  const canReceive = !isAdmin && r.author_id === me && r.status === 'approved'
  const isNew = r.status === 'new'

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 10, border: isAdmin && isNew ? '1.5px solid var(--ink)' : '1px solid var(--brd)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--tx3)' }}>№{r.id}</span>
            <Badge color={r.kind === 'receive' ? 'purple' : 'ink'}>{KIND[r.kind]}</Badge>
            <Badge color={st.c}>{st.l}</Badge>
          </div>
          {r.items.map((it, i) => (
            <div key={i} style={{ fontSize: 13.5, fontWeight: 500 }}>{it.qty} × {pName(it.product_id)}</div>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 3 }}>
            {[r.recipient_id && rName(r.recipient_id), r.branch_id && bName(r.branch_id), r.purpose].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'right' }}>
          {new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}<br />
          {new Date(r.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {r.admin_comment && (r.status === 'rejected' || r.status === 'revision') && (
        <div style={{ marginTop: 9, padding: '8px 11px', background: r.status === 'rejected' ? 'var(--rd-l)' : 'var(--am-l)', borderRadius: 8, fontSize: 11.5, color: r.status === 'rejected' ? 'var(--rd-m)' : 'var(--am-m)' }}>
          <b>{r.status === 'rejected' ? 'Причина: ' : 'Комментарий: '}</b>{r.admin_comment}
        </div>
      )}

      {/* Действия админа */}
      {isAdmin && isNew && (
        <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
          <Btn size="sm" onClick={onApprove} style={{ flex: 1, minWidth: 150 }}>✓ Принять — создать выдачу</Btn>
          <Btn size="sm" v="secondary" onClick={onRevision}>На переделку</Btn>
          <Btn size="sm" v="secondary" onClick={onReject}>Отклонить</Btn>
        </div>
      )}
      {/* Действия заявителя */}
      {(canEdit || canCancel || canReceive) && (
        <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
          {canReceive && <Btn size="sm" onClick={onReceived}>Подтвердить получение</Btn>}
          {canEdit && <Btn size="sm" v="secondary" onClick={onEdit}>Изменить</Btn>}
          {canCancel && <Btn size="sm" v="secondary" onClick={onCancel}>Отменить</Btn>}
        </div>
      )}
    </div>
  )
}

function RequestForm({ data, profile, editReq, onDone }) {
  const toast = useToast()
  const { products, recipients, branches, warehouses, stockByWh, directions, productTypes, campaigns } = data
  const [kind, setKind] = useState(editReq?.kind || 'issue')
  const [items, setItems] = useState(editReq?.items?.map((it) => ({ product_id: it.product_id, qty: it.qty })) || [{ product_id: '', qty: 1 }])
  const [recipient_id, setRec] = useState(editReq?.recipient_id || '')
  const [branch_id, setBranch] = useState(editReq?.branch_id || '')
  const [purpose, setPurpose] = useState(editReq?.purpose || '')
  const [loading, setLoading] = useState(false)

  const setItem = (i, k, v) => setItems((s) => s.map((it, j) => j === i ? { ...it, [k]: v } : it))
  const addItem = () => setItems((s) => [...s, { product_id: '', qty: 1 }])
  const delItem = (i) => setItems((s) => s.filter((_, j) => j !== i))

  // Блокирующая подсказка: считаем общий остаток по всем складам
  const shortage = items.map((it) => {
    if (!it.product_id) return null
    const avail = stockAll(stockByWh, it.product_id)
    return it.qty > avail ? { name: products.find((p) => p.id == it.product_id)?.name, avail } : null
  }).filter(Boolean)

  const submit = async () => {
    if (shortage.length) return toast(`На складе только ${shortage[0].avail} — ${shortage[0].name}`, 'error')
    setLoading(true)
    const payload = { kind, items, recipient_id, branch_id, purpose }
    const { error } = editReq ? await updateRequest(editReq.id, payload) : await createRequest(payload, profile.id)
    setLoading(false)
    if (error) return toast(error, 'error')
    toast(editReq ? 'Заявка обновлена' : 'Заявка отправлена'); onDone()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Тип заявки">
        <div style={{ display: 'flex', gap: 8 }}>
          {[['issue', 'На выдачу'], ['receive', 'На получение']].map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} style={{ flex: 1, height: 40, borderRadius: 10, border: `1px solid ${kind === k ? 'var(--ink)' : 'var(--brd2)'}`, background: kind === k ? 'var(--ink-l)' : 'var(--sur)', color: kind === k ? 'var(--ink)' : 'var(--tx2)', fontSize: 12.5, fontWeight: kind === k ? 600 : 500 }}>{l}</button>
          ))}
        </div>
      </Field>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--tx3)', marginBottom: 6 }}>Позиции</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Select value={it.product_id} onChange={(e) => setItem(i, 'product_id', e.target.value)}>
                  <option value="">— товар —</option>
                  {products.filter((p) => !p.archived).map((p) => {
                    const ch = chainOf(p, { directions, productTypes, campaigns })
                    return <option key={p.id} value={p.id}>{p.name}{ch ? ` · ${ch}` : ''}</option>
                  })}
                </Select>
              </div>
              <Input type="number" value={it.qty} onChange={(e) => setItem(i, 'qty', Number(e.target.value))} style={{ width: 74 }} />
              {items.length > 1 && <button onClick={() => delItem(i)} style={{ width: 38, height: 38, borderRadius: 9, color: 'var(--tx3)', fontSize: 16 }}>×</button>}
            </div>
          ))}
        </div>
        <button onClick={addItem} style={{ width: '100%', height: 36, marginTop: 8, border: '1px dashed var(--brd2)', borderRadius: 9, background: 'transparent', color: 'var(--ink)', fontSize: 12 }}>＋ Добавить позицию</button>
      </div>

      {shortage.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--am-l)', borderRadius: 8, fontSize: 11.5, color: 'var(--am-m)' }}>
          ⚠️ {shortage[0].name} — на складе только {shortage[0].avail}. Уменьшите количество.
        </div>
      )}

      {kind === 'issue' && <Field label="Получатель">
        <Select value={recipient_id} onChange={(e) => { setRec(e.target.value); const rr = recipients.find((x) => x.id == e.target.value); if (rr?.branch_id) setBranch(rr.branch_id) }}>
          <option value="">— выбрать —</option>
          {recipients.map((r) => <option key={r.id} value={r.id}>{r.name}{r.branch_id ? ` (${branches.find((b) => b.id === r.branch_id)?.name || ''})` : ''}</option>)}
        </Select>
      </Field>}

      <Field label="Филиал-адресат">
        <Select value={branch_id} onChange={(e) => setBranch(e.target.value)}>
          <option value="">— выбрать филиал —</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>

      <Field label="Цель / примечание"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Конференция, акция…" /></Field>

      <Btn onClick={submit} loading={loading} disabled={shortage.length > 0} size="lg">{editReq ? 'Сохранить и отправить' : 'Отправить заявку'}</Btn>
    </div>
  )
}

function ApproveModal({ req, data, profile, onClose, onDone }) {
  const toast = useToast()
  const { warehouses, stockByWh, products } = data
  const [wh, setWh] = useState(warehouses[0]?.id || '')
  const [loading, setLoading] = useState(false)
  const pName = (id) => products.find((p) => p.id === id)?.name || '—'

  const go = async () => {
    setLoading(true)
    const { error } = await approveRequest(req, Number(wh), stockByWh, profile)
    setLoading(false)
    if (error) return toast(error, 'error')
    toast('Заявка одобрена — операция создана'); onDone()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 440, padding: 22 }}>
        <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Одобрить заявку №{req.id}</div>
        <div style={{ fontSize: 12.5, color: 'var(--tx3)', marginBottom: 16 }}>Будет создана выдача. Выберите склад-источник.</div>
        <Field label="Склад-источник">
          <Select value={wh} onChange={(e) => setWh(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>
        <div style={{ margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {req.items.map((it, i) => {
            const avail = (stockByWh?.[it.product_id]?.[Number(wh)]) || 0
            const ok = it.qty <= avail
            return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 10px', background: ok ? 'var(--gr-l)' : 'var(--rd-l)', borderRadius: 8, color: ok ? 'var(--gr-m)' : 'var(--rd-m)' }}>
              <span>{it.qty} × {pName(it.product_id)}</span>
              <span className="mono">{ok ? `✓ есть ${avail}` : `нужно ${it.qty}, есть ${avail}`}</span>
            </div>
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={go} loading={loading} style={{ flex: 1 }}>Одобрить и создать выдачу</Btn>
          <Btn v="secondary" onClick={onClose}>Отмена</Btn>
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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 420, padding: 22 }}>
        <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{isReject ? 'Отклонить' : 'На переделку'} · заявка №{info.req.id}</div>
        <div style={{ fontSize: 12.5, color: 'var(--tx3)', marginBottom: 14 }}>{isReject ? 'Укажите причину отклонения.' : 'Что нужно исправить?'}</div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} autoFocus placeholder="Комментарий (обязательно)…"
          style={{ width: '100%', minHeight: 80, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--brd2)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Btn onClick={go} loading={loading} v={isReject ? 'danger' : 'primary'} style={{ flex: 1 }}>{isReject ? 'Отклонить' : 'На переделку'}</Btn>
          <Btn v="secondary" onClick={onClose}>Отмена</Btn>
        </div>
      </div>
    </div>
  )
}
