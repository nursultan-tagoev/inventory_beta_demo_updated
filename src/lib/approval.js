import { supabase } from '../supabaseClient'
import { uploadFile } from './requests'

/* Цепочка СОГЛАСОВАНИЯ заявки.
   Заявитель не подписывает — он создал заявку.
   Специалист → руководитель его филиала → внешние (зампред)
   Руководитель филиала → внешние (зампред)
   Админ в цепочке НЕ участвует — он исполняет после согласования. */
export function buildApprovalChain({ author, profiles, externals, branchId }) {
  const chain = []
  const add = (c) => { if (c && (c.user_id || c.name) && chain.length < 4) chain.push(c) }

  if (author?.role === 'employee') {
    const bid = branchId || author.branch_id
    const head = (profiles || []).find((p) => p.role === 'manager' && p.branch_id === bid)
    if (head) add({ user_id: head.id, name: head.full_name || head.email, role: 'Руководитель филиала' })
  }
  for (const e of (externals || []).filter((x) => x.is_active !== false).sort((a, b) => (a.level || 0) - (b.level || 0))) {
    add({ user_id: null, name: e.full_name, role: e.position || 'Согласующий' })
  }
  return chain
}

export const approversOf = (all, requestId) =>
  (all || []).filter((a) => a.request_id === requestId).sort((a, b) => a.order_no - b.order_no)

export const currentApprover = (chain) => (chain || []).find((a) => a.status === 'waiting')

// Создать цепочку при отправке заявки
export async function createApprovalChain(requestId, chain) {
  if (!chain?.length) return { error: null }
  const rows = chain.map((c, i) => ({
    request_id: requestId, order_no: i + 1,
    user_id: c.user_id || null, approver_name: c.name || null,
    approver_role: c.role || null, in_system: !!c.user_id, status: 'waiting',
  }))
  const { error } = await supabase.from('request_approvers').insert(rows)
  return { error: error ? error.message : null }
}

// Согласовать нажатием (пользователь авторизован — это и есть его подпись).
// dataUrl — необязательный росчерк, если человек захотел расписаться.
export async function approveInSystem(appr, profileId, requestId, dataUrl) {
  let signature_path = null
  if (dataUrl) {
    try { const blob = await (await fetch(dataUrl)).blob(); signature_path = await uploadFile('appr', 'sig.png', blob) }
    catch (e) { return { error: 'Подпись: ' + e.message } }
  }
  const { error } = await supabase.from('request_approvers').update({
    status: 'approved', method: dataUrl ? 'screen' : 'system', signature_path,
    acted_at: new Date().toISOString(), uploaded_by: profileId,
  }).eq('id', appr.id)
  if (error) return { error: error.message }
  await supabase.rpc('touch_reservation', { p_request_id: requestId })
  return { error: null }
}
export const approveOnScreen = (appr, dataUrl, profileId, requestId) => approveInSystem(appr, profileId, requestId, dataUrl)

// Согласовать сканом (за того, кого нет в системе)
export async function approveByScan(appr, file, profileId, requestId) {
  let scan_path = null
  try { scan_path = await uploadFile('appr', file.name, file) } catch (e) { return { error: e.message } }
  const { error } = await supabase.from('request_approvers').update({
    status: 'approved', method: 'scan', scan_path, acted_at: new Date().toISOString(), uploaded_by: profileId,
  }).eq('id', appr.id)
  if (error) return { error: error.message }
  await supabase.rpc('touch_reservation', { p_request_id: requestId })
  return { error: null }
}

// Отказ в согласовании
export async function declineApproval(appr, reason, requestId) {
  if (!reason?.trim()) return { error: 'Укажите причину отказа' }
  const { error } = await supabase.from('request_approvers').update({
    status: 'declined', decline_reason: reason.trim(), acted_at: new Date().toISOString(),
  }).eq('id', appr.id)
  if (error) return { error: error.message }
  await supabase.from('requests').update({ status: 'rejected', admin_comment: 'Отказ при согласовании: ' + reason.trim() }).eq('id', requestId)
  await supabase.rpc('release_reservation', { p_request_id: requestId })
  return { error: null }
}

// Все ли согласовали
export const chainComplete = (chain) => (chain || []).length > 0 && chain.every((a) => a.status === 'approved')

// Отправить на склад — явное действие того, кто собрал подписи
export async function sendToWarehouse(requestId, profileId) {
  const { data } = await supabase.from('request_approvers').select('status').eq('request_id', requestId)
  if (!(data || []).length || !(data || []).every((a) => a.status === 'approved')) {
    return { error: 'Ещё не все согласовали' }
  }
  const { error } = await supabase.from('requests').update({
    status: 'approved', sent_at: new Date().toISOString(), sent_by: profileId,
  }).eq('id', requestId)
  if (error) return { error: error.message }
  await supabase.rpc('touch_reservation', { p_request_id: requestId })
  return { error: null }
}

// Отозвать своё согласование
export async function revokeApproval(appr, requestId) {
  const { error } = await supabase.from('request_approvers').update({
    status: 'waiting', method: null, signature_path: null, scan_path: null, acted_at: null,
  }).eq('id', appr.id)
  if (error) return { error: error.message }
  await supabase.from('requests').update({ status: 'new' }).eq('id', requestId)
  return { error: null }
}
