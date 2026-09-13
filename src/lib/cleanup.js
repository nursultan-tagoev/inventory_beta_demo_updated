import { supabase } from '../supabaseClient'
import { logAction } from './audit'

/* Отмена и удаление — разные вещи.
   Отмена: запись остаётся, помечена недействительной, остаток откатывается.
   Удаление: запись исчезает вместе со связанными. Только суперадмину. */

export const canCancelMovement = (role) => ['admin', 'warehouse'].includes(role)
export const canHardDelete = (role) => role === 'admin'

/* ── Отмена движения ── */
export async function cancelMovement(mv, profile, reason) {
  if (!reason?.trim()) return { error: 'Укажите причину отмены' }
  if (mv.cancelled_at) return { error: 'Движение уже отменено' }

  const { error } = await supabase.from('movements').update({
    cancelled_at: new Date().toISOString(),
    cancelled_by: profile.id,
    cancel_reason: reason.trim(),
  }).eq('id', mv.id)
  if (error) return { error: error.message }

  await logAction({
    profile, action: 'movement_cancel', entity: 'movement', entityId: mv.id,
    entityRef: '#' + mv.id, details: reason.trim(),
  })
  return { error: null }
}

export async function restoreMovement(mv, profile) {
  const { error } = await supabase.from('movements').update({
    cancelled_at: null, cancelled_by: null, cancel_reason: null,
  }).eq('id', mv.id)
  if (error) return { error: error.message }
  await logAction({ profile, action: 'movement_restore', entity: 'movement', entityId: mv.id, entityRef: '#' + mv.id })
  return { error: null }
}

/* ── Что уйдёт при удалении акта ──
   Показываем заранее, чтобы решение было осознанным. */
export async function deletePreview(act) {
  const { data: items } = await supabase.from('act_items').select('qty').eq('act_id', act.id)
  const { data: movs } = await supabase.from('movements')
    .select('id,qty,type').ilike('notes', '%' + act.number + '%')

  const live = (movs || []).filter((m) => !m.cancelled_at)
  return {
    items: (items || []).length,
    movements: (movs || []).length,
    // Выдача вернётся на склад, приход — уйдёт с него
    backToStock: live.filter((m) => m.type === 'out').reduce((a, m) => a + (m.qty || 0), 0),
    offStock: live.filter((m) => m.type === 'in').reduce((a, m) => a + (m.qty || 0), 0),
  }
}

/* ── Удаление акта со связанными записями ── */
export async function deleteAct(act, profile) {
  if (!canHardDelete(profile?.role)) return { error: 'Удалять может только суперадминистратор' }

  // Движения ищем по номеру акта в примечании — так они и создавались
  const { data: movs } = await supabase.from('movements').select('id').ilike('notes', '%' + act.number + '%')
  const ids = (movs || []).map((m) => m.id)

  if (ids.length) {
    const { error: e1 } = await supabase.from('movements').delete().in('id', ids)
    if (e1) return { error: 'Движения: ' + e1.message }
  }

  await supabase.from('act_signers').delete().eq('act_id', act.id)
  await supabase.from('act_items').delete().eq('act_id', act.id)

  const { error } = await supabase.from('acts').delete().eq('id', act.id)
  if (error) return { error: 'Акт: ' + error.message }

  await logAction({
    profile, action: 'act_delete', entity: 'act', entityId: act.id,
    entityRef: act.number, details: `удалено движений: ${ids.length}`,
  })
  return { error: null, removed: ids.length }
}

/* ── Удаление одного движения ── */
export async function deleteMovement(mv, profile) {
  if (!canHardDelete(profile?.role)) return { error: 'Удалять может только суперадминистратор' }
  const { error } = await supabase.from('movements').delete().eq('id', mv.id)
  if (error) return { error: error.message }
  await logAction({ profile, action: 'movement_delete', entity: 'movement', entityId: mv.id, entityRef: '#' + mv.id })
  return { error: null }
}

/* ── Метка «тестовая запись» ── */
export async function markTest(table, id, value) {
  const { error } = await supabase.from(table).update({ is_test: !!value }).eq('id', id)
  return { error: error ? error.message : null }
}
