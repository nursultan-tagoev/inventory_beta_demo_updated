import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

/* Данные разложены по ресурсам. После действия перечитывается не всё,
   а только затронутое — см. карту AFFECTS. */

const EMPTY = {
  products: [], movements: [], recipients: [], branches: [], suppliers: [],
  categories: [], directions: [], productTypes: [], locations: [],
  warehouses: [], campaigns: [], requests: [], reservations: [], profiles: [],
  acts: [], actSigners: [], externals: [], reqApprovers: [], reqMessages: [],
  deliveries: [], inventories: [],
  stock: {}, stockByWh: {}, freeByWh: {}, resvByWh: {}, flows: {}, checkouts: [],
  loading: true, error: null,
}

/* Какое действие какие ресурсы портит */
export const AFFECTS = {
  approve:   ['requests', 'approvers'],
  send:      ['requests'],
  cancel:    ['requests'],
  issue:     ['requests', 'movements', 'stock', 'acts', 'reservations'],
  receive:   ['movements', 'stock', 'deliveries'],
  writeoff:  ['movements', 'stock'],
  defect:    ['movements', 'stock', 'deliveries'],
  adjust:    ['movements', 'stock', 'inventories'],
  inventory: ['inventories'],
  act:       ['acts', 'requests'],
  chat:      ['messages'],
  users:     ['profiles'],
  refs:      ['refs', 'products'],
  catalog:   ['products', 'stock'],
}

const q = (t, order = 'id') => supabase.from(t).select('*').order(order)

function buildRequests(reqs, items) {
  const byReq = {}
  for (const it of items || []) (byReq[it.request_id] || (byReq[it.request_id] = [])).push(it)
  return (reqs || []).map((r) => ({ ...r, items: byReq[r.id] || [] }))
}

// Производные от движений: обороты и «на руках»
function deriveFromMovements(mv) {
  const flows = {}
  for (const m of mv) {
    const f = flows[m.product_id] || (flows[m.product_id] = { in: 0, out: 0, return: 0, writeoff: 0, transfer: 0, defect: 0 })
    if (f[m.type] != null) f[m.type] += m.qty
  }
  const grp = {}
  for (const m of [...mv].reverse()) {
    if (m.type !== 'out' && m.type !== 'return') continue
    if (!m.recipient_id) continue
    const k = m.product_id + '|' + m.recipient_id + '|' + (m.branch_id || 0)
    const g = grp[k] || (grp[k] = { product_id: m.product_id, recipient_id: m.recipient_id, branch_id: m.branch_id, remaining: 0, due_date: null, sz: null, created_at: m.created_at })
    if (m.type === 'out') { g.remaining += m.qty; if (m.due_date && !g.due_date) g.due_date = m.due_date; if (m.sz && !g.sz) g.sz = m.sz }
    else g.remaining -= m.qty
  }
  return { flows, checkouts: Object.values(grp).filter((g) => g.remaining > 0) }
}

/* Загрузчики: каждый возвращает свой кусок состояния */
const FETCH = {
  async refs() {
    const [branches, suppliers, categories, directions, productTypes, locations, warehouses, campaigns, recipients, externals] =
      await Promise.all([
        q('branches'), q('suppliers'), q('categories'), q('directions'), q('product_types'),
        q('locations'), q('warehouses'), q('campaigns'),
        supabase.from('recipients').select('*').order('name'),
        q('external_approvers', 'level'),
      ])
    return {
      branches: branches.data || [], suppliers: suppliers.data || [], categories: categories.data || [],
      directions: directions.data || [], productTypes: productTypes.data || [], locations: locations.data || [],
      warehouses: warehouses.data || [], campaigns: campaigns.data || [],
      recipients: recipients.data || [], externals: externals.data || [],
    }
  },

  async products() {
    const { data } = await supabase.from('products').select('*').order('name')
    return { products: data || [] }
  },

  async movements() {
    const { data } = await supabase.from('movements').select('*')
      .order('created_at', { ascending: false }).limit(2000)
    const mv = data || []
    return { movements: mv, ...deriveFromMovements(mv) }
  },

  async stock() {
    const [rows, free] = await Promise.all([
      supabase.from('stock_by_warehouse').select('*'),
      supabase.from('stock_free').select('*'),
    ])
    const stockByWh = {}, stock = {}
    for (const r of rows.data || []) {
      const pid = Number(r.product_id), wid = Number(r.warehouse_id), qty = Number(r.qty) || 0
      if (!stockByWh[pid]) stockByWh[pid] = {}
      stockByWh[pid][wid] = qty
      stock[pid] = (stock[pid] || 0) + qty
    }
    const freeByWh = {}, resvByWh = {}
    for (const r of free.data || []) {
      const pid = Number(r.product_id), wid = Number(r.warehouse_id)
      if (!freeByWh[pid]) { freeByWh[pid] = {}; resvByWh[pid] = {} }
      freeByWh[pid][wid] = Number(r.qty_free) || 0
      resvByWh[pid][wid] = Number(r.qty_reserved) || 0
    }
    return { stock, stockByWh, freeByWh, resvByWh }
  },

  async requests() {
    const [reqs, items] = await Promise.all([
      supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('request_items').select('*'),
    ])
    return { requests: buildRequests(reqs.data, items.data) }
  },

  async approvers() {
    const { data } = await q('request_approvers', 'order_no')
    return { reqApprovers: data || [] }
  },

  async messages() {
    const { data } = await q('request_messages', 'created_at')
    return { reqMessages: data || [] }
  },

  async acts() {
    const [acts, signers] = await Promise.all([
      supabase.from('acts').select('*').order('created_at', { ascending: false }).limit(1000),
      q('act_signers', 'order_no'),
    ])
    return { acts: acts.data || [], actSigners: signers.data || [] }
  },

  async profiles() {
    const { data } = await supabase.from('profiles').select('*')
    return { profiles: data || [] }
  },

  async reservations() {
    const { data } = await supabase.from('reservations').select('*').eq('active', true)
    return { reservations: data || [] }
  },

  async deliveries() {
    const { data } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false }).limit(300)
    return { deliveries: data || [] }
  },

  async inventories() {
    const { data } = await supabase.from('inventories').select('*').order('started_at', { ascending: false })
    return { inventories: data || [] }
  },
}

const ALL = Object.keys(FETCH)

export function useAppData(profile) {
  const [state, setState] = useState(EMPTY)

  // Номер на каждый ресурс: устаревший ответ не затирает свежий
  const seq = useRef({})
  const timer = useRef(null)
  const dirty = useRef(new Set())

  /* Перечитать конкретные ресурсы */
  const invalidate = useCallback(async (keys, opts = {}) => {
    const list = (Array.isArray(keys) ? keys : [keys]).filter((k) => FETCH[k])
    if (!list.length) return
    if (!opts.silent) setState((s) => ({ ...s, loading: true }))

    const mine = {}
    for (const k of list) mine[k] = (seq.current[k] = (seq.current[k] || 0) + 1)

    const parts = await Promise.all(list.map(async (k) => {
      try {
        const part = await FETCH[k]()
        return mine[k] === seq.current[k] ? part : null   // пока грузили, стартовала новая
      } catch (e) {
        return { error: e.message }
      }
    }))

    setState((s) => Object.assign({}, s, ...parts.filter(Boolean), { loading: false }))
  }, [])

  const load = useCallback((opts = {}) => invalidate(ALL, opts), [invalidate])
  const refresh = useCallback(() => invalidate(ALL, { silent: true }), [invalidate])

  /* События сыплются пачками — копим ключи и обновляем одним заходом */
  const bump = useCallback((keys) => {
    for (const k of (Array.isArray(keys) ? keys : [keys])) dirty.current.add(k)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const list = [...dirty.current]
      dirty.current.clear()
      invalidate(list, { silent: true })
    }, 300)
  }, [invalidate])

  useEffect(() => { if (profile?.id) load() }, [profile?.id, load])
  useEffect(() => () => clearTimeout(timer.current), [])

  /* Realtime: событие не несёт данные, а лишь помечает ресурс устаревшим */
  useEffect(() => {
    if (!profile?.id) return
    const MAP = {
      requests: ['requests'], request_items: ['requests'],
      request_approvers: ['approvers'], request_messages: ['messages'],
      acts: ['acts'], act_signers: ['acts'],
      reservations: ['reservations', 'stock'],
      movements: ['movements', 'stock'],
      deliveries: ['deliveries'],
      inventories: ['inventories'], inventory_items: ['inventories'],
      products: ['products', 'stock'], profiles: ['profiles'],
    }
    const ch = supabase.channel('app-live')
    for (const [table, keys] of Object.entries(MAP)) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => bump(keys))
    }
    ch.subscribe((st) => { if (st !== 'SUBSCRIBED') console.warn('[realtime]', st) })
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id, bump])

  /* Подстраховка, если вебсокет не проходит */
  useEffect(() => {
    if (!profile?.id) return
    const hot = ['requests', 'approvers', 'movements', 'stock', 'acts']
    const tick = () => { if (document.visibilityState === 'visible') invalidate(hot, { silent: true }) }
    const iv = setInterval(tick, 25000)
    const onBack = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onBack)
    window.addEventListener('focus', onBack)
    window.addEventListener('online', onBack)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onBack)
      window.removeEventListener('focus', onBack)
      window.removeEventListener('online', onBack)
    }
  }, [profile?.id, invalidate, refresh])

  /* Мгновенный отклик до ответа сервера */
  const bumpStock = useCallback((deltas) => setState((s) => {
    const stockByWh = { ...s.stockByWh }, stock = { ...s.stock }, freeByWh = { ...s.freeByWh }
    for (const d of deltas || []) {
      const pid = Number(d.product_id), wid = Number(d.warehouse_id), n = Number(d.delta) || 0
      if (!pid || !wid || !n) continue
      stockByWh[pid] = { ...(stockByWh[pid] || {}) }
      stockByWh[pid][wid] = (stockByWh[pid][wid] || 0) + n
      stock[pid] = (stock[pid] || 0) + n
      if (freeByWh[pid]) { freeByWh[pid] = { ...freeByWh[pid] }; freeByWh[pid][wid] = (freeByWh[pid][wid] || 0) + n }
    }
    return { ...s, stockByWh, stock, freeByWh }
  }), [])

  const patchRequest = useCallback((id, fields) => setState((s) => ({
    ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, ...fields } : r)),
  })), [])

  const patchApprover = useCallback((id, fields) => setState((s) => ({
    ...s, reqApprovers: s.reqApprovers.map((a) => (a.id === id ? { ...a, ...fields } : a)),
  })), [])

  return {
    ...state,
    reload: refresh,        // старые вызовы больше не мигают экраном
    refresh, invalidate, load,
    bumpStock, patchRequest, patchApprover,
  }
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
