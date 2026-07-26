import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Sheet, useToast } from './ui'
import { writeOffDefect } from '../lib/inventory'

/* Брак, найденный после приёмки. Списывается со ссылкой на поставку —
   иначе рейтинг поставщика не узнает о претензии. */
export default function DefectSheet({ data, profile, onClose, onDone }) {
  const { products, suppliers, warehouses } = data
  const { toast } = useToast()

  const [deliveries, setDeliveries] = useState([])
  const [items, setItems] = useState([])          // приходы выбранной поставки
  const [dlvId, setDlvId] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const pName = (id) => (products || []).find((p) => p.id === id)?.name || '—'
  const sName = (id) => (suppliers || []).find((s) => s.id === id)?.name || 'поставщик'
  const wName = (id) => (warehouses || []).find((w) => w.id === id)?.name || ''

  // Последние поставки — по ним обычно и находят брак
  useEffect(() => {
    supabase.from('deliveries').select('*').order('created_at', { ascending: false }).limit(40)
      .then(({ data: d }) => setDeliveries(d || []))
  }, [])

  // Состав выбранной поставки и уже списанный по ней брак
  useEffect(() => {
    if (!dlvId) { setItems([]); setProductId(''); return }
    supabase.from('movements').select('*').eq('delivery_id', Number(dlvId))
      .then(({ data: mv }) => {
        const list = (mv || []).filter((m) => m.type === 'in')
        const done = (mv || []).filter((m) => m.type === 'defect')
        setItems(list.map((m) => ({
          product_id: m.product_id,
          accepted: m.qty,
          already: done.filter((d) => d.product_id === m.product_id).reduce((a, d) => a + d.qty, 0),
        })))
        setProductId('')
      })
  }, [dlvId])

  const dlv = deliveries.find((d) => d.id === Number(dlvId))
  const row = items.find((i) => i.product_id === Number(productId))
  const left = row ? row.accepted - row.already : 0

  const save = async () => {
    setBusy(true)
    const { error } = await writeOffDefect({
      delivery: dlv, productId: Number(productId), qty, comment, profile,
      warehouseId: dlv?.warehouse_id,
    })
    setBusy(false)
    if (error) return toast(error, 'error')
    toast('Брак списан, рейтинг поставщика обновлён')
    onDone()
  }

  const inp = {
    width: '100%', minHeight: 46, padding: '0 12px', borderRadius: 11,
    border: '1.5px solid var(--brd)', background: 'var(--sur)', fontSize: 13.5, color: 'var(--tx)',
  }
  const lbl = (t) => (
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--tx3)', marginBottom: 6 }}>{t}</div>
  )

  return (
    <Sheet open onClose={onClose} title="Брак по поставке">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '10px 13px', background: 'var(--bg)', borderRadius: 11, fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.55 }}>
          Списывается с остатка и попадает в оценку поставки. Больше, чем приняли по ней, указать нельзя.
        </div>

        <div>
          {lbl('Поставка')}
          <select value={dlvId} onChange={(e) => setDlvId(e.target.value)} style={inp}>
            <option value="">Выберите поставку…</option>
            {deliveries.map((d) => (
              <option key={d.id} value={d.id}>
                №{d.id} · {sName(d.supplier_id)} · {new Date(d.created_at).toLocaleDateString('ru-RU')}
                {d.warehouse_id ? ' · ' + wName(d.warehouse_id) : ''}
              </option>
            ))}
          </select>
        </div>

        {dlvId && items.length === 0 && (
          <div style={{ padding: '10px 13px', background: 'var(--am-l)', borderRadius: 11, fontSize: 11.5, color: 'var(--am-m)', lineHeight: 1.5 }}>
            У этой поставки не записан состав — она оформлена до того, как приход стал ссылаться на поставку. Брак по ней списать нельзя, используйте обычное списание.
          </div>
        )}

        {items.length > 0 && (
          <div>
            {lbl('Товар')}
            <select value={productId} onChange={(e) => { setProductId(e.target.value); setQty('') }} style={inp}>
              <option value="">Что бракуем…</option>
              {items.map((i) => (
                <option key={i.product_id} value={i.product_id} disabled={i.accepted - i.already <= 0}>
                  {pName(i.product_id)} · принято {i.accepted}
                  {i.already ? `, забраковано ${i.already}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {row && (
          <div>
            {lbl(`Количество · доступно ${left}`)}
            <input type="number" inputMode="numeric" min={1} max={left} value={qty}
              onChange={(e) => setQty(Math.min(left, Math.max(0, Number(e.target.value) || 0)) || '')}
              placeholder="0" style={inp} />
          </div>
        )}

        <div>
          {lbl('Что не так')}
          <input value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="Порвана упаковка, смазана печать…" style={inp} />
        </div>

        <Btn size="lg" onClick={save} disabled={busy || !dlvId || !productId || !qty} style={{ minHeight: 50 }}>
          Списать брак
        </Btn>
      </div>
    </Sheet>
  )
}
