import { useState } from 'react'
import { fmt, som } from '../lib/format'

export default function Items({ data }) {
  const { products, stock } = data
  const [q, setQ] = useState('')
  const list = products.filter((p) => !p.archived && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 20, fontWeight: 600 }}>Товары</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" style={{ marginLeft: 'auto', height: 38, padding: '0 14px', borderRadius: 11, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 14, minWidth: 220 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(184px,1fr))', gap: 14 }}>
        {list.map((p) => {
          const s = stock[p.id] || 0
          const c = s === 0 ? 'var(--tx3)' : s < 5 ? 'var(--am)' : 'var(--gr)'
          return (
            <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ height: 66, background: 'var(--sur2)', display: 'flex', alignItems: 'flex-end', padding: '10px 14px' }}>
                <span className="mono" style={{ fontSize: 24, fontWeight: 600, color: c }}>{s}<span style={{ fontFamily: 'var(--f)', fontSize: 11, color: 'var(--tx3)' }}> шт</span></span>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, minHeight: 36, lineHeight: 1.3 }}>{p.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--tx2)' }}>{fmt(p.price)} сом</span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{fmt((p.price || 0) * s)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {list.length === 0 && <div style={{ padding: 60, textAlign: 'center', color: 'var(--tx3)' }}>Товаров нет. Добавьте их в справочниках или через операцию прихода.</div>}
    </div>
  )
}
