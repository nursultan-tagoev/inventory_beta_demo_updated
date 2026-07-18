import { supabase } from '../supabaseClient'
import { uploadFile } from './requests'

/* Построение цепочки подписей по профилям.
   Порядок: получатель → его руководитель → (руководитель руководителя) → админ (склад).
   Максимум 4 звена. */
export function buildChain({ recipientProfile, recipientName, authorProfile, profiles, adminProfile, kind, branchManager }) {
  const chain = []
  const seen = new Set()
  const push = (c) => {
    const key = c.user_id || c.name
    if (!key || seen.has(key)) return
    if (chain.length >= 3) return   // 3 + админ = 4
    seen.add(key); chain.push(c)
  }

  if (kind === 'receive' && branchManager) {
    // Заявка на филиал — первым руководитель филиала
    push({ user_id: branchManager.id, name: branchManager.full_name, role: 'Руководитель филиала' })
  } else if (recipientProfile) {
    push({ user_id: recipientProfile.id, name: recipientProfile.full_name, role: 'Получатель' })
  } else if (recipientName) {
    push({ user_id: null, name: recipientName, role: 'Получатель' })
  }

  // Поднимаемся по руководителям
  let cur = recipientProfile || authorProfile
  let guard = 0
  while (cur && guard < 3) {
    guard++
    if (cur.manager_id) {
      const m = profiles.find((p) => p.id === cur.manager_id)
      if (!m) break
      push({ user_id: m.id, name: m.full_name, role: m.position || 'Руководитель' })
      cur = m
    } else if (cur.manager_name) {
      push({ user_id: null, name: cur.manager_name, role: cur.manager_position || 'Руководитель' })
      break
    } else break
  }

  // Админ последним — его подпись = выдача
  if (adminProfile) chain.push({ user_id: adminProfile.id, name: adminProfile.full_name, role: 'Склад · МОЛ' })
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
