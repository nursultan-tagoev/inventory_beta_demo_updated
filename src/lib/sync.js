import { supabase } from '../supabaseClient'
import { queueList, dequeue, markFailed, isTempId } from './offline'

/* Отправка очереди. Операции уходят по порядку: товар, заведённый без связи,
   должен получить настоящий идентификатор раньше, чем его оприходуют. */

const ORDER = { product: 0, recipient: 1, movement: 2 }

export async function syncQueue({ onProgress } = {}) {
  const list = (await queueList()).sort((a, b) =>
    (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9) || a.at - b.at)
  if (!list.length) return { sent: 0, failed: 0, conflicts: [] }

  // Временный идентификатор → настоящий, полученный от сервера
  const idMap = {}
  let sent = 0, failed = 0
  const conflicts = []

  for (const row of list) {
    onProgress?.({ done: sent + failed, total: list.length })
    try {
      const res = await sendOne(row, idMap)
      if (res.conflict) {
        conflicts.push({ row, reason: res.conflict })
        await markFailed(row, res.conflict)
        failed++
        continue
      }
      if (res.error) { await markFailed(row, res.error); failed++; continue }
      if (res.id && row.tempId) idMap[row.tempId] = res.id
      await dequeue(row.id)
      sent++
    } catch (e) {
      await markFailed(row, e.message)
      failed++
    }
  }
  return { sent, failed, conflicts }
}

// Подставляем настоящие идентификаторы вместо временных
const real = (id, map) => (isTempId(id) ? map[id] ?? null : id)

async function sendOne(row, map) {
  if (row.kind === 'product') {
    const { data, error } = await supabase.from('products').insert(row.payload).select('id').single()
    if (error) return { error: error.message }
    return { id: data.id }
  }

  if (row.kind === 'recipient') {
    const body = { ...row.payload }
    // Двойники: тот же человек мог появиться, пока мы были без связи
    const { data: same } = await supabase.from('recipients')
      .select('id').ilike('name', body.name).limit(1)
    if (same?.length) return { id: same[0].id }

    const { data, error } = await supabase.from('recipients').insert(body).select('id').single()
    if (error) return { error: error.message }
    return { id: data.id }
  }

  if (row.kind === 'movement') {
    const body = { ...row.payload }
    body.product_id = real(body.product_id, map)
    if (body.recipient_id) body.recipient_id = real(body.recipient_id, map)
    if (!body.product_id) return { error: 'Товар не создался — операция не проведена' }

    /* Остаток мог измениться, пока мы были внизу. Минус не прячем:
       операция проходит, а расхождение показывается отдельно. */
    if (['out', 'writeoff', 'defect'].includes(body.type)) {
      const { data: st } = await supabase.from('stock_by_warehouse')
        .select('qty').eq('product_id', body.product_id).eq('warehouse_id', body.warehouse_id).maybeSingle()
      const have = st?.qty ?? 0
      if (body.qty > have) {
        const { error } = await supabase.from('movements').insert(body)
        if (error) return { error: error.message }
        return { conflict: `Остаток ушёл в минус: было ${have}, выдано ${body.qty}` }
      }
    }

    const { error } = await supabase.from('movements').insert(body)
    if (error) return { error: error.message }
    return {}
  }

  return { error: 'Неизвестный тип операции' }
}
