import { supabase } from '../supabaseClient'
import { saveMovement, stockAll } from './ops'

// Создать заявку с позициями
// r = { kind, branch_id, recipient_id, purpose, sz, due_date, comment, items: [{product_id, qty}] }
export async function createRequest(r, authorId) {
  if (!r.items?.length) return { error: 'Добавьте хотя бы одну позицию' }
  for (const it of r.items) {
    if (!it.product_id) return { error: 'В позиции не выбран товар' }
    if (!it.qty || it.qty <= 0) return { error: 'Количество должно быть больше 0' }
  }
  const { data: req, error } = await supabase.from('requests').insert({
    kind: r.kind, status: 'new', author_id: authorId,
    branch_id: r.branch_id || null, recipient_id: r.recipient_id || null,
    purpose: r.purpose || null, sz: r.sz || null, due_date: r.due_date || null, comment: r.comment || null,
  }).select().single()
  if (error) return { error: error.message }
  const items = r.items.map((it) => ({ request_id: req.id, product_id: Number(it.product_id), qty: Number(it.qty) }))
  const { error: e2 } = await supabase.from('request_items').insert(items)
  if (e2) return { error: e2.message }
  return { data: req }
}

// Обновить позиции + шапку заявки (при "изменить")
export async function updateRequest(id, r) {
  const { error } = await supabase.from('requests').update({
    branch_id: r.branch_id || null, recipient_id: r.recipient_id || null,
    purpose: r.purpose || null, sz: r.sz || null, due_date: r.due_date || null,
    comment: r.comment || null, status: 'new',
  }).eq('id', id)
  if (error) return { error: error.message }
  await supabase.from('request_items').delete().eq('request_id', id)
  const items = (r.items || []).map((it) => ({ request_id: id, product_id: Number(it.product_id), qty: Number(it.qty) }))
  const { error: e2 } = await supabase.from('request_items').insert(items)
  return { error: e2 ? e2.message : null }
}

// Сменить статус (отклонить / на переделку / отменить / получено)
export async function setStatus(id, status, adminComment) {
  const patch = { status }
  if (adminComment != null) patch.admin_comment = adminComment
  const { error } = await supabase.from('requests').update(patch).eq('id', id)
  return { error: error ? error.message : null }
}

// Отменить свою заявку (заявитель) — помечаем отклонённой с пометкой
export async function cancelRequest(id) {
  const { error } = await supabase.from('requests').update({ status: 'rejected', admin_comment: 'Отменена заявителем' }).eq('id', id)
  return { error: error ? error.message : null }
}

// Одобрить заявку: создаём операции по позициям + ставим склад-источник + статус approved.
// Возвращает созданные movement-и (для последующего акта, если нужно).
export async function approveRequest(req, warehouseId, stockByWh, profile) {
  if (!warehouseId) return { error: 'Выберите склад-источник' }
  // Проверка остатков по всем позициям на выбранном складе
  for (const it of req.items) {
    const avail = (stockByWh?.[it.product_id]?.[warehouseId]) || 0
    if (it.qty > avail) {
      const name = it.product_id
      return { error: `Недостаточно на складе по позиции (нужно ${it.qty}, есть ${avail})` }
    }
  }
  // Тип операции: и receive, и issue оформляем как выдачу со склада
  for (const it of req.items) {
    const { error } = await saveMovement({
      type: 'out',
      product_id: it.product_id,
      qty: it.qty,
      warehouse_id: warehouseId,
      branch_id: req.branch_id,
      recipient_id: req.recipient_id,
      purpose: req.purpose,
      sz: req.sz,
      due_date: req.due_date,
      issuer_id: profile?.id,
    }, stockByWh)
    if (error) return { error }
  }
  const { error } = await supabase.from('requests').update({ status: 'approved', warehouse_id: warehouseId }).eq('id', req.id)
  return { error: error ? error.message : null }
}
