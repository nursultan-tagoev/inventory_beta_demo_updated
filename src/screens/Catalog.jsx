import { useState, useMemo } from 'react'
import { Btn, Sheet, useToast } from '../components/ui'
import { chainOf, freeAll } from '../lib/data'

const SEC = 'var(--sec-cat)', SEC_L = 'var(--sec-cat-l)'

/* Каталог для заявителей: что можно запросить.
   Точных остатков нет — только метка наличия. */
export default function Catalog({ data, profile, onRequest }) {
  const toast = useToast()
  const { products, directions, productTypes, campaigns, freeByWh, stockByWh } = data
  const [q, setQ] = useState('')
  const [hier, setHier] = useState({ direction_id: '', product_type_id: '', campaign_id: '' })
  const [draft, setDraft] = useState([])       // черновик заявки
  const [pick, setPick] = useState(null)       // выбранный товар
  const [qty, setQty] = useState(1)

  const types = hier.direction_id ? productTypes.filter((t) => t.direction_id == hier.direction_id) : productTypes
  const camps = hier.product_type_id ? campaigns.filter((c) => c.product_type_id == hier.product_type_id) : campaigns

  const inHier = (p) => {
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

  const list = products.filter((p) => !p.archived
    && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku || '').toLowerCase().includes(q.toLowerCase()))
    && inHier(p))

  // Метка наличия без цифр
  const avail = (p) => {
    const free = freeAll(freeByWh, stockByWh, p.id)
    if (free <= 0) return ['нет', 'var(--sur2)', 'var(--tx3)', 'bad']
    if (free <= 10) return ['мало', 'var(--am-l)', 'var(--am-m)', 'warn']
    return ['есть', 'var(--gr-l)', 'var(--gr-m)', 'ok']
  }

  const addToDraft = () => {
    if (!pick || qty < 1) return
    const free = freeAll(freeByWh, stockByWh, pick.id)
    if (qty > free) return toast(`Свободно только ${free}`, 'error')
    setDraft((d) => {
      const ex = d.find((x) => x.product_id === pick.id)
      return ex ? d.map((x) => x.product_id === pick.id ? { ...x, qty: x.qty + qty } : x)
                : [...d, { product_id: pick.id, name: pick.name, qty }]
    })
    setPick(null); setQty(1); toast('Добавлено в заявку')
  }

  const selS = { minHeight: 40, padding: '0 12px', borderRadius: 11, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 12.5, color: 'var(--tx)' }
  const hierActive = hier.direction_id || hier.product_type_id || hier.campaign_id

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 18px 90px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 20, fontWeight: 600 }}>Каталог</span>
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>что можно запросить</span>
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск товара…"
          style={{ ...selS, flex: 1, minWidth: 150, padding: '0 13px' }} />
        <select value={hier.direction_id} onChange={(e) => setHier({ direction_id: e.target.value, product_type_id: '', campaign_id: '' })} style={selS}>
          <option value="">Направление</option>
          {directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={hier.product_type_id} onChange={(e) => setHier({ ...hier, product_type_id: e.target.value, campaign_id: '' })} style={selS}>
          <option value="">Тип</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={hier.campaign_id} onChange={(e) => setHier({ ...hier, campaign_id: e.target.value })} style={selS}>
          <option value="">Кампания</option>
          {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {hierActive && <button onClick={() => setHier({ direction_id: '', product_type_id: '', campaign_id: '' })}
          style={{ fontSize: 12, color: SEC, padding: '0 6px' }}>сбросить</button>}
      </div>

      {/* Сетка товаров */}
      {list.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 9 }}>🔍</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Ничего не нашлось</div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Попробуйте изменить фильтры</div>
      </div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(168px,1fr))', gap: 11 }}>
        {list.map((p) => {
          const [lbl, bg, col, state] = avail(p)
          const chain = chainOf(p, { directions, productTypes, campaigns })
          const disabled = state === 'bad'
          return (
            <div key={p.id} onClick={() => !disabled && setPick(p)} className="card"
              style={{ padding: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--sur2)', display: 'grid', placeItems: 'center', fontSize: 17, marginBottom: 8 }}>📦</div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
              {chain && <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{chain}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9 }}>
                <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 20, background: bg, color: col }}>{lbl}</span>
                {!disabled && <span style={{ marginLeft: 'auto', fontSize: 11, color: SEC }}>запросить →</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Черновик заявки */}
      {draft.length > 0 && (
        <div className="card" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, borderRadius: '16px 16px 0 0', padding: '14px 18px calc(16px + env(safe-area-inset-bottom))', zIndex: 50, boxShadow: 'var(--sh3)', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Черновик заявки</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, padding: '2px 9px', borderRadius: 20, background: SEC_L, color: SEC }}>{draft.length} поз.</span>
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 10 }}>
            {draft.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid var(--brd)', fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <span className="mono" style={{ color: 'var(--tx3)' }}>{d.qty} шт</span>
                <button onClick={() => setDraft((s) => s.filter((_, j) => j !== i))} style={{ color: 'var(--tx3)', fontSize: 14, padding: '0 4px' }}>×</button>
              </div>
            ))}
          </div>
          <Btn onClick={() => { onRequest && onRequest(draft); setDraft([]) }} style={{ width: '100%', minHeight: 48 }}>Оформить заявку →</Btn>
        </div>
      )}

      {/* Выбор количества */}
      <Sheet open={!!pick} onClose={() => { setPick(null); setQty(1) }} title={pick?.name || ''}>
        {pick && (() => {
          const [lbl, bg, col] = avail(pick)
          const chain = chainOf(pick, { directions, productTypes, campaigns })
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--sur2)', display: 'grid', placeItems: 'center', fontSize: 20 }}>📦</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{pick.name}</div>
                  {chain && <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{chain}</div>}
                </div>
                <span style={{ fontSize: 9.5, padding: '2px 9px', borderRadius: 20, background: bg, color: col }}>{lbl}</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>Сколько нужно</div>
              <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 14 }}>
                <button onClick={() => setQty((n) => Math.max(1, n - 1))} style={{ width: 46, minHeight: 46, borderRadius: 12, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 19 }}>−</button>
                <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                  style={{ flex: 1, minHeight: 46, textAlign: 'center', border: '1px solid var(--brd2)', borderRadius: 12, background: 'var(--sur)', fontFamily: 'var(--mono)', fontSize: 17, color: 'var(--tx)' }} />
                <button onClick={() => setQty((n) => n + 1)} style={{ width: 46, minHeight: 46, borderRadius: 12, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 19 }}>+</button>
              </div>
              <Btn onClick={addToDraft} style={{ width: '100%', minHeight: 48 }}>В заявку</Btn>
            </div>
          )
        })()}
      </Sheet>
    </div>
  )
}
