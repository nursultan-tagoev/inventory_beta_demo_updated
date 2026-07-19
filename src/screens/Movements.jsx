import { useState, useMemo } from 'react'
import { Btn, Sheet } from '../components/ui'
import { TL } from '../lib/format'
import OperationSheet from '../components/OperationSheet'

const SEC = 'var(--sec-mov)', SEC_L = 'var(--sec-mov-l)'
const ICO = { in: '📥', out: '📤', return: '🔄', writeoff: '🗑', transfer: '⇄' }
const CLR = { in: 'var(--gr)', out: 'var(--ink)', return: 'var(--pu)', writeoff: 'var(--rd)', transfer: 'var(--am)' }
const BG = { in: 'var(--gr-l)', out: 'var(--ink-l)', return: 'var(--pu-l)', writeoff: 'var(--rd-l)', transfer: 'var(--am-l)' }

/* Цвета филиалов — назначаются автоматически по порядку */
const PALETTE = [
  ['#E8F2FF', '#1D5FA8'], ['#F1EDFE', '#6A4BD6'], ['#E1F5EE', '#0F6E56'],
  ['#FDEEDE', '#B26907'], ['#FCEBEB', '#A32D2D'], ['#EAF3EA', '#4A7850'],
  ['#F5ECF5', '#8B5A8C'], ['#E9F1F7', '#4A7BA7'],
]

export default function Movements({ data, profile, can }) {
  const { movements, products, recipients, warehouses, branches, campaigns, productTypes, directions, requests, profiles } = data
  const role = profile?.role
  const isAdmin = role === 'admin'
  const isDirector = role === 'director'
  const isManager = role === 'manager'
  const seeAll = isAdmin || isDirector

  const [f, setF] = useState('all')
  const [q, setQ] = useState('')
  const [wh, setWh] = useState('')
  const [byPerson, setByPerson] = useState(false)
  const [sheet, setSheet] = useState(null)

  const pById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const pName = (id) => pById[id]?.name || '—'
  const rName = (id) => recipients.find((r) => r.id === id)?.name || ''
  const bName = (id) => branches.find((b) => b.id === id)?.name || ''
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || ''

  // Цвет филиала по индексу в справочнике
  const bColor = (id) => {
    const i = branches.findIndex((b) => b.id === id)
    return i >= 0 ? PALETTE[i % PALETTE.length] : ['var(--sur2)', 'var(--tx3)']
  }

  // Номер заявки по движению (через акт или примечание)
  const reqNo = (m) => {
    if (!m.notes) return null
    const byAct = (data.acts || []).find((a) => m.notes.includes(a.number))
    return byAct?.request_id || null
  }

  /* Область видимости */
  const visible = movements.filter((m) => {
    if (seeAll) return true
    if (isManager) return m.branch_id === profile?.branch_id
    // специалист — только где он получатель
    const rec = recipients.find((r) => r.id === m.recipient_id)
    return rec && (rec.name === profile?.full_name || rec.name === profile?.email)
  })

  const TYPES = seeAll
    ? [['all', 'Все'], ['in', 'Приход'], ['out', 'Выдача'], ['return', 'Возврат'], ['writeoff', 'Списание'], ['transfer', 'Перемещение']]
    : [['all', 'Всё'], ['out', 'Получено'], ['return', 'Возвращено']]

  const list = visible.filter((m) => {
    if (f !== 'all' && m.type !== f) return false
    if (wh && m.warehouse_id != wh && m.warehouse_to_id != wh) return false
    if (q) {
      const s = (pName(m.product_id) + ' ' + rName(m.recipient_id) + ' ' + bName(m.branch_id) + ' ' + (m.purpose || '') + ' ' + (m.notes || '')).toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return true
  })

  // Группировка по дням
  const days = useMemo(() => {
    const g = {}
    for (const m of list) {
      const key = new Date(m.created_at).toISOString().slice(0, 10)
      ;(g[key] || (g[key] = [])).push(m)
    }
    const today = new Date().toISOString().slice(0, 10)
    const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0])).map(([key, items]) => ({
      key,
      label: key === today ? 'Сегодня' : key === yest ? 'Вчера' : new Date(key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
      date: new Date(key).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
      items,
    }))
  }, [list])

  // Группировка по сотрудникам (для менеджера)
  const persons = useMemo(() => {
    const g = {}
    for (const m of list) {
      const name = rName(m.recipient_id) || '— без получателя —'
      ;(g[name] || (g[name] = [])).push(m)
    }
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length)
  }, [list])

  const title = seeAll ? 'Журнал склада' : isManager ? 'Движения филиала' : 'Мои получения'
  const selS = { minHeight: 38, padding: '0 12px', borderRadius: 10, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 12.5, color: 'var(--tx)' }

  const Row = ({ m }) => {
    const bc = m.branch_id ? bColor(m.branch_id) : null
    const rn = reqNo(m)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: '1px solid var(--brd)' }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: BG[m.type], display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0 }}>{ICO[m.type]}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName(m.product_id)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
            {bc && seeAll && <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 20, background: bc[0], color: bc[1], whiteSpace: 'nowrap' }}>{bName(m.branch_id)}</span>}
            {m.recipient_id && !isManager && <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{rName(m.recipient_id)}</span>}
            {isManager && m.recipient_id && <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{rName(m.recipient_id)}</span>}
            {m.type === 'transfer' && <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{whName(m.warehouse_id)} → {whName(m.warehouse_to_id)}</span>}
            {rn && <span className="mono" style={{ fontSize: 10, color: SEC }}>заявка №{rn}</span>}
            {m.annul_of_act && <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 20, background: 'var(--rd-l)', color: 'var(--rd-m)' }}>аннулирование</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: CLR[m.type] }}>
            {m.type === 'in' || m.type === 'return' ? '+' : m.type === 'transfer' ? '~' : '−'}{m.qty}
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
            {new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 18px 90px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 20, fontWeight: 600 }}>{title}</span>
        {isManager && profile?.branch_id && (() => { const bc = bColor(profile.branch_id)
          return <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: bc[0], color: bc[1] }}>{bName(profile.branch_id)}</span> })()}
        {isAdmin && <Btn size="sm" onClick={() => setSheet('in')} style={{ marginLeft: 'auto', minHeight: 40 }}>＋ Операция</Btn>}
      </div>

      {/* Пилюли типов */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {TYPES.map(([t, l]) => (
          <button key={t} onClick={() => setF(t)} style={{
            fontSize: 12, padding: '7px 13px', minHeight: 36, borderRadius: 20, whiteSpace: 'nowrap',
            border: `1px solid ${f === t ? 'transparent' : 'var(--brd)'}`,
            background: f === t ? SEC_L : 'var(--sur)', color: f === t ? SEC : 'var(--tx3)', fontWeight: f === t ? 600 : 500,
          }}>{l}</button>
        ))}
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={seeAll ? 'Товар, филиал, № заявки…' : 'Поиск…'}
          style={{ ...selS, flex: 1, minWidth: 150, padding: '0 12px' }} />
        {seeAll && <select value={wh} onChange={(e) => setWh(e.target.value)} style={selS}>
          <option value="">Все склады</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>}
        {isManager && <button onClick={() => setByPerson(!byPerson)} style={{
          ...selS, fontWeight: byPerson ? 600 : 500,
          background: byPerson ? SEC_L : 'var(--sur)', color: byPerson ? SEC : 'var(--tx3)', border: `1px solid ${byPerson ? 'transparent' : 'var(--brd2)'}`,
        }}>По сотрудникам</button>}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--tx3)' }}>{list.length}</span>
      </div>

      {list.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 9 }}>📦</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Пока пусто</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
            {seeAll ? 'Операции появятся после первой выдачи или прихода' : 'Здесь появится то, что вы получите'}
          </div>
        </div>
      )}

      {/* По сотрудникам */}
      {isManager && byPerson && persons.map(([name, items]) => (
        <div key={name} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 0 7px 2px' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: SEC_L, color: SEC, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 600 }}>
              {name.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{name}</span>
            <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{items.length}</span>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {items.map((m) => <Row key={m.id} m={m} />)}
          </div>
        </div>
      ))}

      {/* По дням */}
      {!(isManager && byPerson) && days.map((d) => (
        <div key={d.key} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 7px 2px' }}>
            {d.label} · {d.date}
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {d.items.map((m) => <Row key={m.id} m={m} />)}
          </div>
        </div>
      ))}

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet ? TL[sheet] : ''}>
        {sheet && <OperationSheet type={sheet} data={data} profile={profile} onDone={() => { setSheet(null); data.reload() }} />}
      </Sheet>
    </div>
  )
}
