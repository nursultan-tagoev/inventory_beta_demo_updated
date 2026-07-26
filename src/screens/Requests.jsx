import { useState, useEffect } from 'react'
import { Btn, Badge, Sheet, useToast } from '../components/ui'
import { chainOf, freeAll } from '../lib/data'
import { createRequest, updateRequest, setStatus, sendDirect, cancelRequest, closePartial, issueRequest, openFile } from '../lib/requests'
import { buildApprovalChain, approversOf, currentApprover, createApprovalChain, chainComplete, sendToWarehouse, approveInSystem } from '../lib/approval'
import { canArchive, canDelete, archiveRequest, deleteRequest } from '../lib/lifecycle'
import { push, clearFor } from '../lib/notify'
import ApprovalSheet from '../components/ApprovalSheet'
import RequestChat from '../components/RequestChat'

const SEC = 'var(--sec-req)', SEC_L = 'var(--sec-req-l)'
const ST = {
  new: ['На согласовании', 'amber'], approved: ['К выдаче', 'green'],
  issued: ['Выдано', 'ink'], partial: ['Выдано частично', 'amber'],
  received: ['Завершена', 'slate'], rejected: ['Отклонена', 'red'], revision: ['На переделке', 'amber'],
}
const PRIO = { low: 'Низкий', normal: '', urgent: 'Срочно' }

export default function Requests({ data, profile, can, draftItems, onDraftUsed }) {
  const toast = useToast()
  const { requests, products, branches, profiles, reqApprovers, reload } = data
  const role = profile?.role
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const me = profile?.id

  const [tab, setTab] = useState('all')
  const [form, setForm] = useState(false)
  const [editReq, setEditReq] = useState(null)
  const [openId, setOpenId] = useState(null)      // раскрытая карточка
  const [issue, setIssue] = useState(null)
  const [apprSheet, setApprSheet] = useState(null)
  const [reject, setReject] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  // черновик из каталога
  useEffect(() => { if (draftItems?.length) { setEditReq(null); setForm(true) } }, [draftItems])

  const pName = (id) => products.find((p) => p.id === id)?.name || '—'
  const bName = (id) => branches.find((b) => b.id === id)?.name || ''
  const uName = (id) => { const p = profiles.find((x) => x.id === id); return p?.full_name || p?.email || '' }

  // Область видимости
  const mine = requests.filter((r) => r.author_id === me)
  const branchReq = requests.filter((r) => {
    const a = profiles.find((p) => p.id === r.author_id)
    return a && a.branch_id === profile?.branch_id
  })
  const scopeAll = isAdmin || role === 'director' ? requests : isManager ? branchReq : mine
  const scope = scopeAll.filter((r) => !r.archived)

  // Требует действия
  const needAction = scope.filter((r) => {
    if (isAdmin && r.status === 'approved' && r.sent_at) return true
    if (r.status !== 'new') return false
    const chain = approversOf(reqApprovers, r.id)
    const cur = currentApprover(chain)
    if (cur) {
      if (cur.in_system) return cur.user_id === me
      const prev = chain.filter((a) => a.order_no < cur.order_no && a.in_system).slice(-1)[0]
      return (prev && prev.user_id === me) || r.author_id === me
    }
    // всё согласовано, но не отправлено
    if (chainComplete(chain) && !r.sent_at) {
      const lastIn = chain.filter((a) => a.in_system).slice(-1)[0]
      return (lastIn && lastIn.user_id === me) || r.author_id === me
    }
    return false
  })

  const TABS = [
    ...(needAction.length ? [['action', `Требует действия · ${needAction.length}`]] : []),
    ['all', 'Все заявки'],
    ['new', 'На согласовании'],
    ['revision', 'На переделке'],
    ['rejected', 'Отклонённые'],
    ['approved', 'К выдаче'],
    ['done', 'Завершённые'],
    ['archive', 'Архив'],
  ]
  const list =
    tab === 'action' ? needAction
    : tab === 'archive' ? scopeAll.filter((r) => r.archived)
    : tab === 'new' ? scope.filter((r) => r.status === 'new')
    : tab === 'revision' ? scope.filter((r) => r.status === 'revision')
    : tab === 'rejected' ? scope.filter((r) => r.status === 'rejected')
    : tab === 'approved' ? scope.filter((r) => r.status === 'approved')
    : tab === 'done' ? scope.filter((r) => ['issued', 'partial', 'received'].includes(r.status))
    : scope

  /* ── Действия ── */
  const approveNow = async (r, appr) => {
    const { error } = await approveInSystem(appr, profile.id, r.id)
    if (error) return toast(error, 'error')
    await clearFor('request', r.id, me)
    // уведомляем следующего
    const chain = approversOf(reqApprovers, r.id)
    const next = chain.find((a) => a.order_no > appr.order_no && a.status === 'waiting')
    if (next?.in_system && next.user_id) {
      await push({ userId: next.user_id, kind: 'to_approve', action: true,
        title: `Заявка №${r.id} ждёт согласования`, body: r.purpose || '', entity: 'request', entityId: r.id })
    }
    if (r.author_id && r.author_id !== me) {
      await push({ userId: r.author_id, kind: 'approved', action: false,
        title: `Заявку №${r.id} согласовали`, body: uName(me), entity: 'request', entityId: r.id })
    }
    toast('Согласовано'); reload()
  }

  const sendNow = async (r) => {
    const { error } = await sendToWarehouse(r.id, profile.id)
    if (error) return toast(error, 'error')
    const admin = profiles.find((p) => p.role === 'admin')
    if (admin) await push({ userId: admin.id, kind: 'to_issue', action: true,
      title: `Заявка №${r.id} к выдаче`, body: `${bName(r.branch_id)} · ${r.purpose || ''}`, entity: 'request', entityId: r.id })
    if (r.author_id && r.author_id !== me) await push({ userId: r.author_id, kind: 'approved', action: false,
      title: `Заявка №${r.id} отправлена на склад`, body: 'ожидает выдачи', entity: 'request', entityId: r.id })
    toast('Отправлено на склад'); reload()
  }

  const doArchive = async (r) => {
    const { error } = await archiveRequest(r, profile)
    if (error) return toast(error, 'error')
    toast('В архиве'); reload()
  }
  const doDelete = async (r) => {
    const { error } = await deleteRequest(r, profile, null)
    if (error) return toast(error, 'error')
    setConfirmDel(null); toast('Заявка удалена'); reload()
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 18px 90px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 20, fontWeight: 600 }}>Заявки</span>
        {!isAdmin && role !== 'director' && (
          <Btn size="sm" onClick={() => { setEditReq(null); setForm(true) }} style={{ marginLeft: 'auto', minHeight: 40 }}>＋ Новая</Btn>
        )}
      </div>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        {TABS.map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontSize: 12, padding: '8px 13px', minHeight: 38, borderRadius: 20, border: 'none', whiteSpace: 'nowrap',
            background: tab === t ? SEC_L : 'var(--sur)', color: tab === t ? SEC : 'var(--tx3)', fontWeight: tab === t ? 600 : 500,
          }}>{l}</button>
        ))}
      </div>

      {list.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 9 }}>📋</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Здесь пусто</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
            {tab === 'action' ? 'Ничего не требует вашего участия' : isAdmin ? 'Заявки появятся, когда филиалы их отправят' : 'Создайте первую заявку'}
          </div>
        </div>
      )}

      {list.map((r) => {
        const st = ST[r.status] || ST.new
        const chain = approversOf(reqApprovers, r.id)
        const cur = currentApprover(chain)
        const open = openId === r.id
        const msgCount = (data.reqMessages || []).filter((m) => m.request_id === r.id).length

        // Что могу я
        const prevIn = cur ? chain.filter((a) => a.order_no < cur.order_no && a.in_system).slice(-1)[0] : null
        const myTurn = cur && cur.in_system && cur.user_id === me
        const canAttach = cur && !cur.in_system && ((prevIn && prevIn.user_id === me) || r.author_id === me)
        const lastIn = chain.filter((a) => a.in_system).slice(-1)[0]
        const canSend = chainComplete(chain) && !r.sent_at && ((lastIn && lastIn.user_id === me) || r.author_id === me)
        const onMe = myTurn || canAttach || canSend || (isAdmin && r.status === 'approved' && r.sent_at)

        const mySigned = chain.find((a) => a.in_system && a.user_id === me && a.status === 'approved')

        return (
          <div key={r.id} className="card" style={{ marginBottom: 9, overflow: 'hidden', border: onMe ? `1.5px solid ${SEC}` : '1px solid var(--brd)' }}>

            {/* Компактная строка */}
            <div onClick={() => setOpenId(open ? null : r.id)} style={{ padding: '13px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)' }}>№{r.id}</span>
                  <Badge color={st[1]}>{st[0]}</Badge>
                  {r.priority === 'urgent' && <Badge color="red">Срочно</Badge>}
                  {onMe && <Badge color="ink">на вашей стороне</Badge>}
                  {msgCount > 0 && <span style={{ fontSize: 10, color: 'var(--pu)' }}>💬 {msgCount}</span>}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.items.map((it) => `${it.approved_qty ?? it.qty} × ${pName(it.product_id)}`).join(' · ')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                  {[uName(r.author_id), bName(r.branch_id), new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'var(--tx3)', flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
            </div>

            {/* Раскрытые детали */}
            {open && (
              <div style={{ padding: '0 15px 15px', borderTop: '1px solid var(--brd)' }}>

                {/* Позиции */}
                <div style={{ padding: '11px 0' }}>
                  {r.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
                      <span>{pName(it.product_id)}</span>
                      <span className="mono" style={{ color: 'var(--tx3)' }}>
                        {it.approved_qty != null && it.approved_qty !== it.qty
                          ? <>{it.approved_qty} <span style={{ fontSize: 10 }}>(просили {it.qty})</span></>
                          : it.qty} шт
                      </span>
                    </div>
                  ))}
                  {r.purpose && <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 6 }}>Цель: {r.purpose}</div>}
                </div>

                {/* Основание */}
                {r.basis_type === 'sz' && r.sz_number && (
                  <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, fontSize: 11.5, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: 'var(--tx3)' }}>Записка:</span>
                      <span className="mono">{r.sz_number}{r.sz_date ? ' от ' + new Date(r.sz_date).toLocaleDateString('ru-RU') : ''}</span>
                    </div>
                    {r.sz_scan_path && <button onClick={async () => { const { error } = await openFile(r.sz_scan_path); if (error) toast(error, 'error') }}
                      style={{ width: '100%', minHeight: 38, border: `1px solid ${SEC}`, borderRadius: 9, background: SEC_L, color: SEC, fontSize: 12, fontWeight: 600 }}>
                      📄 Открыть записку
                    </button>}
                  </div>
                )}

                {r.priority === 'urgent' && r.urgent_reason && (
                  <div style={{ padding: '9px 12px', background: 'var(--rd-l)', borderRadius: 9, fontSize: 11.5, color: 'var(--rd-m)', marginBottom: 10 }}>
                    <b>Срочно:</b> {r.urgent_reason}
                  </div>
                )}

                {r.admin_comment && ['rejected', 'revision'].includes(r.status) && (
                  <div style={{ padding: '9px 12px', background: r.status === 'rejected' ? 'var(--rd-l)' : 'var(--am-l)', borderRadius: 9, fontSize: 11.5, color: r.status === 'rejected' ? 'var(--rd-m)' : 'var(--am-m)', marginBottom: 10 }}>
                    <b>{r.status === 'rejected' ? 'Причина: ' : 'Комментарий: '}</b>{r.admin_comment}
                  </div>
                )}

                {/* Цепочка */}
                {chain.length > 0 && (
                  <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, marginBottom: 10 }}>
                    {chain.map((a, i) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0' }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10, color: '#fff', flexShrink: 0,
                          background: a.status === 'approved' ? 'var(--gr)' : a.status === 'declined' ? 'var(--rd)' : (cur && a.id === cur.id) ? SEC : 'var(--sur2)',
                          border: a.status === 'waiting' && (!cur || a.id !== cur.id) ? '1px solid var(--brd2)' : 'none' }}>
                          {a.status === 'approved' ? '✓' : a.status === 'declined' ? '×' : ''}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{a.approver_name}
                            {!a.in_system && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 20, background: 'var(--am-l)', color: 'var(--am-m)', marginLeft: 6 }}>вне системы</span>}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
                            {a.approver_role}
                            {a.status === 'approved' && a.acted_at ? ` · ${new Date(a.acted_at).toLocaleDateString('ru-RU')}` : ''}
                            {a.status === 'declined' ? ` · отказ: ${a.decline_reason || ''}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                    {r.sent_at && <div style={{ fontSize: 10.5, color: 'var(--gr-m)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--brd)' }}>
                      Отправлено на склад {new Date(r.sent_at).toLocaleDateString('ru-RU')}
                    </div>}
                  </div>
                )}

                {/* Три шага согласования */}
                {r.status === 'new' && (myTurn || canAttach || canSend || mySigned) && (
                  <div style={{ marginBottom: 10 }}>
                    {(myTurn || mySigned) && (
                      <div style={{ border: mySigned ? '1px solid var(--brd)' : `1.5px solid ${SEC}`, borderRadius: 11, padding: 12, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: mySigned ? 0 : 9 }}>
                          <span className="mono" style={{ width: 21, height: 21, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700,
                            background: mySigned ? 'var(--gr-l)' : SEC_L, color: mySigned ? 'var(--gr-m)' : SEC }}>{mySigned ? '✓' : '1'}</span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>Ваше согласование</span>
                          {mySigned && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--gr-m)' }}>готово</span>}
                        </div>
                        {!mySigned && (
                          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                            <Btn size="sm" onClick={() => approveNow(r, cur)} style={{ flex: 1, minWidth: 120, minHeight: 44 }}>✓ Согласовать</Btn>
                            <Btn size="sm" v="secondary" onClick={() => setReject({ req: r, mode: 'revision' })} style={{ minHeight: 44 }}>Переделка</Btn>
                            <Btn size="sm" v="secondary" onClick={() => setReject({ req: r, mode: 'reject' })} style={{ minHeight: 44 }}>Отклонить</Btn>
                          </div>
                        )}
                      </div>
                    )}
                    {chain.some((a) => !a.in_system) && (
                      <div style={{ border: canAttach ? `1.5px solid ${SEC}` : '1px solid var(--brd)', borderRadius: 11, padding: 12, marginBottom: 8, opacity: (canAttach || chain.filter((a) => !a.in_system).every((a) => a.status === 'approved')) ? 1 : .55 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: canAttach ? 9 : 0 }}>
                          <span className="mono" style={{ width: 21, height: 21, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700,
                            background: chain.filter((a) => !a.in_system).every((a) => a.status === 'approved') ? 'var(--gr-l)' : SEC_L,
                            color: chain.filter((a) => !a.in_system).every((a) => a.status === 'approved') ? 'var(--gr-m)' : SEC }}>
                            {chain.filter((a) => !a.in_system).every((a) => a.status === 'approved') ? '✓' : '2'}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>Подпись: {chain.find((a) => !a.in_system)?.approver_name}</span>
                        </div>
                        {canAttach && <Btn size="sm" v="secondary" onClick={() => setApprSheet(r)} style={{ width: '100%', minHeight: 44 }}>📎 Приложить подпись</Btn>}
                      </div>
                    )}
                    <div style={{ border: canSend ? `1.5px solid ${SEC}` : '1px solid var(--brd)', borderRadius: 11, padding: 12, opacity: canSend || r.sent_at ? 1 : .55 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: canSend ? 9 : 0 }}>
                        <span className="mono" style={{ width: 21, height: 21, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, background: SEC_L, color: SEC }}>3</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Отправка на склад</span>
                      </div>
                      {canSend && <Btn onClick={() => sendNow(r)} style={{ width: '100%', minHeight: 46 }}>📤 Отправить на склад</Btn>}
                    </div>
                  </div>
                )}

                {/* Админ: выдать */}
                {isAdmin && r.status === 'approved' && r.sent_at && (
                  <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
                    <Btn onClick={() => setIssue(r)} style={{ flex: 1, minWidth: 150, minHeight: 46 }}>📤 Выдать — оформить акт</Btn>
                    <Btn v="secondary" onClick={() => setReject({ req: r, mode: 'reject' })} style={{ minHeight: 46 }}>Отклонить</Btn>
                  </div>
                )}

                {/* Заявитель */}
                {r.author_id === me && (
                  <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
                    {['issued', 'partial'].includes(r.status) && <Btn size="sm" onClick={async () => { await setStatus(r.id, 'received'); await clearFor('request', r.id, me); toast('Получение подтверждено'); reload() }} style={{ minHeight: 44 }}>Подтвердить получение</Btn>}
                    {r.status === 'partial' && <Btn size="sm" v="secondary" onClick={async () => { await closePartial(r.id); toast('Завершено'); reload() }} style={{ minHeight: 44 }}>Хватит, завершить</Btn>}
                    {['new', 'revision'].includes(r.status) && !chain.some((a) => a.status === 'approved') && (
                      <Btn size="sm" v="secondary" onClick={() => { setEditReq(r); setForm(true) }} style={{ minHeight: 44 }}>Изменить</Btn>
                    )}
                    {r.status === 'new' && !chain.some((a) => a.status === 'approved') && (
                      <Btn size="sm" v="secondary" onClick={async () => { await cancelRequest(r.id); toast('Отменено'); reload() }} style={{ minHeight: 44 }}>Отменить</Btn>
                    )}
                  </div>
                )}

                {/* Чат */}
                <RequestChat req={r} data={data} profile={profile} compact />

                {/* Архив и удаление */}
                <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                  {canArchive(r, profile) && !r.archived && <button onClick={() => doArchive(r)} style={{ fontSize: 11.5, color: 'var(--tx3)', minHeight: 38, padding: '0 10px' }}>В архив</button>}
                  {canDelete(r, profile) && <button onClick={() => setConfirmDel(r)} style={{ fontSize: 11.5, color: 'var(--rd-m)', minHeight: 38, padding: '0 10px' }}>Удалить</button>}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Формы */}
      <Sheet open={form} onClose={() => { setForm(false); onDraftUsed && onDraftUsed() }} title={editReq ? 'Изменить заявку' : 'Новая заявка'}>
        {form && <RequestForm data={data} profile={profile} editReq={editReq} draftItems={draftItems}
          onDone={() => { setForm(false); onDraftUsed && onDraftUsed(); reload() }} />}
      </Sheet>

      {issue && <IssueModal req={issue} data={data} profile={profile} onClose={() => setIssue(null)} onDone={() => { setIssue(null); reload() }} />}
      {apprSheet && <ApprovalSheet req={apprSheet} data={data} profile={profile} onClose={() => setApprSheet(null)} onDone={() => { setApprSheet(null); reload() }} />}
      {reject && <RejectModal info={reject} profile={profile} data={data} onClose={() => setReject(null)} onDone={() => { setReject(null); reload() }} />}
      {confirmDel && <ConfirmDelete req={confirmDel} onCancel={() => setConfirmDel(null)} onOk={() => doDelete(confirmDel)} />}
    </div>
  )
}

/* ── Форма заявки ── */
function RequestForm({ data, profile, editReq, draftItems, onDone }) {
  const toast = useToast()
  const { products, branches, freeByWh, stockByWh, directions, productTypes, campaigns, profiles, externals } = data
  const [items, setItems] = useState(
    editReq?.items?.map((it) => ({ product_id: it.product_id, qty: it.qty }))
    || draftItems?.map((d) => ({ product_id: d.product_id, qty: d.qty }))
    || [{ product_id: '', qty: 1 }]
  )
  const [f, setF] = useState({
    purpose: editReq?.purpose || '', sz_number: editReq?.sz_number || '', sz_date: editReq?.sz_date || '',
    priority: editReq?.priority || 'normal',
    urgent_reason: editReq?.urgent_reason || '', urgent_due: editReq?.urgent_due || '',
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

  const author = profiles.find((p) => p.id === profile.id) || profile

  const submit = async () => {
    if (shortage.length) return toast(`Свободно только ${shortage[0].free} — ${shortage[0].name}`, 'error')
    setLoading(true)
    const payload = { ...f, basis_type: 'sz', items, scanFile, branch_id: profile.branch_id, recipient_id: null, kind: 'issue' }
    const res = editReq ? await updateRequest(editReq.id, payload) : await createRequest(payload, profile.id)
    if (res.error) { setLoading(false); return toast(res.error, 'error') }
    const reqId = res.data?.id || editReq?.id
    if (reqId && !editReq) {
      const chain = buildApprovalChain({ author, profiles, branchId: profile.branch_id })
      if (chain.length) {
        await createApprovalChain(reqId, chain)
        const first = chain[0]
        if (first?.user_id) await push({ userId: first.user_id, kind: 'to_approve', action: true,
          title: `Заявка №${reqId} ждёт согласования`, body: f.purpose || '', entity: 'request', entityId: reqId })
      } else {
        // Согласовывать некому — заявка идёт прямо на склад
        await sendDirect(reqId, profile.id)
        const admin = (profiles || []).find((p) => p.role === 'admin' && p.is_active !== false)
        if (admin) await push({ userId: admin.id, kind: 'to_issue', action: true,
          title: `Заявка №${reqId} на складе`, body: f.purpose || '', entity: 'request', entityId: reqId })
      }
    }
    setLoading(false)
    toast(editReq ? 'Обновлено' : 'Заявка отправлена'); onDone()
  }

  const lbl = (t, req) => <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--tx3)', marginBottom: 6 }}>{t}{req && <span style={{ color: 'var(--rd)' }}> *</span>}</div>
  const inp = { width: '100%', minHeight: 46, padding: '0 13px', border: '1.5px solid var(--brd)', borderRadius: 12, background: 'var(--sur)', fontSize: 13.5, color: 'var(--tx)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        {lbl('Позиции', true)}
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={it.product_id} onChange={(e) => setItem(i, 'product_id', e.target.value)} style={{ ...inp, flex: 1, minWidth: 0 }}>
              <option value="">— товар —</option>
              {products.filter((p) => !p.archived).map((p) => {
                const ch = chainOf(p, { directions, productTypes, campaigns })
                return <option key={p.id} value={p.id}>{p.name}{ch ? ` · ${ch}` : ''}</option>
              })}
            </select>
            <input type="number" inputMode="numeric" value={it.qty} onChange={(e) => setItem(i, 'qty', Number(e.target.value))} style={{ ...inp, width: 76 }} />
            {items.length > 1 && <button onClick={() => setItems((s) => s.filter((_, j) => j !== i))} style={{ width: 44, minHeight: 46, borderRadius: 12, color: 'var(--tx3)', fontSize: 17 }}>×</button>}
          </div>
        ))}
        <button onClick={() => setItems((s) => [...s, { product_id: '', qty: 1 }])}
          style={{ width: '100%', minHeight: 44, border: '1px dashed var(--brd2)', borderRadius: 12, background: 'transparent', color: SEC, fontSize: 12.5 }}>＋ Добавить позицию</button>
      </div>

      {shortage.length > 0 && <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--am-l)', borderRadius: 10, fontSize: 11.5, color: 'var(--am-m)' }}>
        ⚠️ {shortage[0].name} — свободно только {shortage[0].free}
      </div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: SEC_L, borderRadius: 11, fontSize: 11.5, color: SEC }}>
        <span style={{ fontSize: 15 }}>📄</span>
        <span>Заявка оформляется <b>по служебной записке</b> — заполните пожалуйста детали и приложите согласованную служебную записку</span>
      </div>

      <div className="card" style={{ padding: 14, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
          <div>{lbl('Номер служебной записки', true)}<input value={f.sz_number} onChange={(e) => up('sz_number', e.target.value)} placeholder="СЗ-2026-0142" style={inp} /></div>
          <div>{lbl('Дата согласования', true)}<input type="date" value={f.sz_date} onChange={(e) => up('sz_date', e.target.value)} style={inp} /></div>
        </div>
        <div>
          {lbl('Согласованная служебная записка', true)}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '0 13px', border: `1px dashed ${scanFile ? 'var(--gr)' : SEC}`, borderRadius: 12, background: scanFile ? 'var(--gr-l)' : SEC_L, cursor: 'pointer' }}>
            <span style={{ fontSize: 17 }}>{scanFile ? '✓' : '📎'}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: scanFile ? 'var(--gr-m)' : SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scanFile ? scanFile.name : 'Приложить документ'}</span>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setScan(e.target.files?.[0] || null)} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <div>
        {lbl('Приоритет')}
        <div style={{ display: 'flex', gap: 8 }}>
          {[['low', 'Низкий'], ['normal', 'Обычный'], ['urgent', 'Срочно']].map(([v, l]) => (
            <button key={v} onClick={() => up('priority', v)} style={{
              flex: 1, minHeight: 44, borderRadius: 11, fontSize: 12.5, fontWeight: f.priority === v ? 600 : 500,
              border: `1px solid ${f.priority === v ? (v === 'urgent' ? 'var(--rd)' : SEC) : 'var(--brd2)'}`,
              background: f.priority === v ? (v === 'urgent' ? 'var(--rd-l)' : SEC_L) : 'var(--sur)',
              color: f.priority === v ? (v === 'urgent' ? 'var(--rd-m)' : SEC) : 'var(--tx2)',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {f.priority === 'urgent' && (
        <div className="card" style={{ padding: 14, background: 'var(--rd-l)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>{lbl('Обоснование срочности', true)}<input value={f.urgent_reason} onChange={(e) => up('urgent_reason', e.target.value)} placeholder="Почему срочно" style={inp} /></div>
          <div>{lbl('Нужно до')}<input type="date" value={f.urgent_due} onChange={(e) => up('urgent_due', e.target.value)} style={inp} /></div>
        </div>
      )}

      <div>{lbl('Цель')}<input value={f.purpose} onChange={(e) => up('purpose', e.target.value)} placeholder="Конференция, акция…" style={inp} /></div>

      <Btn onClick={submit} loading={loading} disabled={shortage.length > 0} size="lg" style={{ minHeight: 50 }}>
        {editReq ? 'Сохранить' : 'Отправить заявку'}
      </Btn>
    </div>
  )
}

/* ── Выдача ── */
function IssueModal({ req, data, profile, onClose, onDone }) {
  const toast = useToast()
  const { warehouses, freeByWh, stockByWh, products } = data
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
    await clearFor('request', req.id, profile.id)
    if (req.author_id) await push({ userId: req.author_id, kind: 'to_confirm', action: true,
      title: `Товар по заявке №${req.id} выдан`, body: 'подтвердите получение', entity: 'request', entityId: req.id })
    toast('Выдано — акт сформирован'); onDone()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(61,55,47,.45)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 440, padding: 20, maxHeight: '86vh', overflowY: 'auto' }}>
        <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Выдать по заявке №{req.id}</div>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 15 }}>Товар спишется, сформируется акт для подписи получателем.</div>

        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>Склад</div>
        <select value={wh} onChange={(e) => setWh(e.target.value)}
          style={{ width: '100%', minHeight: 46, padding: '0 13px', border: '1.5px solid var(--brd)', borderRadius: 12, background: 'var(--sur)', fontSize: 13.5, color: 'var(--tx)', marginBottom: 14 }}>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>Сколько выдать</div>
        {req.items.map((it) => {
          const free = (freeByWh?.[it.product_id]?.[Number(wh)]) ?? (stockByWh?.[it.product_id]?.[Number(wh)] ?? 0)
          const give = Number(qty[it.id] ?? it.qty)
          const ok = give <= free + it.qty
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: ok ? 'var(--bg)' : 'var(--am-l)', borderRadius: 10, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{pName(it.product_id)}</div>
                <div style={{ fontSize: 10.5, color: ok ? 'var(--tx3)' : 'var(--am-m)' }}>просили {it.qty} · свободно {free}</div>
              </div>
              <input type="number" inputMode="numeric" value={qty[it.id] ?? it.qty} onChange={(e) => setQty({ ...qty, [it.id]: Number(e.target.value) })}
                style={{ width: 68, minHeight: 42, textAlign: 'center', border: '1px solid var(--brd2)', borderRadius: 10, background: 'var(--sur)', fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--tx)' }} />
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <Btn onClick={go} loading={loading} style={{ flex: 1, minHeight: 48 }}>Выдать и оформить акт</Btn>
          <Btn v="secondary" onClick={onClose} style={{ minHeight: 48 }}>Отмена</Btn>
        </div>
      </div>
    </div>
  )
}

/* ── Отклонение / переделка ── */
function RejectModal({ info, profile, data, onClose, onDone }) {
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
    if (info.req.author_id) await push({ userId: info.req.author_id, kind: isReject ? 'rejected' : 'revision', action: true,
      title: isReject ? `Заявка №${info.req.id} отклонена` : `Заявка №${info.req.id} на переделке`,
      body: comment.trim(), entity: 'request', entityId: info.req.id })
    toast(isReject ? 'Отклонено' : 'На переделку'); onDone()
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(61,55,47,.45)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 420, padding: 20 }}>
        <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{isReject ? 'Отклонить' : 'На переделку'} · №{info.req.id}</div>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 13 }}>{isReject ? 'Укажите причину.' : 'Что нужно исправить?'}</div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} autoFocus placeholder="Комментарий (обязательно)…"
          style={{ width: '100%', minHeight: 84, padding: '11px 12px', borderRadius: 12, border: '1.5px solid var(--brd)', background: 'var(--sur)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', color: 'var(--tx)' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
          <Btn onClick={go} loading={loading} v={isReject ? 'danger' : 'primary'} style={{ flex: 1, minHeight: 46 }}>{isReject ? 'Отклонить' : 'На переделку'}</Btn>
          <Btn v="secondary" onClick={onClose} style={{ minHeight: 46 }}>Отмена</Btn>
        </div>
      </div>
    </div>
  )
}

/* ── Подтверждение удаления ── */
function ConfirmDelete({ req, onCancel, onOk }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(61,55,47,.45)', backdropFilter: 'blur(4px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 380, padding: 20 }}>
        <div className="ff" style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Удалить заявку №{req.id}?</div>
        <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 16 }}>
          Заявка удалится вместе с перепиской. Резерв снимется. Действие запишется в журнал.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn v="danger" onClick={onOk} style={{ flex: 1, minHeight: 46 }}>Удалить</Btn>
          <Btn v="secondary" onClick={onCancel} style={{ minHeight: 46 }}>Отмена</Btn>
        </div>
      </div>
    </div>
  )
}
