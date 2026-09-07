import { supabase } from '../supabaseClient'
import { logAction } from './audit'

/* Права на архивацию и удаление заявки */
export function canArchive(req, profile) {
  if (req.archived) return false
  if (!['received', 'issued', 'partial', 'rejected'].includes(req.status)) return false
  if (profile?.role === 'admin') return true
  return req.author_id === profile?.id
}

/* Удалить можно только то, чего никто не касался: нет согласований, не ушла на склад.
   Всё остальное отменяется — след должен остаться. */
export function canDelete(req, profile, chain) {
  const role = profile?.role
  if (role === 'director') return false
  const touched = (chain || []).some((a) => a.status !== 'waiting')
  if (req.sent_at || touched) return false
  if (['admin', 'warehouse'].includes(role)) return true
  return req.author_id === profile?.id
}

/* Заявка уже на складе — просим отмену. Выдача замораживается до решения админа. */
export function canRequestCancel(req, profile) {
  if (!req.sent_at) return false
  if (req.cancel_requested_at) return false
  if (!['approved', 'new'].includes(req.status)) return false
  return req.author_id === profile?.id || profile?.role === 'manager'
}

export async function requestCancel(req, profile, reason) {
  if (!reason?.trim()) return { error: 'Укажите причину отмены' }
  const { error } = await supabase.from('requests').update({
    cancel_requested_at: new Date().toISOString(),
    cancel_requested_by: profile.id,
    cancel_reason: reason.trim(),
  }).eq('id', req.id)
  if (error) return { error: error.message }
  await logAction({ profile, action: 'cancel_requested', entity: 'request', entityId: req.id, entityRef: '№' + req.id, details: reason.trim() })
  return { error: null }
}

// Админ подтвердил отмену — заявка закрыта, резерв снят
export async function confirmCancel(req, profile) {
  const { error } = await supabase.from('requests').update({
    status: 'rejected', admin_comment: 'Отменена по просьбе заявителя: ' + (req.cancel_reason || ''),
  }).eq('id', req.id)
  if (error) return { error: error.message }
  await supabase.rpc('release_reservation', { p_request_id: req.id })
  await logAction({ profile, action: 'cancel_confirmed', entity: 'request', entityId: req.id, entityRef: '№' + req.id })
  return { error: null }
}

// Админ вернул в работу — просьба снята, заявка снова к выдаче
export async function declineCancel(req, profile, note) {
  const { error } = await supabase.from('requests').update({
    cancel_requested_at: null, cancel_requested_by: null, cancel_reason: null,
  }).eq('id', req.id)
  if (error) return { error: error.message }
  await logAction({ profile, action: 'cancel_declined', entity: 'request', entityId: req.id, entityRef: '№' + req.id, details: note || null })
  return { error: null }
}

export async function archiveRequest(req, profile) {
  const { error } = await supabase.from('requests').update({
    archived: true, archived_at: new Date().toISOString(), archived_by: profile.id,
  }).eq('id', req.id)
  if (error) return { error: error.message }
  await logAction({ profile, action: 'archived', entity: 'request', entityId: req.id, entityRef: '№' + req.id })
  return { error: null }
}

export async function unarchiveRequest(req, profile) {
  const { error } = await supabase.from('requests').update({ archived: false }).eq('id', req.id)
  if (error) return { error: error.message }
  await logAction({ profile, action: 'unarchived', entity: 'request', entityId: req.id, entityRef: '№' + req.id })
  return { error: null }
}

export async function deleteRequest(req, profile, reason) {
  await supabase.rpc('release_reservation', { p_request_id: req.id })
  await logAction({ profile, action: 'deleted', entity: 'request', entityId: req.id, entityRef: '№' + req.id, details: reason || null })
  const { error } = await supabase.from('requests').delete().eq('id', req.id)
  return { error: error ? error.message : null }
}
