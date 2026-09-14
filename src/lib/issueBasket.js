import { supabase } from '../supabaseClient'
import { createAct } from './acts'
import { logAction } from './audit'

/* Выдача набором: склад собирает корзину и проводит её одной операцией.
   Раньше каждая позиция требовала отдельного прохода через форму
   и давала отдельный акт — на велком-пак из четырёх предметов
   выходило четыре акта. */

export function checkBasket(basket, stockByWh, warehouseId) {
  const wh = Number(warehouseId)
  const short = []
  for (const it of basket) {
    const have = stockByWh?.[Number(it.product_id)]?.[wh] || 0
    if (it.qty > have) short.push({ ...it, have })
  }
  return short
}

export async function issueBasket({ basket, warehouseId, recipient, dept, basis, profile, products, isTest }) {
  if (!basket?.length) return { error: 'Корзина пуста' }
  if (!warehouseId) return { error: 'Не выбран склад' }
  if (!recipient?.id) return { error: 'Не выбран получатель' }

  const wh = Number(warehouseId)

  // Остаток проверяем до записи: иначе часть позиций уйдёт, а часть нет
  const { data: stock } = await supabase.from('stock_by_warehouse')
    .select('product_id,qty').eq('warehouse_id', wh)
  const have = Object.fromEntries((stock || []).map((r) => [r.product_id, r.qty]))

  const lack = basket.filter((it) => it.qty > (have[it.product_id] || 0))
  if (lack.length) {
    const p = products.find((x) => x.id === lack[0].product_id)
    return { error: `${p?.name || 'Товар'}: на складе только ${have[lack[0].product_id] || 0} шт` }
  }

  // Сначала акт — он даёт номер, который уйдёт в примечание движений
  let act
  try {
    act = await createAct({
      act: {
        type: 'out',
        act_date: new Date().toISOString().slice(0, 10),
        recipient_id: recipient.id,
        recipient_name: recipient.name,
        giver_name: profile.full_name || profile.email,
        giver_position: profile.position || null,
        approver_position: 'Главный бухгалтер',
        act_kind: 'приёма-передачи товарно-материальных ценностей',
        city: 'г. Бишкек',
        basis: basis || null,
        branch_id: recipient.branch_id || null,
        total_sum: basket.reduce((a, it) => {
          const p = products.find((x) => x.id === it.product_id)
          return a + it.qty * (Number(p?.price) || 0)
        }, 0),
        sign_mode: 'manual',
        is_test: !!isTest,
        created_by: profile.id,
      },
      items: basket.map((it) => {
        const p = products.find((x) => x.id === it.product_id)
        return {
          product_id: it.product_id, warehouse_id: wh,
          name: p?.name || it.name, sku: p?.sku || null,
          unit: 'шт', qty: it.qty, price: Number(p?.price) || 0,
          dept: dept || null,
        }
      }),
    })
  } catch (e) {
    return { error: 'Акт: ' + e.message }
  }

  // Движения пачкой, все со ссылкой на акт
  const rows = basket.map((it) => ({
    type: 'out',
    product_id: Number(it.product_id),
    qty: it.qty,
    warehouse_id: wh,
    recipient_id: recipient.id,
    recipient_profile_id: recipient.profile_id || null,
    branch_id: recipient.branch_id || null,
    issuer_id: profile.id,
    sz: basis || null,
    is_test: !!isTest,
    notes: 'По акту ' + act.number,
  }))

  const { error } = await supabase.from('movements').insert(rows)
  if (error) {
    // Акт без движений — мусор, убираем
    await supabase.from('act_items').delete().eq('act_id', act.id)
    await supabase.from('acts').delete().eq('id', act.id)
    return { error: 'Движения: ' + error.message }
  }

  await logAction({
    profile, action: 'issue_basket', entity: 'act', entityId: act.id,
    entityRef: act.number, details: `позиций: ${basket.length}`,
  })
  return { data: { act, count: basket.length } }
}
