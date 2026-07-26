// Клиентская часть Люси: локальный разбор (офлайн-запас) + обращение к /api/lucy (мозг под капотом).

const NUM = { ноль:0,один:1,одна:1,одну:1,два:2,две:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9,десять:10,одиннадцать:11,двенадцать:12,тринадцать:13,четырнадцать:14,пятнадцать:15,шестнадцать:16,семнадцать:17,восемнадцать:18,девятнадцать:19,двадцать:20,тридцать:30,сорок:40,пятьдесят:50,шестьдесят:60,семьдесят:70,восемьдесят:80,девяносто:90,сто:100,двести:200,триста:300,пара:2,пару:2,десяток:10 }
export const norm = (s) => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[.,!?;:]/g, '').trim()
export function parseQty(low) {
  const d = (low || '').match(/\b(\d+)\b/); if (d) return parseInt(d[1])
  let t = 0, f = false; norm(low).split(/\s+/).forEach((w) => { if (NUM[w] != null) { t += NUM[w]; f = true } }); return f ? t : null
}
function cpref(a, b) { let i = 0; const n = Math.min(a.length, b.length); while (i < n && a[i] === b[i]) i++; return i }
export function matchName(low, names) {
  const ws = norm(low).split(/\s+/).filter((w) => w.length > 2)
  let best = null, sc = 0
  names.forEach((nm) => {
    const nt = norm(nm).split(/\s+/).filter((w) => w.length > 2); let s = 0
    nt.forEach((x) => ws.forEach((w) => { if (w === x) s += 3; else { const cp = cpref(w, x), ml = Math.min(w.length, x.length); if (cp >= 5 || (cp >= 3 && ml <= 5)) s += 2.5 } }))
    if (norm(nm).length > 2 && norm(low).includes(norm(nm))) s += 3
    if (s > sc) { sc = s; best = nm }
  })
  return sc >= 2.5 ? best : null
}

const SCREENS = { главная: 'home', товары: 'items', движения: 'movements', получатели: 'recipients', отчёты: 'reports', отчеты: 'reports', аналитика: 'reports', справочники: 'settings' }

// Локальный разбор: возвращает {call,_cheap} для простого, иначе null (тогда идём в ИИ).
export function localBrain(text, role, products, recipients) {
  const low = norm(text)
  const stats = /(стат|статист|отчет|история|кто получ|откуда|кем получен)/.test(low)
  if (/(что (есть )?на складе|список товаров|все остатки|инвентар)/.test(low)) return { call: { name: 'list_inventory', args: {} }, _cheap: true }
  if (/(просроч|должник)/.test(low)) return { call: { name: 'list_overdue', args: {} }, _cheap: true }
  if (/(заканчива|мало на складе)/.test(low)) return { call: { name: 'list_low', args: {} }, _cheap: true }
  if (/(стоимость склада|общая стоимость|на какую сумму)/.test(low)) return { call: { name: 'warehouse_value', args: {} }, _cheap: true }
  if (/(открой|покажи|перейди)/.test(low) && !stats) { for (const k in SCREENS) if (low.includes(k)) return { call: { name: 'open_screen', args: { screen: SCREENS[k] } }, _cheap: true } }
  return null
}

export async function askLucy(text, role, history) {
  const r = await fetch('/api/lucy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, role, history }) })
  return r.json()
}

// Ответы на аналитические вопросы из данных, которые уже есть на клиенте.
export function runAnalytics(name, args, data) {
  const { products, stock, checkouts, recipients, flows } = data
  const today = new Date().toISOString().slice(0, 10)
  const pName = (id) => products.find((p) => p.id === id)?.name || '—'
  const rName = (id) => recipients.find((r) => r.id === id)?.name || '—'
  const fmt = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0))
  if (name === 'get_stock') { const nm = matchName(args.product || '', products.map((p) => p.name)); const p = products.find((x) => x.name === nm); if (!p) return 'Не нашла такой товар, уточните название.'; return `«${p.name}»: ${stock[p.id] || 0} штук на складе.` }
  if (name === 'list_inventory') { const have = products.filter((p) => !p.archived && (stock[p.id] || 0) > 0); if (!have.length) return 'На складе пока пусто.'; return 'На складе: ' + have.slice(0, 20).map((p) => `${p.name} — ${stock[p.id]}`).join(', ') + '.' }
  if (name === 'list_low') { const l = products.filter((p) => !p.archived && (stock[p.id] || 0) < 5); return l.length ? 'Заканчивается: ' + l.map((p) => `${p.name} (${stock[p.id] || 0})`).join(', ') + '.' : 'Всё в достатке.' }
  if (name === 'list_overdue') { const od = checkouts.filter((c) => c.due_date && c.due_date < today); return od.length ? `Просрочено ${od.length}: ` + od.map((c) => `${rName(c.recipient_id)} — ${pName(c.product_id)} ×${c.remaining}`).join('; ') + '.' : 'Просроченных выдач нет.' }
  if (name === 'warehouse_value') { const active = products.filter((p) => !p.archived); const v = active.reduce((a, p) => a + (stock[p.id] || 0) * (p.price || 0), 0); const q = active.reduce((a, p) => a + (stock[p.id] || 0), 0); return `На складе ${q} штук на сумму ${fmt(v)} сом.` }
  if (name === 'who_holds') { const nm = matchName(args.recipient || '', recipients.map((r) => r.name)); const r = recipients.find((x) => x.name === nm); const held = r ? checkouts.filter((c) => c.recipient_id === r.id) : []; return held.length ? `У ${r.name} на руках: ` + held.map((c) => `${pName(c.product_id)} ×${c.remaining}`).join(', ') + '.' : 'У этого получателя ничего не числится.' }
  return null
}
