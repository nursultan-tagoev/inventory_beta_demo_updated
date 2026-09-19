import { supabase } from '../supabaseClient'
import { enqueue, isTempId } from './offline'

// Единая запись операции. Остаток проверяется ПО КОНКРЕТНОМУ СКЛАДУ.
// a = { type, product_id, qty, warehouse_id, warehouse_to_id?, recipient_id?, branch_id?, ... }
// stockByWh = { [product_id]: { [warehouse_id]: qty } }
export async function saveMovement(a, stockByWh) {
  const qty = Number(a.qty)
  const wh = a.warehouse_id ? Number(a.warehouse_id) : null
  const whTo = a.warehouse_to_id ? Number(a.warehouse_to_id) : null

  if (!a.product_id) return { error: 'Не выбран товар' }
  if (!qty || qty <= 0) return { error: 'Количество должно быть больше 0' }
  if (!wh) return { error: 'Не выбран склад' }                       // склад обязателен всегда
  if (a.type === 'transfer') {
    if (!whTo) return { error: 'Не выбран склад назначения' }
    if (whTo === wh) return { error: 'Склады должны отличаться' }
  }

  // Остаток на складе-источнике
  const avail = (stockByWh?.[Number(a.product_id)]?.[wh]) || 0
  if (['out', 'writeoff', 'transfer'].includes(a.type) && qty > avail) {
    return { error: `На складе только ${avail} шт` }
  }

  // Товар мог быть заведён без связи — идентификатор пока временный
  const tempProduct = isTempId(a.product_id)

  const row = {
    type: a.type,
    product_id: tempProduct ? a.product_id : Number(a.product_id),
    qty,
    warehouse_id: wh,
    warehouse_to_id: a.type === 'transfer' ? whTo : null,
    recipient_id: a.recipient_id ? (isTempId(a.recipient_id) ? a.recipient_id : Number(a.recipient_id)) : null,
    branch_id: a.branch_id ? Number(a.branch_id) : null,          // филиал-адресат (куда выдали)
    supplier_id: a.type === 'in' && a.supplier_id ? Number(a.supplier_id) : null,
    delivery_id: a.delivery_id ? Number(a.delivery_id) : null,
    is_test: !!a.is_test,
    location_id: a.location_id ? Number(a.location_id) : null,    // место хранения (полка)
    direction_id: a.direction_id ? Number(a.direction_id) : null,
    issuer_id: a.issuer_id || null,
    purpose: a.type === 'out' ? a.purpose || null : null,
    due_date: a.type === 'out' ? a.due_date || null : null,
    sz: a.type === 'out' ? a.sz || null : null,
    condition: a.type === 'return' ? a.condition || null : null,
    notes: a.notes || null,
  }
  /* Связи нет — операция уходит в очередь и проводится при её появлении.
     Отказать человеку у стеллажа нельзя: работа не ждёт сети. */
  if (!navigator.onLine || tempProduct || isTempId(a.recipient_id)) {
    await enqueue({ kind: 'movement', payload: row, title: describe(a) })
    return { error: null, queued: true }
  }

  const { error } = await supabase.from('movements').insert(row)
  if (error && /fetch|network|failed/i.test(error.message)) {
    // Связь оборвалась посреди запроса — не теряем операцию
    await enqueue({ kind: 'movement', payload: row, title: describe(a) })
    return { error: null, queued: true }
  }
  return { error: error ? error.message : null }
}

const TYPE_RU = { in: 'Приход', out: 'Выдача', return: 'Возврат', writeoff: 'Списание', transfer: 'Перемещение', defect: 'Брак' }
const describe = (a) => `${TYPE_RU[a.type] || a.type} · ${a.qty} шт`

// Остаток товара на складе
export const stockAt = (stockByWh, productId, warehouseId) =>
  (stockByWh?.[Number(productId)]?.[Number(warehouseId)]) || 0

// Общий остаток товара по всем складам
export const stockAll = (stockByWh, productId) =>
  Object.values(stockByWh?.[Number(productId)] || {}).reduce((s, n) => s + n, 0)
