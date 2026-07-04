import { useState } from 'react'
import { Stat, Btn, Badge, Sheet } from '../components/ui'
import { fmt, som, TL } from '../lib/format'
import OperationSheet from '../components/OperationSheet'

export default function Home({ data, profile, can }) {
  const { products, movements, stock, checkouts } = data
  const [sheet, setSheet] = useState(null)
  const active = products.filter((p) => !p.archived)
  const totalVal = active.reduce((a, p) => a + (stock[p.id] || 0) * (p.price || 0), 0)
  const totalUnits = active.reduce((a, p) => a + (stock[p.id] || 0), 0)
  const today = new Date().toISOString().slice(0, 10)
  const overdue = checkouts.filter((c) => c.due_date && c.due_date < today)
  const low = active.filter((p) => (stock[p.id] || 0) < 5 && (stock[p.id] || 0) >= 0)
  const hr = new Date().getHours()
  const hi = hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер'
  const recent = movements.slice(0, 6)
  const pName = (id) => products.find((p) => p.id === id)?.name || '—'

  const actions = [
    { t: 'in', ico: '📥', title: 'Принять товар', sub: 'Поставка от поставщика', c: 'var(--gr)' },
    { t: 'out', ico: '📤', title: 'Выдать', sub: 'Сотруднику на мероприятие', c: 'var(--ink)' },
    { t: 'return', ico: '🔄', title: 'Принять возврат', sub: 'Товар вернули', c: 'var(--pu)' },
  ]

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '26px 24px 60px', animation: 'fadeUp .3s ease' }}>
      <div style={{ marginBottom: 22 }}>
        <div className="ff" style={{ fontSize: 26, fontWeight: 600 }}>{hi}, {(profile?.full_name || profile?.email || '').split(/[ @]/)[0] || 'коллега'}</div>
        <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 3 }}>{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>

      {can('move') && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        {actions.map((a) => (
          <button key={a.t} onClick={() => setSheet(a.t)} className="card" style={{ padding: 20, textAlign: 'left', cursor: 'pointer', transition: 'all .15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = a.c; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--brd)'; e.currentTarget.style.transform = 'none' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{a.ico}</div>
            <div className="ff" style={{ fontSize: 15.5, fontWeight: 600 }}>{a.title}</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>{a.sub}</div>
          </button>
        ))}
      </div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <Stat label="Стоимость" value={fmt(totalVal)} unit="сом" color="var(--ink)" accent />
        <Stat label="Единиц" value={fmt(totalUnits)} unit="шт" color="var(--gr)" />
        <Stat label="Позиций" value={active.length} />
        <Stat label="Просрочено" value={overdue.length} color={overdue.length ? 'var(--rd)' : 'var(--gr)'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--brd)', fontWeight: 600, fontSize: 14.5 }}>Последние движения</div>
          {recent.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока пусто.</div>}
          {recent.map((m, i) => <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < recent.length - 1 ? '1px solid var(--brd)' : 'none' }}>
            <Badge color={{ in: 'green', out: 'ink', return: 'purple', writeoff: 'red' }[m.type]}>{TL[m.type]}</Badge>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName(m.product_id)}</span>
            <span className="mono" style={{ fontWeight: 600 }}>×{m.qty}</span>
          </div>)}
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--brd)', fontWeight: 600, fontSize: 14.5, color: 'var(--am)' }}>Заканчивается</div>
          {low.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Всё в достатке.</div>}
          {low.slice(0, 6).map((p) => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid var(--brd)', fontSize: 13 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            <Badge color={(stock[p.id] || 0) === 0 ? 'red' : 'amber'}>{stock[p.id] || 0} шт</Badge>
          </div>)}
        </div>
      </div>

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet ? TL[sheet] : ''}>
        {sheet && <OperationSheet type={sheet} data={data} profile={profile} onDone={() => { setSheet(null); data.reload() }} />}
      </Sheet>
    </div>
  )
}
