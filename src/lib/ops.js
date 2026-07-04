import { supabase } from '../supabaseClient'

// Единая запись операции с защитой от отрицательного остатка.
// a = { type, product_id, qty, recipient_id?, branch_id?, supplier_id?, purpose?, due_date?, sz?, condition?, direction_id?, notes?, location_id?, issuer_id }
export async function saveMovement(a, stock) {
  const qty = Number(a.qty)
  if (!a.product_id) return { error: 'Не выбран товар' }
  if (!qty || qty <= 0) return { error: 'Количество должно быть больше 0' }
  const avail = (stock && stock[Number(a.product_id)]) || 0
  if ((a.type === 'out' || a.type === 'writeoff') && qty > avail) {
    return { error: `Недостаточно на складе: доступно ${avail} шт` }
  }
  const row = {
    type: a.type,
    product_id: Number(a.product_id),
    qty,
    recipient_id: a.recipient_id ? Number(a.recipient_id) : null,
    branch_id: a.branch_id ? Number(a.branch_id) : null,
    supplier_id: a.type === 'in' && a.supplier_id ? Number(a.supplier_id) : null,
    location_id: a.location_id ? Number(a.location_id) : null,
    direction_id: a.direction_id ? Number(a.direction_id) : null,
    issuer_id: a.issuer_id || null,
    purpose: a.type === 'out' ? a.purpose || null : null,
    due_date: a.type === 'out' ? a.due_date || null : null,
    sz: a.type === 'out' ? a.sz || null : null,
    condition: a.type === 'return' ? a.condition || null : null,
    notes: a.notes || null,
  }
  const { error } = await supabase.from('movements').insert(row)
  return { error: error ? error.message : null }
}
