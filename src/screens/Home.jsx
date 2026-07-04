import { Stat, Btn, Badge } from '../components/ui'
import { fmt, TL, TC } from '../lib/format'

export default function Home({ data, profile, setView }) {
  const { products, movements, stock } = data
  const active = products.filter((p) => !p.archived)
  const totalVal = active.reduce((a, p) => a + (stock[p.id] || 0) * (p.price || 0), 0)
  const totalUnits = active.reduce((a, p) => a + (stock[p.id] || 0), 0)
  const hr = new Date().getHours()
  const hi = hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер'
  const recent = movements.slice(0, 6)
  const pName = (id) => products.find((p) => p.id === id)?.name || '—'

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '26px 24px 60px', animation: 'fadeUp .3s ease' }}>
      <div style={{ marginBottom: 22 }}>
        <div className="ff" style={{ fontSize: 26, fontWeight: 600 }}>{hi}, {(profile?.full_name || profile?.email || '').split(' ')[0] || 'коллега'}</div>
        <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 3 }}>Обзор склада</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <Stat label="Стоимость" value={fmt(totalVal)} unit="сом" color="var(--ink)" accent />
        <Stat label="Единиц" value={fmt(totalUnits)} unit="шт" color="var(--gr)" />
        <Stat label="Позиций" value={active.length} />
        <Stat label="Операций" value={movements.length} />
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--brd)' }}>
          <span style={{ fontWeight: 600, fontSize: 14.5 }}>Последние движения</span>
          <Btn v="secondary" size="sm" onClick={() => setView('movements')}>Все →</Btn>
        </div>
        {recent.length === 0 && <div style={{ padding: '34px 20px', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Пока нет операций.</div>}
        {recent.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 18px', borderBottom: i < recent.length - 1 ? '1px solid var(--brd)' : 'none' }}>
            <Badge color={{ in: 'green', out: 'ink', return: 'purple', writeoff: 'red' }[m.type]}>{TL[m.type]}</Badge>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{pName(m.product_id)}</span>
            <span className="mono" style={{ fontWeight: 600 }}>{m.type === 'in' || m.type === 'return' ? '+' : '−'}{m.qty}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)', width: 96, textAlign: 'right' }}>{new Date(m.created_at).toLocaleDateString('ru-RU')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
