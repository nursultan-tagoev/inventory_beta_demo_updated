import { useState, useMemo } from 'react'
import { Btn, Sheet, Badge } from '../components/ui'
import { TL } from '../lib/format'
import OperationSheet from '../components/OperationSheet'

const TYPES = [
  { t: 'all', l: 'Все', c: 'var(--nav)', bg: 'var(--nav)', fg: '#fff' },
  { t: 'in', l: 'Приход', c: 'var(--gr-m)', bg: 'var(--gr-l)' },
  { t: 'out', l: 'Выдача', c: 'var(--ink)', bg: 'var(--ink-l)' },
  { t: 'return', l: 'Возврат', c: 'var(--pu)', bg: 'var(--pu-l)' },
  { t: 'writeoff', l: 'Списание', c: 'var(--rd-m)', bg: 'var(--rd-l)' },
  { t: 'transfer', l: 'Перемещение', c: 'var(--am-m)', bg: 'var(--am-l)' },
]
const ICO = { in: '📥', out: '📤', return: '🔄', writeoff: '🗑', transfer: '⇄' }
const CLR = { in: 'var(--gr-m)', out: 'var(--ink)', return: 'var(--pu)', writeoff: 'var(--rd-m)', transfer: 'var(--am-m)' }
const BG = { in: 'var(--gr-l)', out: 'var(--ink-l)', return: 'var(--pu-l)', writeoff: 'var(--rd-l)', transfer: 'var(--am-l)' }

export default function Movements({ data, profile, can }) {
  const { movements, products, recipients, warehouses, branches, campaigns, productTypes, directions } = data
  const [f, setF] = useState('all')
  const [q, setQ] = useState('')
  const [wh, setWh] = useState('')
  const [hier, setHier] = useState({ direction_id: '', product_type_id: '', campaign_id: '' })
  const [sheet, setSheet] = useState(null)

  const pById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const pName = (id) => pById[id]?.name || '—'
  const rName = (id) => recipients.find((r) => r.id === id)?.name || ''
  const bName = (id) => branches.find((b) => b.id === id)?.name || ''
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || ''

  // каскад иерархии
  const types = hier.direction_id ? productTypes.filter((t) => t.direction_id == hier.direction_id) : productTypes
  const camps = hier.product_type_id ? campaigns.filter((c) => c.product_type_id == hier.product_type_id) : campaigns
  const inHier = (m) => {
    const p = pById[m.product_id]; if (!p) return true
    if (hier.campaign_id && p.campaign_id != hier.campaign_id) return false
    if (hier.product_type_id) {
      const c = campaigns.find((x) => x.id === p.campaign_id)
      if ((c?.product_type_id || p.product_type_id) != hier.product_type_id) return false
    }
    if (hier.direction_id) {
      const c = campaigns.find((x) => x.id === p.campaign_id)
      const t = productTypes.find((x) => x.id === (c?.product_type_id || p.product_type_id))
      if ((t?.direction_id || p.direction_id) != hier.direction_id) return false
    }
    return true
  }

  const list = movements.filter((m) => {
    if (f !== 'all' && m.type !== f) return false
    if (wh && m.warehouse_id != wh && m.warehouse_to_id != wh) return false
    if (q) {
      const s = (pName(m.product_id) + ' ' + rName(m.recipient_id) + ' ' + (m.purpose || '')).toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return inHier(m)
  })

  // группировка по дням
  const days = useMemo(() => {
    const g = {}
    for (const m of list) {
      const d = new Date(m.created_at)
      const key = d.toISOString().slice(0, 10)
      ;(g[key] || (g[key] = [])).push(m)
    }
    const today = new Date().toISOString().slice(0, 10)
    const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0])).map(([k, v]) => ({
      key: k,
      label: k === today ? 'Сегодня' : k === yest ? 'Вчера' : new Date(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
      date: new Date(k).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
      items: v,
    }))
  }, [list])

  const sub = (m) => {
    if (m.annul_of_act) return `Аннулирование акта ${m.annul_of_act} · склад ${whName(m.warehouse_id)}`
    if (m.type === 'transfer') return `${whName(m.warehouse_id)} → ${whName(m.warehouse_to_id)}`
    return [rName(m.recipient_id), bName(m.branch_id), whName(m.warehouse_id) && 'склад ' + whName(m.warehouse_id)].filter(Boolean).join(' · ')
  }

  const hierActive = hier.direction_id || hier.product_type_id || hier.campaign_id
  const selStyle = { height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 12.5, color: 'var(--tx)' }

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '24px 20px 80px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 21, fontWeight: 600 }}>Движения</span>
        {can('move') && <Btn size="sm" onClick={() => setSheet('out')} style={{ marginLeft: 'auto' }}>＋ Новая операция</Btn>}
      </div>

      {/* Пилюли типов */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {TYPES.map((t) => {
          const on = f === t.t
          return (
            <button key={t.t} onClick={() => setF(t.t)} style={{
              padding: '6px 13px', borderRadius: 999, fontSize: 12,
              fontWeight: on ? 600 : 500,
              border: `1px solid ${on ? 'transparent' : 'var(--brd)'}`,
              background: on ? t.bg : 'var(--sur)',
              color: on ? (t.fg || t.c) : 'var(--tx2)',
            }}>{t.l}</button>
          )
        })}
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Товар или получатель…"
          style={{ ...selStyle, flex: 1, minWidth: 160, padding: '0 12px' }} />
        <select value={wh} onChange={(e) => setWh(e.target.value)} style={selStyle}>
          <option value="">Все склады</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      {/* Иерархия */}
      {(directions.length > 0 || productTypes.length > 0) && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={hier.direction_id} onChange={(e) => setHier({ direction_id: e.target.value, product_type_id: '', campaign_id: '' })} style={selStyle}>
            <option value="">Направление</option>
            {directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={hier.product_type_id} onChange={(e) => setHier({ ...hier, product_type_id: e.target.value, campaign_id: '' })} style={selStyle}>
            <option value="">Тип</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={hier.campaign_id} onChange={(e) => setHier({ ...hier, campaign_id: e.target.value })} style={selStyle}>
            <option value="">Кампания</option>
            {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {hierActive && <button onClick={() => setHier({ direction_id: '', product_type_id: '', campaign_id: '' })}
            style={{ fontSize: 12, color: 'var(--ink)', padding: '0 6px' }}>✕ сбросить</button>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx3)' }}>{list.length} записей</span>
        </div>
      )}

      {/* Лента по дням */}
      {days.length === 0 && <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Нет операций.</div>}
      {days.map((d) => (
        <div key={d.key} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px 2px' }}>
            {d.label} · {d.date}
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {d.items.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < d.items.length - 1 ? '1px solid var(--brd)' : 'none' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: BG[m.type], display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>{ICO[m.type]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7 }}>
                    {pName(m.product_id)}
                    {m.annul_of_act && <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 20, background: 'var(--rd-l)', color: 'var(--rd-m)', fontWeight: 600 }}>аннулирование</span>}
                  </div>
                  {sub(m) && <div style={{ fontSize: 11.5, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub(m)}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: CLR[m.type] }}>
                    {m.type === 'in' || m.type === 'return' ? '+' : m.type === 'transfer' ? '~' : '−'}{m.qty}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                    {new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet ? TL[sheet] : ''}>
        {sheet && <OperationSheet type={sheet} data={data} profile={profile} onDone={() => { setSheet(null); data.reload() }} />}
      </Sheet>
    </div>
  )
}
