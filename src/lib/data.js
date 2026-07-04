import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// Загружает справочники, товары, движения; считает остатки на клиенте.
export function useAppData(profile) {
  const [state, setState] = useState({
    products: [], movements: [], recipients: [], branches: [], suppliers: [],
    stock: {}, loading: true, error: null,
  })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    try {
      const [products, movements, recipients, branches, suppliers] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('movements').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('recipients').select('*').order('name'),
        supabase.from('branches').select('*').order('name'),
        supabase.from('suppliers').select('*').order('name'),
      ])
      const err = products.error || movements.error || recipients.error || branches.error || suppliers.error
      const mv = movements.data || []
      const stock = {}
      for (const m of mv) {
        const d = m.type === 'in' || m.type === 'return' ? m.qty : -m.qty
        stock[m.product_id] = (stock[m.product_id] || 0) + d
      }
      setState({
        products: products.data || [], movements: mv, recipients: recipients.data || [],
        branches: branches.data || [], suppliers: suppliers.data || [],
        stock, loading: false, error: err ? err.message : null,
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }))
    }
  }, [])

  useEffect(() => { if (profile) load() }, [profile, load])

  return { ...state, reload: load }
}
