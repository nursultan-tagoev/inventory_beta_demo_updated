import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export function useAppData(profile) {
  const [state, setState] = useState({
    products: [], movements: [], recipients: [], branches: [], suppliers: [],
    categories: [], directions: [], productTypes: [], locations: [],
    stock: {}, flows: {}, checkouts: [], loading: true, error: null,
  })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    try {
      const q = (t, order = 'id') => supabase.from(t).select('*').order(order)
      const [products, movements, recipients, branches, suppliers, categories, directions, productTypes, locations] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('movements').select('*').order('created_at', { ascending: false }).limit(5000),
        supabase.from('recipients').select('*').order('name'),
        q('branches'), q('suppliers'), q('categories'), q('directions'), q('product_types'), q('locations'),
      ])
      const err = [products, movements, recipients, branches, suppliers, categories, directions, productTypes, locations].find((r) => r.error)?.error
      const mv = movements.data || []

      const stock = {}, flows = {}
      for (const m of mv) {
        const sign = m.type === 'in' || m.type === 'return' ? 1 : -1
        stock[m.product_id] = (stock[m.product_id] || 0) + sign * m.qty
        const f = flows[m.product_id] || (flows[m.product_id] = { in: 0, out: 0, return: 0, writeoff: 0 })
        f[m.type] += m.qty
      }
      // "на руках": out минус return по (товар|получатель|филиал)
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
        stock, flows, checkouts, loading: false, error: err ? err.message : null,
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }))
    }
  }, [])

  useEffect(() => { if (profile) load() }, [profile, load])
  return { ...state, reload: load }
}
