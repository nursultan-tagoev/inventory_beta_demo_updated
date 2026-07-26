import { supabase } from '../supabaseClient'
import { uploadFile } from './requests'

/* Построение цепочки подписей по профилям.
   Порядок: получатель → его руководитель → (руководитель руководителя) → админ (склад).
   Максимум 4 звена. */
/* Цепочка строится по уровням, без ручной настройки:
   специалист → руководитель его филиала → внешние согласующие (зампред) → склад (админ).
   Заявка от руководителя филиала: он → зампред → склад.
   Мелкая заявка без СЗ: заявитель → склад. */
export function buildChain({ author, profiles, adminProfile, externals, branchId, basisType, recipientName }) {
  const chain = []
  const add = (c) => { if (c && (c.user_id || c.name) && chain.length < 4) chain.push(c) }

  const roleLabel = { employee: 'Специалист', manager: 'Руководитель филиала', admin: 'Склад · МОЛ', director: 'Директор' }

  // 1. Заявитель — первым
  if (author) add({ user_id: author.id, name: author.full_name || author.email, role: roleLabel[author.role] || 'Заявитель' })
  else if (recipientName) add({ user_id: null, name: recipientName, role: 'Получатель' })

  // Мелкая заявка без СЗ — сразу склад
  if (basisType === 'none') {
    if (adminProfile) add({ user_id: adminProfile.id, name: adminProfile.full_name || adminProfile.email, role: 'Склад · МОЛ' })
    return chain
  }

  // 2. Руководитель филиала (если заявитель — специалист)
  if (author?.role === 'employee') {
    const bid = branchId || author.branch_id
    const head = (profiles || []).find((p) => p.role === 'manager' && p.branch_id === bid)
    if (head && head.id !== author.id) add({ user_id: head.id, name: head.full_name || head.email, role: 'Руководитель филиала' })
  }

  // 3. Внешние согласующие (зампред) — по порядку уровня
  for (const e of (externals || []).filter((x) => x.is_active).sort((a, b) => (a.level || 0) - (b.level || 0))) {
    add({ user_id: null, name: e.full_name, role: e.position || 'Согласующий' })
  }

  // 4. Склад — последним, его подпись = выдача
  if (adminProfile) add({ user_id: adminProfile.id, name: adminProfile.full_name || adminProfile.email, role: 'Склад · МОЛ' })
  return chain
}

// Чья сейчас очередь
export const currentSigner = (signers) =>
  (signers || []).slice().sort((a, b) => a.order_no - b.order_no).find((s) => s.status === 'waiting')

export const signersOf = (actSigners, actId) =>
  (actSigners || []).filter((s) => s.act_id === actId).sort((a, b) => a.order_no - b.order_no)

// Подписать (на экране)
export async function signOnScreen(signer, dataUrl, profileId) {
  let signature_path = null
  if (dataUrl) {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      signature_path = await uploadFile('sign', 'sig.png', blob)
    } catch (e) { return { error: 'Подпись: ' + e.message } }
  }
  const { error } = await supabase.from('act_signers').update({
    status: 'signed', method: 'screen', signature_path, signed_at: new Date().toISOString(), uploaded_by: profileId,
  }).eq('id', signer.id)
  return { error: error ? error.message : null }
}

// Приложить скан за того, кого нет в системе
export async function signByScan(signer, file, profileId) {
  let scan_path = null
  try { scan_path = await uploadFile('sign', file.name, file) } catch (e) { return { error: e.message } }
  const { error } = await supabase.from('act_signers').update({
    status: 'signed', method: 'scan', scan_path, signed_at: new Date().toISOString(), uploaded_by: profileId,
  }).eq('id', signer.id)
  return { error: error ? error.message : null }
}

// Отказ — с обязательной причиной
export async function declineSign(signer, reason, actId) {
  if (!reason?.trim()) return { error: 'Укажите причину отказа' }
  const { error } = await supabase.from('act_signers').update({
    status: 'declined', decline_reason: reason.trim(), signed_at: new Date().toISOString(),
  }).eq('id', signer.id)
  if (error) return { error: error.message }
  // Акт отклонён, резерв снимается, выдачи нет
  const { data: act } = await supabase.from('acts').select('request_id').eq('id', actId).single()
  await supabase.from('acts').update({ declined: true, decline_reason: reason.trim(), status: 'declined' }).eq('id', actId)
  if (act?.request_id) {
    await supabase.rpc('release_reservation', { p_request_id: act.request_id })
    await supabase.from('requests').update({ status: 'rejected', admin_comment: 'Отказ при подписании: ' + reason.trim() }).eq('id', act.request_id)
  }
  return { error: null }
}

// Отозвать свою подпись
export async function revokeSign(signer) {
  const { error } = await supabase.from('act_signers').update({
    status: 'waiting', method: null, signature_path: null, scan_path: null, signed_at: null,
  }).eq('id', signer.id)
  return { error: error ? error.message : null }
}

/* Финал: админ подписал последним → проводим выдачу */
export async function issueByAct(act, actItems, profileId) {
  // Создаём движения по позициям
  for (const it of actItems) {
    if (!it.product_id || !it.qty) continue
    const { error } = await supabase.from('movements').insert({
      type: 'out', product_id: it.product_id, qty: it.qty,
      warehouse_id: it.warehouse_id, branch_id: act.branch_id, recipient_id: act.recipient_id,
      issuer_id: profileId, notes: 'По акту ' + act.number,
    })
    if (error) return { error: 'Движение: ' + error.message }
  }
  await supabase.from('acts').update({ issued: true, issued_at: new Date().toISOString(), status: 'signed' }).eq('id', act.id)
  if (act.request_id) {
    await supabase.rpc('release_reservation', { p_request_id: act.request_id })
    await supabase.from('requests').update({ status: 'approved' }).eq('id', act.request_id)
  }
  return { error: null }
}
