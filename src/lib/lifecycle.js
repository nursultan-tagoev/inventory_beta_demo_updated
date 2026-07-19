import { supabase } from '../supabaseClient'
import { logAction } from './audit'

/* Права на архивацию и удаление заявки */
export function canArchive(req, profile) {
  if (req.archived) return false
  if (!['received', 'issued', 'partial', 'rejected'].includes(req.status)) return false
  if (profile?.role === 'admin') return true
  return req.author_id === profile?.id
}

export function canDelete(req, profile) {
  const role = profile?.role
  if (role === 'admin') return true
  if (role === 'director') return false
  // Ушла на склад — только админ
  if (req.sent_at) return false
  if (role === 'manager') return true
  return req.author_id === profile?.id
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
