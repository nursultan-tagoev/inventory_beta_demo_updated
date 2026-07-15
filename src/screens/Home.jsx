import { useState } from 'react'
import { Stat, Btn, Badge, Sheet } from '../components/ui'
import { fmt, som, TL } from '../lib/format'
import OperationSheet from '../components/OperationSheet'

export default function Home({ data, profile, can }) {
  const { products, movements, stock, stockByWh, warehouses, checkouts, recipients, branches } = data
  const [sheet, setSheet] = useState(null)
  const role = profile?.role || 'employee'

  const active = products.filter((p) => !p.archived)
  const totalVal = active.reduce((a, p) => a + (stock[p.id] || 0) * (p.price || 0), 0)
  const totalUnits = active.reduce((a, p) => a + (stock[p.id] || 0), 0)
  const onHands = checkouts.reduce((a, c) => a + c.remaining, 0)
  const today = new Date().toISOString().slice(0, 10)
  const overdue = checkouts.filter((c) => c.due_date && c.due_date < today)
  const low = active.filter((p) => (stock[p.id] || 0) < 5)
  const whTotal = (wid) => !wid ? 0 : active.reduce((a, p) => a + ((stockByWh?.[p.id]?.[wid]) || 0), 0)

  const hr = new Date().getHours()
  const hi = hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер'
  const name = (profile?.full_name || profile?.email || '').split(/[ @]/)[0] || 'коллега'
  const roleLabel = { admin: 'администратор', manager: 'менеджер', director: 'директор', employee: 'сотрудник' }[role]

  const recent = movements.slice(0, 6)
  const pName = (id) => products.find((p) => p.id === id)?.name || '—'
  const rName = (id) => recipients.find((r) => r.id === id)?.name || ''
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || ''
  const sub = (m) => m.type === 'transfer'
    ? `${whName(m.warehouse_id)} → ${whName(m.warehouse_to_id)}`
    : [rName(m.recipient_id), whName(m.warehouse_id) && 'склад ' + whName(m.warehouse_id)].filter(Boolean).join(' · ')

  // Действия — только у тех, кто проводит операции (админ)
  const actions = [
    { t: 'in', ico: '📥', title: 'Принять товар', sub: 'Поставка на склад', c: 'var(--gr)', bg: 'var(--gr-l)' },
    { t: 'out', ico: '📤', title: 'Выдать', sub: 'Получателю / в филиал', c: 'var(--ink)', bg: 'var(--ink-l)' },
    { t: 'return', ico: '🔄', title: 'Возврат', sub: 'Товар вернули', c: 'var(--pu)', bg: 'var(--pu-l)' },
    { t: 'transfer', ico: '⇄', title: 'Перемещение', sub: 'Склад → склад', c: 'var(--am-m)', bg: 'var(--am-l)' },
  ]
  const showActions = can('move')

  return (
    <div style={{ maxWidth: 1140, margin: '0 auto', padding: '26px 24px 80px', animation: 'fadeUp .3s ease' }}>

      {/* Приветствие */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div className="ff" style={{ fontSize: 26, fontWeight: 600 }}>{hi}, {name}</div>
          <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 3 }}>
            {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })} · {roleLabel}
          </div>
        </div>
        {role === 'director' && <Badge>👁 Обзор · только просмотр</Badge>}
      </div>

      {/* Карточки-действия */}
      {showActions && (
        <div className="home-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
          {actions.map((a) => (
            <button key={a.t} onClick={() => setSheet(a.t)} className="card" style={{ padding: 17, textAlign: 'left', cursor: 'pointer', transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = a.c; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--sh2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--brd)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--sh)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: a.bg, display: 'grid', placeItems: 'center', fontSize: 20, marginBottom: 11 }}>{a.ico}</div>
              <div className="ff" style={{ fontSize: 15, fontWeight: 600 }}>{a.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>{a.sub}</div>
            </button>
          ))}
        </div>
      )}

      {/* KPI — число складов гибкое */}
      <div className="home-kpi" style={{ display: 'grid', gridTemplateColumns: `repeat(${3 + warehouses.length}, minmax(0,1fr))`, gap: 12, marginBottom: 22 }}>
        <Stat label="Стоимость" value={fmt(totalVal)} unit="сом" color="var(--ink)" accent />
        <Stat label="Всего на складах" value={fmt(totalUnits)} unit="шт" color="var(--gr)" />
        {warehouses.map((w) => (
          <Stat key={w.id} label={w.name} value={fmt(whTotal(w.id))} unit="шт" />
        ))}
        <Stat label="Просрочено" value={overdue.length} color={overdue.length ? 'var(--rd)' : 'var(--gr)'} />
      </div>

      {/* Панели */}
      <div className="home-panels" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--brd)', fontWeight: 600, fontSize: 14.5 }}>Последние движения</div>
          {recent.length === 0 && <div style={{ padding: 34, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока пусто.</div>}
          {recent.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < recent.length - 1 ? '1px solid var(--brd)' : 'none' }}>
              <Badge color={{ in: 'green', out: 'ink', return: 'purple', writeoff: 'red', transfer: 'amber' }[m.type]}>{TL[m.type]}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName(m.product_id)}</div>
                {sub(m) && <div style={{ fontSize: 11, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub(m)}</div>}
              </div>
              <span className="mono" style={{ fontWeight: 600, color: m.type === 'in' || m.type === 'return' ? 'var(--gr)' : m.type === 'transfer' ? 'var(--am-m)' : 'var(--tx)' }}>
                {m.type === 'in' || m.type === 'return' ? '+' : m.type === 'transfer' ? '~' : '−'}{m.qty}
              </span>
            </div>
          ))}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--brd)', fontWeight: 600, fontSize: 14.5, color: 'var(--am-m)' }}>Заканчивается</div>
          {low.length === 0 && <div style={{ padding: 34, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Всё в достатке.</div>}
          {low.slice(0, 6).map((p, i, arr) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--brd)' : 'none', fontSize: 13 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <Badge color={(stock[p.id] || 0) === 0 ? 'red' : 'amber'}>{stock[p.id] || 0} шт</Badge>
            </div>
          ))}
        </div>
      </div>

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet ? TL[sheet] : ''}>
        {sheet && <OperationSheet type={sheet} data={data} profile={profile} onDone={() => { setSheet(null); data.reload() }} />}
      </Sheet>
    </div>
  )
}
