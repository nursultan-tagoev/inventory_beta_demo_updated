import { supabase } from '../supabaseClient'

/* Создать уведомление.
   action:true — «требует действия», не гаснет от просмотра, уходит в пуш.
   action:false — «что нового», гаснет после прочтения. */
export async function push({ userId, kind, title, body, entity, entityId, action = false }) {
  if (!userId) return
  try {
    await supabase.from('notifications').insert({
      user_id: userId, kind, title, body: body || null,
      entity: entity || null, entity_id: entityId || null, action,
    })
  } catch (e) {}
}

export async function markSeen(ids) {
  if (!ids?.length) return
  try { await supabase.from('notifications').update({ seen: true }).in('id', ids) } catch (e) {}
}

// Снять уведомления по сущности — когда действие выполнено
export async function clearFor(entity, entityId, userId) {
  try {
    let q = supabase.from('notifications').update({ seen: true }).eq('entity', entity).eq('entity_id', entityId)
    if (userId) q = q.eq('user_id', userId)
    await q
  } catch (e) {}
}

export const splitNotifs = (list) => ({
  actions: (list || []).filter((n) => n.action && !n.seen),
  news: (list || []).filter((n) => !n.action && !n.seen),
})

export const ICONS = {
  to_approve: '✍️', to_issue: '📤', to_confirm: '📝', revision: '↩️',
  approved: '✅', issued: '📦', rejected: '⛔', message: '💬', low_stock: '📉', inventory: '🗓',
}
export const TONE = {
  to_approve: ['var(--ink-l)', 'var(--ink)'], to_issue: ['var(--gr-l)', 'var(--gr-m)'],
  to_confirm: ['var(--am-l)', 'var(--am-m)'], revision: ['var(--am-l)', 'var(--am-m)'],
  approved: ['var(--gr-l)', 'var(--gr-m)'], issued: ['var(--ink-l)', 'var(--ink)'],
  rejected: ['var(--rd-l)', 'var(--rd-m)'], message: ['var(--pu-l)', 'var(--pu)'],
  low_stock: ['var(--am-l)', 'var(--am-m)'], inventory: ['var(--sur2)', 'var(--tx2)'],
}
