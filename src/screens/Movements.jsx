import { useState } from 'react'
import { Badge } from '../components/ui'
import { TL } from '../lib/format'

export default function Movements({ data }) {
  const { movements, products, recipients } = data
  const [f, setF] = useState('all')
  const pName = (id) => products.find((p) => p.id === id)?.name || '—'
  const rName = (id) => recipients.find((r) => r.id === id)?.name || ''
  const list = movements.filter((m) => f === 'all' || m.type === f)
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 20, fontWeight: 600 }}>Движения</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {['all', 'in', 'out', 'return', 'writeoff'].map((t) => (
            <button key={t} onClick={() => setF(t)} style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${f === t ? 'var(--ink)' : 'var(--brd)'}`, fontSize: 12, fontWeight: f === t ? 600 : 400, background: f === t ? 'var(--ink-l)' : 'var(--sur)', color: f === t ? 'var(--ink)' : 'var(--tx2)' }}>{t === 'all' ? 'Все' : TL[t]}</button>
          ))}
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {list.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Нет операций.</div>}
        {list.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 18px', borderBottom: i < list.length - 1 ? '1px solid var(--brd)' : 'none' }}>
            <Badge color={{ in: 'green', out: 'ink', return: 'purple', writeoff: 'red' }[m.type]}>{TL[m.type]}</Badge>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{pName(m.product_id)}</div>
              {rName(m.recipient_id) && <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{rName(m.recipient_id)}</div>}
            </div>
            <span className="mono" style={{ fontWeight: 600 }}>{m.type === 'in' || m.type === 'return' ? '+' : '−'}{m.qty}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)', width: 130, textAlign: 'right' }}>{new Date(m.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
