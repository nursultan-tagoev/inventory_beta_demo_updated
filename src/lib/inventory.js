import { supabase } from '../supabaseClient'
import { logAction } from './audit'

/* ── Инвентаризация ───────────────────────────────────────────────
   Порядок: черновик → «Сравнить с учётом» → «Провести корректировку».
   Сравнение остатки НЕ трогает, только фиксирует снимок учёта.        */

export async function startInventory({ warehouseId, profile, note }) {
  if (!warehouseId) return { error: 'Выберите склад' }
  const { data, error } = await supabase.from('inventories')
    .insert({ warehouse_id: Number(warehouseId), created_by: profile.id, note: note || null })
    .select().single()
  if (error) return { error: error.message }
  await logAction({ profile, action: 'inventory_start', entity: 'inventory', entityId: data.id, entityRef: '№' + data.id })
  return { data }
}

// Факт можно сохранять частями — счёт идёт долго
export async function saveFact(inventoryId, rows) {
  const payload = rows
    .filter((r) => r.fact_qty !== '' && r.fact_qty !== null && r.fact_qty !== undefined)
    .map((r) => ({ inventory_id: inventoryId, product_id: r.product_id, fact_qty: Number(r.fact_qty) }))
  if (!payload.length) return { error: 'Не введено ни одной позиции' }
  const { error } = await supabase.from('inventory_items')
    .upsert(payload, { onConflict: 'inventory_id,product_id' })
  return { error: error ? error.message : null }
}

// Снимок учёта: фиксируем, сколько числилось на момент сравнения
export async function compareWithStock(inv, stockByWh, profile) {
  const { data: items, error } = await supabase.from('inventory_items')
    .select('*').eq('inventory_id', inv.id)
  if (error) return { error: error.message }
  if (!items?.length) return { error: 'Сначала внесите фактические остатки' }

  // stockByWh — карта вида { product_id: { warehouse_id: qty } }
  const sysOf = (pid) => Number(stockByWh?.[pid]?.[inv.warehouse_id] || 0)

  const upd = items.map((it) => ({ ...it, system_qty: sysOf(it.product_id) }))
  const { error: e2 } = await supabase.from('inventory_items')
    .upsert(upd, { onConflict: 'inventory_id,product_id' })
  if (e2) return { error: e2.message }

  await supabase.from('inventories').update({ status: 'compared' }).eq('id', inv.id)
  await logAction({ profile, action: 'inventory_compare', entity: 'inventory', entityId: inv.id, entityRef: '№' + inv.id })
  return { data: upd }
}

/* Корректировка: выравниваем остаток отдельным типом операции.
   Это не приход и не списание — в журнале видно, что расхождение из сверки. */
export async function applyAdjustment(inv, items, profile) {
  const diffs = (items || []).filter((it) => Number(it.fact_qty) !== Number(it.system_qty))
  if (!diffs.length) {
    await supabase.from('inventories').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', inv.id)
    return { data: { moved: 0 } }
  }

  const rows = diffs.map((it) => {
    const d = Number(it.fact_qty) - Number(it.system_qty)
    return {
      type: d > 0 ? 'adjust_up' : 'adjust_down',
      product_id: it.product_id,
      qty: Math.abs(d),                       // qty всегда положительный — на нём CHECK
      warehouse_id: inv.warehouse_id,
      issuer_id: profile.id,
      inventory_id: inv.id,
      notes: 'Корректировка по сверке №' + inv.id,
    }
  })

  const { error } = await supabase.from('movements').insert(rows)
  if (error) return { error: error.message }

  await supabase.from('inventories')
    .update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', inv.id)
  await logAction({ profile, action: 'inventory_apply', entity: 'inventory', entityId: inv.id,
    entityRef: '№' + inv.id, details: `позиций: ${rows.length}` })
  return { data: { moved: rows.length } }
}

export async function loadInventory(id) {
  const { data: inv } = await supabase.from('inventories').select('*').eq('id', id).single()
  const { data: items } = await supabase.from('inventory_items').select('*').eq('inventory_id', id)
  return { inv, items: items || [] }
}

export async function listInventories() {
  const { data } = await supabase.from('inventories').select('*').order('started_at', { ascending: false })
  return data || []
}

export async function deleteInventory(id) {
  const { error } = await supabase.from('inventories').delete().eq('id', id).eq('status', 'draft')
  return { error: error ? error.message : null }
}

/* ── Брак задним числом ───────────────────────────────────────────
   Обнаружили после приёмки — списываем со ссылкой на поставку,
   чтобы рейтинг поставщика пересчитался по факту.                   */

export async function writeOffDefect({ delivery, productId, qty, comment, profile, warehouseId }) {
  const n = Number(qty)
  if (!delivery?.id) return { error: 'Выберите поставку' }
  if (!productId) return { error: 'Выберите товар' }
  if (!n || n <= 0) return { error: 'Укажите количество' }

  // Больше, чем приняли по этой поставке, забраковать нельзя
  const { data: ins } = await supabase.from('movements')
    .select('qty').eq('delivery_id', delivery.id).eq('product_id', productId).eq('type', 'in')
  const accepted = (ins || []).reduce((a, m) => a + (m.qty || 0), 0)

  const { data: prev } = await supabase.from('movements')
    .select('qty').eq('delivery_id', delivery.id).eq('product_id', productId).eq('type', 'defect')
  const already = (prev || []).reduce((a, m) => a + (m.qty || 0), 0)

  if (n + already > accepted) {
    return { error: `По этой поставке принято ${accepted}, уже забраковано ${already}. Больше ${accepted - already} указать нельзя.` }
  }

  const { error } = await supabase.from('movements').insert({
    type: 'defect', product_id: productId, qty: n,
    warehouse_id: warehouseId || delivery.warehouse_id || null,
    supplier_id: delivery.supplier_id, delivery_id: delivery.id,
    issuer_id: profile.id,
    notes: comment ? 'Брак по поставке: ' + comment : 'Брак по поставке',
  })
  if (error) return { error: error.message }

  // Кеш брака в поставке держим в согласии с операциями
  await supabase.from('deliveries')
    .update({ defects: (delivery.defects || 0) + n }).eq('id', delivery.id)

  await logAction({ profile, action: 'defect_writeoff', entity: 'delivery', entityId: delivery.id,
    entityRef: 'поставка №' + delivery.id, details: `${n} шт` })
  return { error: null }
}
