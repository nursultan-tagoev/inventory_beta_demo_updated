import { useState } from 'react'
import { Badge } from '../components/ui'
import { fmt, som } from '../lib/format'

export default function Reports({ data }) {
  const { products, stock, flows, categories } = data
  const rows = products.filter((p) => !p.archived).map((p) => {
    const f = flows[p.id] || { in: 0, out: 0, return: 0, writeoff: 0 }
    return { ...p, qty: stock[p.id] || 0, val: (stock[p.id] || 0) * (p.price || 0), ...f, cat: categories.find((c) => c.id === p.category_id) }
  }).sort((a, b) => b.out - a.out)
  const totalVal = rows.reduce((a, r) => a + r.val, 0)

  const exportCSV = () => {
    const csv = ['Артикул,Название,Категория,Цена,Приход,Выдано,Возврат,Списано,Остаток,Стоимость',
      ...rows.map((r) => `${r.sku || ''},"${r.name}",${r.cat?.name || ''},${r.price},${r.in},${r.out},${r.return},${r.writeoff},${r.qty},${r.val}`)].join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv)
    a.download = `sklad_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 24, animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <span className="ff" style={{ fontSize: 20, fontWeight: 600 }}>Аналитика</span>
        <button onClick={exportCSV} style={{ marginLeft: 'auto', height: 36, padding: '0 14px', borderRadius: 10, background: 'var(--gr)', color: '#fff', fontSize: 12.5, fontWeight: 600 }}>↓ Экспорт CSV</button>
      </div>
      <div style={{ background: 'linear-gradient(135deg,var(--ink),var(--pu))', borderRadius: 16, padding: '20px 24px', marginBottom: 18, color: '#fff' }}>
        <div style={{ fontSize: 11, opacity: .7, textTransform: 'uppercase', letterSpacing: '.08em' }}>Стоимость остатков</div>
        <div className="mono" style={{ fontSize: 30, fontWeight: 600 }}>{som(totalVal)}</div>
      </div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ background: 'var(--bg)' }}>{['Артикул', 'Название', 'Приход', 'Выдано', 'Возврат', 'Списано', 'Остаток', 'Стоимость'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--brd)' }}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={r.id} style={{ borderBottom: '1px solid var(--brd)', background: i % 2 ? 'var(--bg)' : 'var(--sur)' }}>
            <td className="mono" style={{ padding: '9px 12px', color: 'var(--tx3)', fontSize: 11 }}>{r.sku || '—'}</td>
            <td style={{ padding: '9px 12px', fontWeight: 500 }}>{r.name}</td>
            <td className="mono" style={{ padding: '9px 12px', color: 'var(--gr)' }}>{r.in}</td>
            <td className="mono" style={{ padding: '9px 12px', color: 'var(--ink)' }}>{r.out}</td>
            <td className="mono" style={{ padding: '9px 12px', color: 'var(--pu)' }}>{r.return}</td>
            <td className="mono" style={{ padding: '9px 12px', color: 'var(--rd)' }}>{r.writeoff}</td>
            <td className="mono" style={{ padding: '9px 12px', fontWeight: 700, color: r.qty === 0 ? 'var(--rd)' : r.qty < 5 ? 'var(--am)' : 'var(--tx)' }}>{r.qty}</td>
            <td className="mono" style={{ padding: '9px 12px' }}>{fmt(r.val)}</td>
          </tr>)}</tbody>
        </table>
        {rows.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)' }}>Нет данных.</div>}
      </div>
    </div>
  )
}
