import { supabase } from '../supabaseClient'

/* Шаблоны заявок. Акции повторяются составом, меняются только количества —
   набирать одно и то же каждый раз незачем. */

export async function listTemplates(profileId) {
  const { data } = await supabase.from('request_templates')
    .select('*, items:request_template_items(*)')
    .or(`owner_id.eq.${profileId},is_shared.eq.true`)
    .order('created_at', { ascending: false })
  return data || []
}

export async function saveTemplate({ name, items, profile }) {
  if (!name?.trim()) return { error: 'Введите название' }
  if (!items?.length) return { error: 'В шаблоне нет позиций' }

  const { data: tpl, error } = await supabase.from('request_templates')
    .insert({ name: name.trim(), owner_id: profile.id })
    .select().single()
  if (error) return { error: error.message }

  const rows = items.map((it) => ({
    template_id: tpl.id,
    product_id: Number(it.product_id),
    qty: Number(it.qty) || 1,
  }))
  const { error: e2 } = await supabase.from('request_template_items').insert(rows)
  if (e2) {
    // Шаблон без позиций бесполезен — убираем
    await supabase.from('request_templates').delete().eq('id', tpl.id)
    return { error: e2.message }
  }
  return { data: tpl }
}

export async function deleteTemplate(id) {
  const { error } = await supabase.from('request_templates').delete().eq('id', id)
  return { error: error ? error.message : null }
}

/* Разворачиваем шаблон в позиции заявки. Товары могли заархивировать
   или удалить — пропавшие возвращаем отдельно, чтобы предупредить. */
export function expandTemplate(tpl, products) {
  const items = [], missing = []
  for (const it of tpl.items || []) {
    const p = (products || []).find((x) => x.id === it.product_id && !x.archived)
    if (p) items.push({ product_id: p.id, name: p.name, qty: it.qty })
    else missing.push(it.product_id)
  }
  return { items, missing }
}
