import { supabase } from '../supabaseClient'

const bucket = 'acts'

// Загрузка файла (скан СЗ, подпись, скан акта). Путь только латиницей.
export async function uploadFile(folder, name, fileOrBlob) {
  const ext = (name.split('.').pop() || 'bin').replace(/[^A-Za-z0-9]/g, '') || 'bin'
  const path = `${folder}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, fileOrBlob, { upsert: true })
  if (error) throw new Error('Файл: ' + error.message)
  return path
}
export const fileUrl = (path) => path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null

/* ── Создание заявки ── */
// r = { kind, basis_type, sz_*, no_sz_reason, priority, urgent_*, branch_id, recipient_id, purpose, items:[{product_id,qty}], scanFile }
export async function createRequest(r, authorId) {
  if (!r.items?.length) return { error: 'Добавьте хотя бы одну позицию' }
  for (const it of r.items) {
    if (!it.product_id) return { error: 'В позиции не выбран товар' }
    if (!it.qty || it.qty <= 0) return { error: 'Количество должно быть больше 0' }
  }
  if (r.basis_type === 'sz') {
    if (!r.sz_number?.trim()) return { error: 'Укажите номер служебной записки' }
    if (!r.sz_date) return { error: 'Укажите дату согласования' }
    if (!r.sz_approvers?.trim()) return { error: 'Укажите, кто согласовал' }
    if (!r.scanFile && !r.sz_scan_path) return { error: 'Приложите скан с визами' }
  } else {
    if (!r.no_sz_reason?.trim()) return { error: 'Укажите причину' }
  }
  if (r.priority === 'urgent' && !r.urgent_reason?.trim()) return { error: 'Для срочной укажите обоснование' }

  let sz_scan_path = r.sz_scan_path || null
  try { if (r.scanFile) sz_scan_path = await uploadFile('sz', r.scanFile.name, r.scanFile) }
  catch (e) { return { error: e.message } }

  const { data: req, error } = await supabase.from('requests').insert({
    kind: r.kind, status: 'new', author_id: authorId,
    branch_id: r.branch_id || null, recipient_id: r.recipient_id || null,
    purpose: r.purpose || null,
    basis_type: r.basis_type, sz_number: r.sz_number || null, sz_date: r.sz_date || null,
    sz_approvers: r.sz_approvers || null, sz_scan_path, no_sz_reason: r.no_sz_reason || null,
    priority: r.priority || 'normal', urgent_reason: r.urgent_reason || null, urgent_due: r.urgent_due || null,
  }).select().single()
  if (error) return { error: error.message }

  const items = r.items.map((it) => ({ request_id: req.id, product_id: Number(it.product_id), qty: Number(it.qty) }))
  const { error: e2 } = await supabase.from('request_items').insert(items)
  if (e2) return { error: e2.message }

  // Резервируем по складу с наибольшим свободным остатком
  await reserveForRequest(req.id, items, r.warehouse_hint)
  return { data: req }
}

// Создать резервы под позиции заявки
export async function reserveForRequest(requestId, items, warehouseId) {
  const rows = items.map((it) => ({
    request_id: requestId, product_id: it.product_id, qty: it.qty,
    warehouse_id: warehouseId || null, active: true,
  }))
  const { error } = await supabase.from('reservations').insert(rows)
  return { error: error ? error.message : null }
}

export async function updateRequest(id, r) {
  const patch = {
    branch_id: r.branch_id || null, recipient_id: r.recipient_id || null, purpose: r.purpose || null,
    basis_type: r.basis_type, sz_number: r.sz_number || null, sz_date: r.sz_date || null,
    sz_approvers: r.sz_approvers || null, no_sz_reason: r.no_sz_reason || null,
    priority: r.priority || 'normal', urgent_reason: r.urgent_reason || null, urgent_due: r.urgent_due || null,
    status: 'new',
  }
  if (r.scanFile) { try { patch.sz_scan_path = await uploadFile('sz', r.scanFile.name, r.scanFile) } catch (e) { return { error: e.message } } }
  const { error } = await supabase.from('requests').update(patch).eq('id', id)
  if (error) return { error: error.message }

  await supabase.from('request_items').delete().eq('request_id', id)
  const items = (r.items || []).map((it) => ({ request_id: id, product_id: Number(it.product_id), qty: Number(it.qty) }))
  const { error: e2 } = await supabase.from('request_items').insert(items)
  if (e2) return { error: e2.message }

  // Пересоздаём резерв
  await supabase.from('reservations').update({ active: false }).eq('request_id', id)
  await reserveForRequest(id, items)
  await supabase.rpc('touch_reservation', { p_request_id: id })
  return { error: null }
}

export async function setStatus(id, status, adminComment) {
  const patch = { status }
  if (adminComment != null) patch.admin_comment = adminComment
  const { error } = await supabase.from('requests').update(patch).eq('id', id)
  if (!error && ['rejected', 'received'].includes(status)) {
    await supabase.rpc('release_reservation', { p_request_id: id })
  }
  return { error: error ? error.message : null }
}

export async function cancelRequest(id) {
  const { error } = await supabase.from('requests').update({ status: 'rejected', admin_comment: 'Отменена заявителем' }).eq('id', id)
  if (!error) await supabase.rpc('release_reservation', { p_request_id: id })
  return { error: error ? error.message : null }
}

// Заявитель завершает частично одобренную (остаток не нужен)
export async function closePartial(id) {
  const { error } = await supabase.from('requests').update({ closed_by_author: true, status: 'received' }).eq('id', id)
  if (!error) await supabase.rpc('release_reservation', { p_request_id: id })
  return { error: error ? error.message : null }
}

/* ── Одобрение: создаёт акт с цепочкой подписей (операции ещё нет!) ── */
// approvedQty: { [request_item_id]: qty }
export async function approveRequest(req, warehouseId, approvedQty, freeByWh, profile, chain) {
  if (!warehouseId) return { error: 'Выберите склад-источник' }
  const wid = Number(warehouseId)

  const lines = req.items.map((it) => ({ ...it, give: Number(approvedQty?.[it.id] ?? it.qty) })).filter((it) => it.give > 0)
  if (!lines.length) return { error: 'Нечего выдавать — укажите количество' }

  for (const it of lines) {
    const free = (freeByWh?.[it.product_id]?.[wid]) ?? 0
    const ownReserve = 0 // собственный резерв уже учтён как занятый — допускаем выдачу под него
    if (it.give > free + (it.qty || 0)) {
      return { error: `Недостаточно на складе: нужно ${it.give}, свободно ${free}` }
    }
  }

  // Сохраняем одобренные количества
  for (const it of lines) {
    await supabase.from('request_items').update({ approved_qty: it.give }).eq('id', it.id)
  }

  // Номер акта
  const { data: number, error: numErr } = await supabase.rpc('next_act_number', { p_prefix: 'АВ' })
  if (numErr) return { error: 'Номер акта: ' + numErr.message }

  const total = lines.reduce((a, it) => a + it.give * (it.price || 0), 0)
  const { data: act, error: actErr } = await supabase.from('acts').insert({
    number, type: 'out', act_date: new Date().toISOString().slice(0, 10),
    request_id: req.id, branch_id: req.branch_id, recipient_id: req.recipient_id,
    basis: req.basis_type === 'sz' ? `${req.sz_number || ''} от ${req.sz_date || ''}` : (req.no_sz_reason || ''),
    status: 'awaiting_sign', total_sum: total, created_by: profile.id,
  }).select().single()
  if (actErr) return { error: 'Акт: ' + actErr.message }

  // Позиции акта
  const items = lines.map((it) => ({
    act_id: act.id, product_id: it.product_id, warehouse_id: wid,
    name: it.name || '', sku: it.sku || null, unit: 'шт',
    qty: it.give, price: it.price || 0, sum: it.give * (it.price || 0),
  }))
  await supabase.from('act_items').insert(items)

  // Цепочка подписей
  const signers = (chain || []).map((c, i) => ({
    act_id: act.id, order_no: i + 1, user_id: c.user_id || null, signer_name: c.name || null,
    signer_role: c.role || null, in_system: !!c.user_id, status: 'waiting',
  }))
  if (signers.length) await supabase.from('act_signers').insert(signers)

  // Статус заявки
  const partial = lines.some((it) => it.give < it.qty)
  await supabase.from('requests').update({ status: partial ? 'partial' : 'approved', warehouse_id: wid }).eq('id', req.id)
  await supabase.rpc('touch_reservation', { p_request_id: req.id })

  return { data: act }
}
