import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export function useAppData(profile) {
  const [state, setState] = useState({
    products: [], movements: [], recipients: [], branches: [], suppliers: [],
    categories: [], directions: [], productTypes: [], locations: [],
    warehouses: [], campaigns: [],
    stock: {}, stockByWh: {}, flows: {}, checkouts: [], loading: true, error: null,
  })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    try {
      const q = (t, order = 'id') => supabase.from(t).select('*').order(order)
      const [products, movements, recipients, branches, suppliers, categories, directions, productTypes, locations, warehouses, campaigns, stockRows] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('movements').select('*').order('created_at', { ascending: false }).limit(5000),
        supabase.from('recipients').select('*').order('name'),
        q('branches'), q('suppliers'), q('categories'), q('directions'), q('product_types'), q('locations'),
        q('warehouses'), q('campaigns'),
        supabase.from('stock_by_warehouse').select('*'),
      ])
      const err = [products, movements, recipients, branches, suppliers, categories, directions, productTypes, locations, warehouses, campaigns, stockRows].find((r) => r.error)?.error
      const mv = movements.data || []

      // Остатки берём из представления (оно учитывает перемещения)
      const stockByWh = {}, stock = {}
      for (const r of stockRows.data || []) {
        const pid = Number(r.product_id), wid = Number(r.warehouse_id), qty = Number(r.qty) || 0
        if (!stockByWh[pid]) stockByWh[pid] = {}
        stockByWh[pid][wid] = qty
        stock[pid] = (stock[pid] || 0) + qty
      }

      const flows = {}
      for (const m of mv) {
        const f = flows[m.product_id] || (flows[m.product_id] = { in: 0, out: 0, return: 0, writeoff: 0, transfer: 0 })
        if (f[m.type] != null) f[m.type] += m.qty
      }

      // «на руках»: out минус return по (товар|получатель|филиал)
      const grp = {}
      for (const m of [...mv].reverse()) {
        if (m.type !== 'out' && m.type !== 'return') continue
        if (!m.recipient_id) continue
        const k = m.product_id + '|' + m.recipient_id + '|' + (m.branch_id || 0)
        const g = grp[k] || (grp[k] = { product_id: m.product_id, recipient_id: m.recipient_id, branch_id: m.branch_id, remaining: 0, due_date: null, sz: null, created_at: m.created_at })
        if (m.type === 'out') { g.remaining += m.qty; if (m.due_date && !g.due_date) g.due_date = m.due_date; if (m.sz && !g.sz) g.sz = m.sz }
        else g.remaining -= m.qty
      }
      const checkouts = Object.values(grp).filter((g) => g.remaining > 0)

      setState({
        products: products.data || [], movements: mv, recipients: recipients.data || [],
        branches: branches.data || [], suppliers: suppliers.data || [], categories: categories.data || [],
        directions: directions.data || [], productTypes: productTypes.data || [], locations: locations.data || [],
        warehouses: warehouses.data || [], campaigns: campaigns.data || [],
        stock, stockByWh, flows, checkouts, loading: false, error: err ? err.message : null,
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }))
    }
  }, [])

  useEffect(() => { if (profile) load() }, [profile, load])
  return { ...state, reload: load }
}

/* Иерархия: Направление → Тип → Кампания → Продукт */

export function chainOf(product, { directions, productTypes, campaigns }) {
  if (!product) return ''
  const camp = campaigns?.find((c) => c.id === product.campaign_id)
  const type = productTypes?.find((t) => t.id === (camp?.product_type_id || product.product_type_id))
  const dir = directions?.find((d) => d.id === (type?.direction_id || product.direction_id))
  return [dir?.name, type?.name, camp?.name].filter(Boolean).join(' · ')
}

export const typesOf = (directionId, productTypes) =>
  !directionId ? productTypes : productTypes.filter((t) => t.direction_id == directionId)

export const campaignsOf = (typeId, campaigns) =>
  !typeId ? campaigns : campaigns.filter((c) => c.product_type_id == typeId)

export function matchHierarchy(product, filter, { productTypes, campaigns }) {
  const { direction_id, product_type_id, campaign_id } = filter || {}
  if (campaign_id && product.campaign_id != campaign_id) return false
  if (product_type_id) {
    const camp = campaigns.find((c) => c.id === product.campaign_id)
    const tid = camp?.product_type_id || product.product_type_id
    if (tid != product_type_id) return false
  }
  if (direction_id) {
    const camp = campaigns.find((c) => c.id === product.campaign_id)
    const type = productTypes.find((t) => t.id === (camp?.product_type_id || product.product_type_id))
    const did = type?.direction_id || product.direction_id
    if (did != direction_id) return false
  }
  return true
}
