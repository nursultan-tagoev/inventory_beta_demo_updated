/* Расчёты для аналитики. Чистые функции — никакой работы с сетью,
   считаем из того, что уже лежит в кеше данных. */

export const DAY = 86400000
const num = (n) => Number(n) || 0

/* Периоды */
export function periodOf(kind, custom) {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  let start
  if (kind === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1)
  else if (kind === 'quarter') start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  else if (kind === 'year') start = new Date(now.getFullYear(), 0, 1)
  else if (kind === 'custom' && custom?.from) {
    start = new Date(custom.from)
    return { from: start, to: custom.to ? new Date(custom.to + 'T23:59:59') : end }
  } else start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: start, to: end }
}

// Предыдущий отрезок той же длины — чтобы цифра была с чем сравнить
export function prevPeriod({ from, to }) {
  const len = to - from
  return { from: new Date(from - len), to: new Date(from - 1) }
}

const inRange = (d, { from, to }) => {
  const t = new Date(d).getTime()
  return t >= from.getTime() && t <= to.getTime()
}

/* Иерархия товара: направление и тип через кампанию */
export function hierOf(product, { campaigns, productTypes, directions }) {
  if (!product) return { dir: null, type: null, camp: null }
  const camp = campaigns?.find((c) => c.id === product.campaign_id) || null
  const type = productTypes?.find((t) => t.id === (camp?.product_type_id || product.product_type_id)) || null
  const dir = directions?.find((d) => d.id === (type?.direction_id || product.direction_id)) || null
  return { dir, type, camp }
}

/* Сводка по деньгам */
export function money(data, period, opts = {}) {
  const { movements, products } = data
  const price = (id) => num(products.find((p) => p.id === id)?.price)
  const mv = (movements || []).filter((m) => inRange(m.created_at, period))
    .filter((m) => (opts.branchId ? m.branch_id === opts.branchId : true))

  const sum = (type) => mv.filter((m) => m.type === type)
    .reduce((a, m) => a + num(m.qty) * price(m.product_id), 0)
  const qty = (type) => mv.filter((m) => m.type === type).reduce((a, m) => a + num(m.qty), 0)

  return {
    buyVal: sum('in'), buyQty: qty('in'),
    outVal: sum('out'), outQty: qty('out'),
    lossVal: sum('writeoff') + sum('defect'), lossQty: qty('writeoff') + qty('defect'),
    ops: mv.length,
  }
}

export const growth = (now, was) => (!was ? (now ? 100 : 0) : Math.round(((now - was) / was) * 1000) / 10)

/* Разрез закупок: по поставщикам и по иерархии */
export function purchases(data, period) {
  const { movements, products, suppliers, deliveries } = data
  const price = (id) => num(products.find((p) => p.id === id)?.price)
  const ins = (movements || []).filter((m) => m.type === 'in' && inRange(m.created_at, period))

  const bySupplier = {}
  for (const m of ins) {
    const sid = m.supplier_id || 0
    const g = bySupplier[sid] || (bySupplier[sid] = { id: sid, name: suppliers.find((s) => s.id === sid)?.name || 'Без поставщика', val: 0, qty: 0, deliveries: new Set() })
    g.val += num(m.qty) * price(m.product_id)
    g.qty += num(m.qty)
    if (m.delivery_id) g.deliveries.add(m.delivery_id)
  }
  // Качество: срыв сроков и брак берём из поставок за период
  const dlv = (deliveries || []).filter((d) => inRange(d.created_at, period))
  for (const g of Object.values(bySupplier)) {
    const list = dlv.filter((d) => d.supplier_id === g.id)
    g.dlvCount = list.length
    g.late = list.filter((d) => d.on_time === false).length
    g.defects = list.reduce((a, d) => a + num(d.defects), 0)
    g.defectRate = g.qty + g.defects > 0 ? Math.round((g.defects / (g.qty + g.defects)) * 1000) / 10 : 0
    delete g.deliveries
  }

  const byDir = {}
  for (const m of ins) {
    const p = products.find((x) => x.id === m.product_id)
    const { dir, type } = hierOf(p, data)
    const key = dir?.id || 0
    const g = byDir[key] || (byDir[key] = { id: key, name: dir?.name || 'Без направления', val: 0, qty: 0, types: {} })
    const v = num(m.qty) * price(m.product_id)
    g.val += v; g.qty += num(m.qty)
    const tk = type?.id || 0
    const t = g.types[tk] || (g.types[tk] = { name: type?.name || 'Без типа', val: 0, qty: 0 })
    t.val += v; t.qty += num(m.qty)
  }

  return {
    bySupplier: Object.values(bySupplier).sort((a, b) => b.val - a.val),
    byDir: Object.values(byDir).map((d) => ({ ...d, types: Object.values(d.types).sort((a, b) => b.val - a.val) }))
      .sort((a, b) => b.val - a.val),
  }
}

/* Расход по филиалам и людям */
export function spending(data, period, opts = {}) {
  const { movements, products, branches, profiles } = data
  const price = (id) => num(products.find((p) => p.id === id)?.price)
  const outs = (movements || []).filter((m) => m.type === 'out' && inRange(m.created_at, period))
    .filter((m) => (opts.branchId ? m.branch_id === opts.branchId : true))

  const byBranch = {}, byPerson = {}, byProduct = {}
  for (const m of outs) {
    const v = num(m.qty) * price(m.product_id)
    const bk = m.branch_id || 0
    const b = byBranch[bk] || (byBranch[bk] = { id: bk, name: branches.find((x) => x.id === bk)?.name || 'Без филиала', val: 0, qty: 0 })
    b.val += v; b.qty += num(m.qty)

    if (m.recipient_profile_id) {
      const pr = profiles.find((x) => x.id === m.recipient_profile_id)
      const g = byPerson[m.recipient_profile_id] || (byPerson[m.recipient_profile_id] = { id: m.recipient_profile_id, name: pr?.full_name || pr?.email || '—', val: 0, qty: 0 })
      g.val += v; g.qty += num(m.qty)
    }
    const p = byProduct[m.product_id] || (byProduct[m.product_id] = { id: m.product_id, name: products.find((x) => x.id === m.product_id)?.name || '—', val: 0, qty: 0 })
    p.val += v; p.qty += num(m.qty)
  }
  const srt = (o) => Object.values(o).sort((a, b) => b.val - a.val)
  return { byBranch: srt(byBranch), byPerson: srt(byPerson), byProduct: srt(byProduct) }
}

/* Запасы: что кончается, что не двигается */
export function stockHealth(data, { lowThreshold = 10, deadDays = 90 } = {}) {
  const { products, movements, stock } = data
  const price = (id) => num(products.find((p) => p.id === id)?.price)
  const since30 = Date.now() - 30 * DAY
  const sinceDead = Date.now() - deadDays * DAY

  const out30 = {}, lastOut = {}
  for (const m of movements || []) {
    if (m.type !== 'out') continue
    const t = new Date(m.created_at).getTime()
    if (t >= since30) out30[m.product_id] = (out30[m.product_id] || 0) + num(m.qty)
    if (!lastOut[m.product_id] || t > lastOut[m.product_id]) lastOut[m.product_id] = t
  }

  const alive = (products || []).filter((p) => !p.archived)

  const ending = alive.map((p) => {
    const qty = num(stock[p.id])
    const rate = (out30[p.id] || 0) / 30            // штук в день
    const days = rate > 0 ? Math.floor(qty / rate) : null
    return { id: p.id, name: p.name, qty, rate: Math.round(rate * 10) / 10, days, val: qty * price(p.id) }
  }).filter((r) => r.qty <= lowThreshold || (r.days !== null && r.days <= 14))
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))

  const dead = alive.map((p) => {
    const qty = num(stock[p.id])
    const last = lastOut[p.id] || null
    return { id: p.id, name: p.name, qty, val: qty * price(p.id), last }
  }).filter((r) => r.qty > 0 && (!r.last || r.last < sinceDead))
    .sort((a, b) => b.val - a.val)

  return { ending, dead, deadVal: dead.reduce((a, r) => a + r.val, 0) }
}

/* Процесс: сколько идёт заявка и где стоит */
export function processStats(data, period, opts = {}) {
  const { requests, reqApprovers, movements, profiles } = data
  const reqs = (requests || []).filter((r) => inRange(r.created_at, period))
    .filter((r) => (opts.branchId ? r.branch_id === opts.branchId : true))

  // Момент выдачи берём по первому движению, привязанному к заявке
  const issuedAt = {}
  for (const m of movements || []) {
    if (m.type !== 'out' || !m.request_id) continue
    const t = new Date(m.created_at).getTime()
    if (!issuedAt[m.request_id] || t < issuedAt[m.request_id]) issuedAt[m.request_id] = t
  }

  const legs = { approve: [], send: [], issue: [], total: [] }
  for (const r of reqs) {
    const born = new Date(r.created_at).getTime()
    const appr = (reqApprovers || []).filter((a) => a.request_id === r.id && a.status === 'approved' && a.acted_at)
    const lastAppr = appr.length ? Math.max(...appr.map((a) => new Date(a.acted_at).getTime())) : null
    const sent = r.sent_at ? new Date(r.sent_at).getTime() : null
    const got = issuedAt[r.id] || null

    if (lastAppr) legs.approve.push(lastAppr - born)
    if (sent) legs.send.push(sent - (lastAppr || born))
    if (got && sent) legs.issue.push(got - sent)
    if (got) legs.total.push(got - born)
  }
  const avgDays = (arr) => (arr.length ? Math.round((arr.reduce((a, n) => a + n, 0) / arr.length / DAY) * 10) / 10 : null)

  // Где стоит прямо сейчас
  const now = Date.now()
  const stuck = (requests || [])
    .filter((r) => (opts.branchId ? r.branch_id === opts.branchId : true))
    .filter((r) => !['issued', 'received', 'rejected', 'archived'].includes(r.status))
    .map((r) => {
      const waiting = (reqApprovers || []).filter((a) => a.request_id === r.id && a.status === 'waiting')
        .sort((a, b) => a.order_no - b.order_no)[0]
      let stage, who
      if (waiting) {
        stage = 'Ждёт согласования'
        const p = profiles.find((x) => x.id === waiting.user_id)
        who = p?.full_name || p?.email || waiting.name || '—'
      } else if (!r.sent_at) {
        stage = 'Не отправлена на склад'
        const p = profiles.find((x) => x.id === r.author_id)
        who = p?.full_name || p?.email || '—'
      } else {
        stage = 'Ждёт выдачи'
        who = 'Склад'
      }
      const since = new Date(r.sent_at || r.created_at).getTime()
      return { id: r.id, stage, who, days: Math.floor((now - since) / DAY), purpose: r.purpose }
    })
    .filter((r) => r.days >= 1)
    .sort((a, b) => b.days - a.days)

  // Нагрузка на согласующих
  const load = {}
  for (const a of reqApprovers || []) {
    if (a.status !== 'waiting' || !a.user_id) continue
    const p = profiles.find((x) => x.id === a.user_id)
    const g = load[a.user_id] || (load[a.user_id] = { id: a.user_id, name: p?.full_name || p?.email || '—', count: 0 })
    g.count++
  }

  const byStatus = {}
  for (const r of reqs) byStatus[r.status] = (byStatus[r.status] || 0) + 1

  return {
    total: reqs.length, byStatus,
    avgApprove: avgDays(legs.approve), avgSend: avgDays(legs.send),
    avgIssue: avgDays(legs.issue), avgTotal: avgDays(legs.total),
    stuck, load: Object.values(load).sort((a, b) => b.count - a.count),
  }
}

/* Сколько в среднем согласует конкретный человек */
export function myApprovalSpeed(data, profileId) {
  const { reqApprovers, requests } = data
  const mine = (reqApprovers || []).filter((a) => a.user_id === profileId && a.status === 'approved' && a.acted_at)
  const spans = mine.map((a) => {
    const r = (requests || []).find((x) => x.id === a.request_id)
    if (!r) return null
    return new Date(a.acted_at).getTime() - new Date(r.created_at).getTime()
  }).filter(Boolean)
  const waiting = (reqApprovers || []).filter((a) => a.user_id === profileId && a.status === 'waiting').length
  return {
    avg: spans.length ? Math.round((spans.reduce((a, n) => a + n, 0) / spans.length / DAY) * 10) / 10 : null,
    done: spans.length, waiting,
  }
}

/* Динамика по месяцам */
export function monthly(data, months = 6) {
  const { movements, products } = data
  const price = (id) => num(products.find((p) => p.id === id)?.price)
  const out = []
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
    const mv = (movements || []).filter((m) => inRange(m.created_at, { from, to }))
    out.push({
      label: from.toLocaleDateString('ru-RU', { month: 'short' }),
      buy: mv.filter((m) => m.type === 'in').reduce((a, m) => a + num(m.qty) * price(m.product_id), 0),
      spend: mv.filter((m) => m.type === 'out').reduce((a, m) => a + num(m.qty) * price(m.product_id), 0),
    })
  }
  return out
}

/* Города: филиалы группируются по городу — так удобнее смотреть регионам */
export function byCity(data, period, opts = {}) {
  const { movements, products, branches } = data
  const price = (id) => num(products.find((p) => p.id === id)?.price)
  const outs = (movements || []).filter((m) => m.type === 'out' && inRange(m.created_at, period))
    .filter((m) => (opts.branchId ? m.branch_id === opts.branchId : true))

  const g = {}
  for (const m of outs) {
    const b = branches.find((x) => x.id === m.branch_id)
    const city = b?.city || '—'
    const c = g[city] || (g[city] = { city, val: 0, qty: 0, branches: {} })
    const v = num(m.qty) * price(m.product_id)
    c.val += v; c.qty += num(m.qty)
    const bk = b?.name || 'Без филиала'
    const bb = c.branches[bk] || (c.branches[bk] = { name: bk, val: 0, qty: 0 })
    bb.val += v; bb.qty += num(m.qty)
  }
  return Object.values(g)
    .map((c) => ({ ...c, branches: Object.values(c.branches).sort((a, b) => b.val - a.val) }))
    .sort((a, b) => b.val - a.val)
}

/* Просрочки: выдано с датой возврата, срок прошёл */
export function overdue(data, opts = {}) {
  const { checkouts, products, recipients, branches } = data
  const today = new Date().toISOString().slice(0, 10)
  return (checkouts || [])
    .filter((c) => c.due_date && c.due_date < today)
    .filter((c) => (opts.branchId ? c.branch_id === opts.branchId : true))
    .map((c) => ({
      ...c,
      product: products.find((p) => p.id === c.product_id)?.name || '—',
      person: recipients.find((r) => r.id === c.recipient_id)?.name || '—',
      branch: branches.find((b) => b.id === c.branch_id)?.name || '—',
      days: Math.floor((Date.now() - new Date(c.due_date).getTime()) / DAY),
    }))
    .sort((a, b) => b.days - a.days)
}

/* Ряд для спарклайна: обороты по неделям */
export function sparkline(data, weeks = 12, type = 'out', opts = {}) {
  const { movements, products } = data
  const price = (id) => num(products.find((p) => p.id === id)?.price)
  const now = Date.now()
  const out = []
  for (let i = weeks - 1; i >= 0; i--) {
    const to = now - i * 7 * DAY
    const from = to - 7 * DAY
    const v = (movements || [])
      .filter((m) => m.type === type)
      .filter((m) => (opts.branchId ? m.branch_id === opts.branchId : true))
      .filter((m) => { const t = new Date(m.created_at).getTime(); return t > from && t <= to })
      .reduce((a, m) => a + num(m.qty) * price(m.product_id), 0)
    out.push(v)
  }
  return out
}

/* Стоимость товаров в разрезах.
   mode 'stock'    — что лежит на складах (для склада и директора)
   mode 'received' — что получил филиал за период (для руководителя) */
export function valueBreakdown(data, { mode = 'stock', period, branchId } = {}) {
  const { products, stock, movements } = data
  const price = (id) => num(products.find((p) => p.id === id)?.price)

  let rows = []
  if (mode === 'stock') {
    rows = (products || []).filter((p) => !p.archived)
      .map((p) => ({ product: p, qty: num(stock[p.id]) }))
      .filter((r) => r.qty > 0)
  } else {
    const agg = {}
    for (const m of movements || []) {
      if (m.type !== 'out') continue
      if (period && !inRange(m.created_at, period)) continue
      if (branchId && m.branch_id !== branchId) continue
      agg[m.product_id] = (agg[m.product_id] || 0) + num(m.qty)
    }
    rows = Object.entries(agg).map(([pid, qty]) => ({
      product: (products || []).find((p) => p.id === Number(pid)), qty,
    })).filter((r) => r.product)
  }

  const byProduct = [], byDir = {}, byType = {}
  let total = 0
  for (const r of rows) {
    const val = r.qty * price(r.product.id)
    total += val
    byProduct.push({ id: r.product.id, name: r.product.name, qty: r.qty, val })

    const { dir, type } = hierOf(r.product, data)
    const dk = dir?.id || 0
    const d = byDir[dk] || (byDir[dk] = { id: dk, name: dir?.name || 'Без направления', qty: 0, val: 0 })
    d.qty += r.qty; d.val += val

    const tk = type?.id || 0
    const t = byType[tk] || (byType[tk] = { id: tk, name: type?.name || 'Без типа', dir: dir?.name || '—', qty: 0, val: 0 })
    t.qty += r.qty; t.val += val
  }

  const srt = (a) => a.sort((x, y) => y.val - x.val)
  return {
    total,
    byProduct: srt(byProduct),
    byDir: srt(Object.values(byDir)),
    byType: srt(Object.values(byType)),
  }
}
