import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

export function useAppData(profile) {
  const [state, setState] = useState({
    products: [], movements: [], recipients: [], branches: [], suppliers: [],
    categories: [], directions: [], productTypes: [], locations: [],
    warehouses: [], campaigns: [], requests: [], reservations: [], profiles: [], acts: [], actSigners: [], externals: [], reqApprovers: [], reqMessages: [],
    stock: {}, stockByWh: {}, freeByWh: {}, resvByWh: {}, flows: {}, checkouts: [], loading: true, error: null,
  })

  // Номер загрузки: ответы приходят вразнобой, и устаревший не должен
  // затирать свежий — иначе экран откатывается к состоянию до действия.
  const seq = useRef(0)
  const timer = useRef(null)

  const load = useCallback(async (opts = {}) => {
    const my = ++seq.current
    if (!opts.silent) setState((s) => ({ ...s, loading: true }))
    try {
      const q = (t, order = 'id') => supabase.from(t).select('*').order(order)
      const [products, movements, recipients, branches, suppliers, categories, directions, productTypes, locations, warehouses, campaigns, stockRows, requestsRes, reqItemsRes, freeRes, resvRes, profilesRes, actsRes, signersRes, extRes, reqApprRes, msgRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('movements').select('*').order('created_at', { ascending: false }).limit(5000),
        supabase.from('recipients').select('*').order('name'),
        q('branches'), q('suppliers'), q('categories'), q('directions'), q('product_types'), q('locations'),
        q('warehouses'), q('campaigns'),
        supabase.from('stock_by_warehouse').select('*'),
        supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('request_items').select('*'),
        supabase.from('stock_free').select('*'),
        supabase.from('reservations').select('*').eq('active', true),
        supabase.from('profiles').select('*'),
        supabase.from('acts').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('act_signers').select('*').order('order_no'),
        supabase.from('external_approvers').select('*').order('level'),
        supabase.from('request_approvers').select('*').order('order_no'),
        supabase.from('request_messages').select('*').order('created_at'),
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
      // Свободный остаток (минус активные резервы)
      const freeByWh = {}, resvByWh = {}
      for (const r of freeRes?.data || []) {
        const pid = Number(r.product_id), wid = Number(r.warehouse_id)
        if (!freeByWh[pid]) { freeByWh[pid] = {}; resvByWh[pid] = {} }
        freeByWh[pid][wid] = Number(r.qty_free) || 0
        resvByWh[pid][wid] = Number(r.qty_reserved) || 0
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

      if (my !== seq.current) return   // пока считали, стартовала новая загрузка
      setState({
        products: products.data || [], movements: mv, recipients: recipients.data || [],
        branches: branches.data || [], suppliers: suppliers.data || [], categories: categories.data || [],
        directions: directions.data || [], productTypes: productTypes.data || [], locations: locations.data || [],
        warehouses: warehouses.data || [], campaigns: campaigns.data || [],
        requests: buildRequests(requestsRes?.data, reqItemsRes?.data),
        reservations: resvRes?.data || [], profiles: profilesRes?.data || [],
        acts: actsRes?.data || [], actSigners: signersRes?.data || [], externals: extRes?.data || [], reqApprovers: reqApprRes?.data || [], reqMessages: msgRes?.data || [],
        stock, stockByWh, freeByWh, resvByWh, flows, checkouts, loading: false, error: err ? err.message : null,
      })
    } catch (e) {
      if (my !== seq.current) return
      setState((s) => ({ ...s, loading: false, error: e.message }))
    }
  }, [])

  // Изменения сыплются пачками — собираем их в одну тихую перезагрузку
  const bump = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => load({ silent: true }), 350)
  }, [load])

  // Зависим от id, а не от объекта: новая ссылка на профиль — не повод перечитывать всё
  useEffect(() => { if (profile?.id) load() }, [profile?.id, load])
  useEffect(() => () => clearTimeout(timer.current), [])

  // Realtime: заявки обновляются у всех сразу
  useEffect(() => {
    if (!profile) return
    const ch = supabase.channel('requests-live')
    for (const t of ['requests', 'request_items', 'acts', 'act_signers', 'reservations',
                     'request_approvers', 'request_messages', 'movements']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, bump)
    }
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id, bump])

  /* Мгновенный отклик: показываем результат сразу, сервер догоняет.
     Человек уже знает, что сделал, — ждать ответа, чтобы это отрисовать, незачем. */

  // Поправить остаток по дельтам: [{ product_id, warehouse_id, delta }]
  const bumpStock = useCallback((deltas) => setState((s) => {
    const stockByWh = { ...s.stockByWh }, stock = { ...s.stock }, freeByWh = { ...s.freeByWh }
    for (const d of deltas || []) {
      const pid = Number(d.product_id), wid = Number(d.warehouse_id), n = Number(d.delta) || 0
      if (!pid || !wid || !n) continue
      stockByWh[pid] = { ...(stockByWh[pid] || {}) }
      stockByWh[pid][wid] = (stockByWh[pid][wid] || 0) + n
      stock[pid] = (stock[pid] || 0) + n
      if (freeByWh[pid]) {
        freeByWh[pid] = { ...freeByWh[pid] }
        freeByWh[pid][wid] = (freeByWh[pid][wid] || 0) + n
      }
    }
    return { ...s, stockByWh, stock, freeByWh }
  }), [])

  // Обновить одну заявку в списке, не перечитывая всё
  const patchRequest = useCallback((id, fields) => setState((s) => ({
    ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, ...fields } : r)),
  })), [])

  // Обновить согласующего в цепочке
  const patchApprover = useCallback((id, fields) => setState((s) => ({
    ...s, reqApprovers: s.reqApprovers.map((a) => (a.id === id ? { ...a, ...fields } : a)),
  })), [])

  // Подмешать свежее движение в журнал
  const addMovements = useCallback((rows) => setState((s) => ({
    ...s, movements: [...(rows || []), ...s.movements],
  })), [])

  return { ...state, reload: load, refresh: () => load({ silent: true }), bumpStock, patchRequest, patchApprover, addMovements }
}

function buildRequests(reqs, items) {
  const byReq = {}
  for (const it of items || []) (byReq[it.request_id] || (byReq[it.request_id] = [])).push(it)
  return (reqs || []).map((r) => ({ ...r, items: byReq[r.id] || [] }))
}

/* Свободный остаток */
export const freeAt = (freeByWh, stockByWh, productId, warehouseId) => {
  const f = freeByWh?.[Number(productId)]?.[Number(warehouseId)]
  if (f != null) return f
  return (stockByWh?.[Number(productId)]?.[Number(warehouseId)]) || 0
}
export const freeAll = (freeByWh, stockByWh, productId) => {
  const row = freeByWh?.[Number(productId)]
  if (row) return Object.values(row).reduce((s, n) => s + n, 0)
  return Object.values(stockByWh?.[Number(productId)] || {}).reduce((s, n) => s + n, 0)
}
export const reservedAll = (resvByWh, productId) =>
  Object.values(resvByWh?.[Number(productId)] || {}).reduce((s, n) => s + n, 0)

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
