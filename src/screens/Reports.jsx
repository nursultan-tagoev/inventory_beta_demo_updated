import { useState, Fragment } from 'react'
import { fmt, som } from '../lib/format'

export default function Reports({ data }) {
  const { products, movements, stock, flows, categories, branches } = data
  const [tab, setTab] = useState('items')
  const priceOf = (id) => products.find((p) => p.id === id)?.price || 0
  const pName = (id) => products.find((p) => p.id === id)?.name || '—'

  const rows = products.filter((p) => !p.archived).map((p) => {
    const f = flows[p.id] || { in: 0, out: 0, return: 0, writeoff: 0 }
    return { ...p, qty: stock[p.id] || 0, val: (stock[p.id] || 0) * (p.price || 0), ...f, cat: categories.find((c) => c.id === p.category_id) }
  }).sort((a, b) => b.out - a.out)
  const totalVal = rows.reduce((a, r) => a + r.val, 0)

  // обороты по филиалам + топ товаров
  const bb = {}
  const bk = (id) => bb[id] || (bb[id] = { in: 0, out: 0, return: 0, writeoff: 0, outVal: 0, ops: 0, byProd: {} })
  for (const m of movements) {
    const b = bk(m.branch_id || 0); b.ops++; b[m.type] += m.qty
    if (m.type === 'out') { b.outVal += m.qty * priceOf(m.product_id); b.byProd[m.product_id] = (b.byProd[m.product_id] || 0) + m.qty }
  }
  const branchInfo = (id) => branches.find((b) => b.id === id)
  const usedBranches = [...branches.filter((b) => bb[b.id]).map((b) => ({ id: b.id, name: b.name, city: b.city || '—' })), ...(bb[0] ? [{ id: 0, name: 'Филиал не указан', city: '—' }] : [])]

  // группировка по городам
  const cities = {}
  usedBranches.forEach((b) => { const c = b.city || '—'; (cities[c] || (cities[c] = [])).push(b) })

  const totals = usedBranches.reduce((a, b) => { const d = bb[b.id]; a.in += d.in; a.out += d.out; a.return += d.return; a.writeoff += d.writeoff; a.outVal += d.outVal; return a }, { in: 0, out: 0, return: 0, writeoff: 0, outVal: 0 })
  const topOf = (id) => Object.entries(bb[id].byProd).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pid, q]) => ({ name: pName(+pid), q }))

  const cell = { padding: '9px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--mono)' }
  const th = { padding: '10px 12px', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--brd)', textAlign: 'right' }

  const exportCSV = () => {
    const csv = ['Филиал,Город,Приход,Выдано,Возврат,Списано,Сумма выдач',
      ...usedBranches.map((b) => { const d = bb[b.id]; return `"${b.name}",${b.city},${d.in},${d.out},${d.return},${d.writeoff},${d.outVal}` }),
      `ВСЕГО,,${totals.in},${totals.out},${totals.return},${totals.writeoff},${totals.outVal}`].join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv); a.download = `filials_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
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

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['items', 'По товарам'], ['branches', 'По филиалам']].map(([t, l]) => <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', borderRadius: 9, border: `1px solid ${tab === t ? 'var(--ink)' : 'var(--brd)'}`, fontSize: 13, fontWeight: tab === t ? 600 : 400, background: tab === t ? 'var(--ink-l)' : 'var(--sur)', color: tab === t ? 'var(--ink)' : 'var(--tx2)' }}>{l}</button>)}
      </div>

      {tab === 'branches' ? (
        usedBranches.length === 0 ? <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--tx3)' }}>Нет данных по филиалам. Указывайте филиал при оформлении операций — здесь появится разбивка.</div> : (
          <>
            <div className="card" style={{ overflow: 'auto', marginBottom: 18 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr style={{ background: 'var(--bg)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Филиал</th><th style={{ ...th, textAlign: 'left' }}>Город</th>
                  <th style={th}>Приход</th><th style={th}>Выдано</th><th style={th}>Возврат</th><th style={th}>Списано</th><th style={th}>Сумма выдач</th>
                </tr></thead>
                <tbody>
                  {Object.entries(cities).map(([city, list]) => {
                    const sub = list.reduce((a, b) => { const d = bb[b.id]; a.in += d.in; a.out += d.out; a.return += d.return; a.writeoff += d.writeoff; a.outVal += d.outVal; return a }, { in: 0, out: 0, return: 0, writeoff: 0, outVal: 0 })
                    return (
                      <Fragment key={'g' + city}>
                        {Object.keys(cities).length > 1 && <tr key={'c' + city} style={{ background: 'var(--sur2)' }}><td colSpan={2} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--tx2)' }}>Город: {city}</td><td colSpan={5}></td></tr>}
                        {list.map((b) => { const d = bb[b.id]; return (
                          <tr key={b.id} style={{ borderBottom: '1px solid var(--brd)' }}>
                            <td style={{ padding: '9px 12px', fontWeight: 500 }}>{b.name}</td>
                            <td style={{ padding: '9px 12px', color: 'var(--tx3)' }}>{b.city}</td>
                            <td style={{ ...cell, color: 'var(--gr)' }}>{d.in}</td>
                            <td style={{ ...cell, color: 'var(--ink)', fontWeight: 700 }}>{d.out}</td>
                            <td style={{ ...cell, color: 'var(--pu)' }}>{d.return}</td>
                            <td style={{ ...cell, color: 'var(--rd)' }}>{d.writeoff}</td>
                            <td style={{ ...cell, fontWeight: 600 }}>{fmt(d.outVal)}</td>
                          </tr>
                        )})}
                        {Object.keys(cities).length > 1 && list.length > 1 && <tr key={'s' + city} style={{ background: 'var(--bg)', borderBottom: '1px solid var(--brd)' }}>
                          <td style={{ padding: '7px 12px', fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic' }} colSpan={2}>Итого по {city}</td>
                          <td style={{ ...cell, fontSize: 11, color: 'var(--tx2)' }}>{sub.in}</td><td style={{ ...cell, fontSize: 11, color: 'var(--tx2)', fontWeight: 700 }}>{sub.out}</td><td style={{ ...cell, fontSize: 11, color: 'var(--tx2)' }}>{sub.return}</td><td style={{ ...cell, fontSize: 11, color: 'var(--tx2)' }}>{sub.writeoff}</td><td style={{ ...cell, fontSize: 11, color: 'var(--tx2)', fontWeight: 600 }}>{fmt(sub.outVal)}</td>
                        </tr>}
                      </Fragment>
                    )
                  })}
                  <tr style={{ background: 'var(--nav)', color: '#fff' }}>
                    <td style={{ padding: '11px 12px', fontWeight: 700 }} colSpan={2}>ВСЕГО</td>
                    <td style={{ ...cell, color: '#fff' }}>{totals.in}</td><td style={{ ...cell, color: '#fff', fontWeight: 700 }}>{totals.out}</td><td style={{ ...cell, color: '#fff' }}>{totals.return}</td><td style={{ ...cell, color: '#fff' }}>{totals.writeoff}</td><td style={{ ...cell, color: '#fff', fontWeight: 700 }}>{fmt(totals.outVal)} сом</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
              {usedBranches.map((b) => { const top = topOf(b.id); return (
                <div key={b.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <span className="ff" style={{ fontSize: 15, fontWeight: 600 }}>{b.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{b.city}</span>
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>Топ выдач</div>
                  {top.length === 0 ? <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Выдач не было</div> : top.map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5, borderBottom: i < top.length - 1 ? '1px solid var(--brd)' : 'none' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span><b className="mono">{t.q}</b>
                    </div>
                  ))}
                </div>
              )})}
            </div>
          </>
        )
      ) : (
        <div className="card" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ background: 'var(--bg)' }}>{['Артикул', 'Название', 'Приход', 'Выдано', 'Возврат', 'Списано', 'Остаток', 'Стоимость'].map((h) => <th key={h} style={{ ...th, textAlign: h === 'Артикул' || h === 'Название' ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={r.id} style={{ borderBottom: '1px solid var(--brd)', background: i % 2 ? 'var(--bg)' : 'var(--sur)' }}>
              <td className="mono" style={{ padding: '9px 12px', color: 'var(--tx3)', fontSize: 11 }}>{r.sku || '—'}</td>
              <td style={{ padding: '9px 12px', fontWeight: 500 }}>{r.name}</td>
              <td style={{ ...cell, color: 'var(--gr)' }}>{r.in}</td><td style={{ ...cell, color: 'var(--ink)' }}>{r.out}</td><td style={{ ...cell, color: 'var(--pu)' }}>{r.return}</td><td style={{ ...cell, color: 'var(--rd)' }}>{r.writeoff}</td>
              <td style={{ ...cell, fontWeight: 700, color: r.qty === 0 ? 'var(--rd)' : r.qty < 5 ? 'var(--am)' : 'var(--tx)' }}>{r.qty}</td><td style={cell}>{fmt(r.val)}</td>
            </tr>)}</tbody>
          </table>
          {rows.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)' }}>Нет данных.</div>}
        </div>
      )}
    </div>
  )
}
