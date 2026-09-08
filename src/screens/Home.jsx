import { useState } from 'react'
import { Stat, Btn, Badge, Sheet } from '../components/ui'
import { signersOf, currentSigner } from '../lib/signing'
import { approversOf, currentApprover } from '../lib/approval'
import { fmt, som, TL } from '../lib/format'
import OperationSheet from '../components/OperationSheet'
import { InstallCard } from '../components/InstallPrompt'

export default function Home({ data, profile, can, setView }) {
  const { products, movements, stock, stockByWh, warehouses, checkouts, recipients, branches, requests, acts, actSigners, reqApprovers } = data
  const [sheet, setSheet] = useState(null)
  const role = profile?.role || 'employee'

  const active = products.filter((p) => !p.archived)
  const totalVal = active.reduce((a, p) => a + (stock[p.id] || 0) * (p.price || 0), 0)
  const totalUnits = active.reduce((a, p) => a + (stock[p.id] || 0), 0)
  const onHands = checkouts.reduce((a, c) => a + c.remaining, 0)
  const today = new Date().toISOString().slice(0, 10)
  const overdue = checkouts.filter((c) => c.due_date && c.due_date < today)
  const low = active.filter((p) => { const q = stock[p.id] || 0; return q < (p.min_qty || 5) })
    .sort((a, b) => (stock[a.id] || 0) - (stock[b.id] || 0))
  const whTotal = (wid) => !wid ? 0 : active.reduce((a, p) => a + ((stockByWh?.[p.id]?.[wid]) || 0), 0)
  // Для спеца — его выдачи; для рук. филиала — его филиал
  const myCheckouts = checkouts.filter((c) => {
    if (role === 'manager') return c.branch_id === profile?.branch_id
    if (role === 'employee') {
      const rec = recipients.find((r) => r.id === c.recipient_id)
      return rec && (rec.name === profile?.full_name || c.branch_id === profile?.branch_id)
    }
    return true
  })
  const myHands = myCheckouts.reduce((a, c) => a + c.remaining, 0)
  // Получено: выдачи минус возвраты по товару (в области видимости роли)
  const receivedList = (() => {
    const g = {}
    for (const m of movements) {
      if (!['out', 'return'].includes(m.type)) continue
      if (role === 'manager') { if (m.branch_id !== profile?.branch_id) continue }
      else if (role === 'employee') { if (m.recipient_profile_id !== profile?.id) continue }
      else continue
      const k = m.product_id
      if (!g[k]) g[k] = { product_id: m.product_id, qty: 0, last: m.created_at, who: m.recipient_profile_id }
      g[k].qty += m.type === 'out' ? m.qty : -m.qty
      if (m.created_at > g[k].last) g[k].last = m.created_at
    }
    return Object.values(g).filter((x) => x.qty > 0).sort((a, b) => (a.last < b.last ? 1 : -1))
  })()
  const myOverdue = myCheckouts.filter((c) => c.due_date && c.due_date < today).length

  const hr = new Date().getHours()
  const hi = hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер'
  const name = (profile?.full_name || profile?.email || '').split(/[ @]/)[0] || 'коллега'
  const roleLabel = { admin: 'администратор', manager: 'менеджер', director: 'директор', employee: 'сотрудник' }[role]

  const visibleMoves = movements.filter((m) => {
    if (['admin', 'director'].includes(role)) return true
    if (role === 'manager') return m.branch_id === profile?.branch_id
    return m.recipient_profile_id === profile?.id
  })
  const recent = visibleMoves.slice(0, 6)
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

      {/* Счётчики документооборота */}
      {(() => {
        const cards = []
        // На моём согласовании
        const onMe = (requests || []).filter((r) => {
          if (r.status !== 'new') return false
          const c = currentApprover(approversOf(reqApprovers, r.id))
          if (!c) return false
          return c.in_system ? c.user_id === profile.id : r.author_id === profile.id
        })
        if (onMe.length) cards.push({ ico: '✍️', l: 'На вашем согласовании', n: onMe.length, c: 'var(--ink)', bg: 'var(--ink-l)', to: 'requests' })
        // Админу — к выдаче
        if (role === 'admin') {
          const toIssue = (requests || []).filter((r) => r.status === 'approved')
          if (toIssue.length) cards.push({ ico: '📤', l: 'К выдаче', n: toIssue.length, c: 'var(--gr-m)', bg: 'var(--gr-l)', to: 'requests' })
        }
        // Заявителю — свои в работе
        if (role !== 'admin') {
          const myActive = (requests || []).filter((r) => r.author_id === profile.id && ['new', 'approved', 'revision'].includes(r.status))
          if (myActive.length) cards.push({ ico: '📋', l: 'Мои в работе', n: myActive.length, c: 'var(--am-m)', bg: 'var(--am-l)', to: 'requests' })
        }
        if (!cards.length) return null
        return <div className="home-actions" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cards.length, 3)},1fr)`, gap: 12, marginBottom: 18 }}>
          {cards.map((c) => (
            <button key={c.l} onClick={() => setView && setView(c.to)} className="card" style={{ padding: 15, textAlign: 'left', border: `1.5px solid ${c.c}`, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 18 }}>{c.ico}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.l}</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, color: c.c }}>{c.n}</span>
              </div>
            </button>
          ))}
        </div>
      })()}

      <InstallCard />

      {/* Заявителям — одно действие */}
      {['employee', 'manager'].includes(role) && (
        <button onClick={() => setView && setView('requests')} className="card"
          style={{ width: '100%', padding: '18px 20px', textAlign: 'left', cursor: 'pointer', border: '1.5px solid var(--sec-req)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--sec-req-l)', display: 'grid', placeItems: 'center', fontSize: 21, flexShrink: 0 }}>＋</div>
          <div>
            <div className="ff" style={{ fontSize: 16, fontWeight: 600 }}>Подать заявку</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>запросить товар со склада</div>
          </div>
        </button>
      )}

      {/* Карточки-действия (только склад) */}
      {showActions && role === 'admin' && (
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

      {/* KPI: склады видят только админ и директор */}
      {['admin', 'director'].includes(role) ? (
        <div className="home-kpi" style={{ display: 'grid', gridTemplateColumns: `repeat(${3 + warehouses.length}, minmax(0,1fr))`, gap: 12, marginBottom: 22 }}>
          <Stat label="Стоимость" value={fmt(totalVal)} unit="сом" color="var(--ink)" accent />
          <Stat label="Всего на складах" value={fmt(totalUnits)} unit="шт" color="var(--gr)" />
          {warehouses.map((w) => (<Stat key={w.id} label={w.name} value={fmt(whTotal(w.id))} unit="шт" />))}
          <Stat label="Просрочено" value={overdue.length} color={overdue.length ? 'var(--rd)' : 'var(--gr)'} />
        </div>
      ) : null}

      {/* Панели */}
      <div className="home-panels" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--brd)', fontWeight: 600, fontSize: 14.5 }}>{['admin','director'].includes(role) ? 'Последние движения' : role === 'manager' ? 'Движения моего филиала' : 'Что я получал'}</div>
          {recent.length === 0 && <div style={{ padding: 34, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока пусто.</div>}
          {recent.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < recent.length - 1 ? '1px solid var(--brd)' : 'none' }}>
              <Badge color={{ in: 'green', out: 'ink', return: 'purple', writeoff: 'red', transfer: 'amber' }[m.type]}>{TL[m.type]}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName(m.product_id)}</div>
                {sub(m) && <div style={{ fontSize: 11, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub(m)}</div>}
              </div>
              {(() => {
                const seeAll = ['admin', 'director'].includes(role)
                const plus = seeAll ? ['in', 'return'].includes(m.type) : m.type === 'out'
                const sign = m.type === 'transfer' ? '~' : plus ? '+' : '−'
                const clr = m.type === 'transfer' ? 'var(--am-m)' : plus ? 'var(--gr)' : seeAll ? 'var(--tx)' : 'var(--pu)'
                return <span className="mono" style={{ fontWeight: 600, color: clr }}>{sign}{m.qty}</span>
              })()}
            </div>
          ))}
        </div>

        {!['admin', 'director'].includes(role) && <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--brd)', fontWeight: 600, fontSize: 14.5 }}>
            {role === 'manager' ? 'Получено филиалом' : 'Что я получил'}
          </div>
          {receivedList.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока ничего не получено</div>}
          {receivedList.slice(0, 8).map((c, i, arr) => (
            <div key={c.product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '11px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--brd)' : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName(c.product_id)}</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{new Date(c.last).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
              </div>
              <Badge color="green">+{c.qty} шт</Badge>
            </div>
          ))}
        </div>}

        {['admin', 'director'].includes(role) && <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--brd)', fontWeight: 600, fontSize: 14.5, color: 'var(--am-m)' }}>Заканчивается</div>
          {low.length === 0 && <div style={{ padding: 34, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Всё в достатке.</div>}
          {low.slice(0, 6).map((p, i, arr) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--brd)' : 'none', fontSize: 13 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <Badge color={(stock[p.id] || 0) <= 0 ? 'red' : 'amber'}>{stock[p.id] || 0} шт{(stock[p.id] || 0) < 0 ? ' ⚠' : ''}</Badge>
            </div>
          ))}
        </div>}
      </div>

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet ? TL[sheet] : ''}>
        {sheet && <OperationSheet type={sheet} data={data} profile={profile} onDone={() => { setSheet(null); data.invalidate(['movements', 'stock', 'deliveries']) }} />}
      </Sheet>
    </div>
  )
}
