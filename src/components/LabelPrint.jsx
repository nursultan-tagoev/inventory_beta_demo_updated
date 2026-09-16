import { useState, useMemo, useEffect } from 'react'
import { Btn, Sheet, useToast } from './ui'
import Label, { SIZES, sizeById } from './Label'
import { printDoc } from '../lib/print'
import { attrsLine } from '../lib/attrs'
import { listIntegrations, printerFor, printLabels } from '../lib/integrations'

/* Печать наклеек. Лист под обычный принтер — кладём сетку и режем,
   поштучно — под термопринтер. Проверяем до печати: рулон конечный. */

export default function LabelPrint({ items, products, onClose, warehouseId }) {
  const toast = useToast()
  const [size, setSize] = useState('40x30')

  /* Если подключён сетевой принтер — печатаем прямо на него, без окна браузера.
     Нет принтера — остаётся обычная печать листом. */
  const [printer, setPrinter] = useState(null)
  const [sending, setSending] = useState(false)
  useEffect(() => {
    listIntegrations().then((l) => {
      const p = printerFor(l, warehouseId)
      setPrinter(p)
      if (p?.label_size) setSize(p.label_size)
    })
  }, [warehouseId])
  const [copies, setCopies] = useState(() =>
    Object.fromEntries(items.map((it) => [it.product_id, it.qty || 1])))

  const s = sizeById(size)

  const rows = useMemo(() => items.map((it) => {
    const p = products.find((x) => x.id === it.product_id)
    return { product: p, qty: Math.max(0, Number(copies[it.product_id]) || 0) }
  }).filter((r) => r.product), [items, products, copies])

  const noSku = rows.filter((r) => !r.product.sku)
  const total = rows.reduce((a, r) => a + r.qty, 0)

  // Разворачиваем в отдельные наклейки: по копии на каждую
  const tags = useMemo(() => {
    const out = []
    for (const r of rows) for (let i = 0; i < r.qty; i++) out.push(r.product)
    return out
  }, [rows])

  const check = () => {
    if (noSku.length) { toast(`У ${noSku.length} товаров нет артикула — печатать нечего`, 'error'); return false }
    if (!total) { toast('Укажите количество наклеек', 'error'); return false }
    return true
  }

  const doPrint = () => { if (check()) printDoc('labels-sheet') }

  const doSend = async () => {
    if (!check()) return
    setSending(true)
    const { error } = await printLabels(printer.id, rows.filter((r) => r.qty > 0).map((r) => ({
      name: r.product.name, attrs: attrsLine(r.product), sku: r.product.sku, copies: r.qty,
    })))
    setSending(false)
    if (error) return toast(error, 'error')
    toast(`Отправлено на печать: ${total}`)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title="Печать наклеек">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 6 }}>Размер наклейки</div>
          <div className="scroll-x" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SIZES.map((x) => (
              <button key={x.id} onClick={() => setSize(x.id)}
                style={{ padding: '7px 13px', minHeight: 40, borderRadius: 9, fontSize: 12.5, whiteSpace: 'nowrap',
                  border: `1px solid ${size === x.id ? 'var(--ink)' : 'var(--brd)'}`,
                  background: size === x.id ? 'var(--ink-l)' : 'var(--sur)',
                  color: size === x.id ? 'var(--ink)' : 'var(--tx2)', fontWeight: size === x.id ? 600 : 400 }}>
                {x.label}
              </button>
            ))}
          </div>
          {!s.both && (
            <div style={{ fontSize: 11.5, color: 'var(--am-m)', marginTop: 6, lineHeight: 1.5 }}>
              На этом размере два кода нечитаемы — печатается только штрихкод.
            </div>
          )}
        </div>

        {noSku.length > 0 && (
          <div style={{ padding: '11px 13px', background: 'var(--rd-l)', borderRadius: 11, fontSize: 11.5, color: 'var(--rd-m)', lineHeight: 1.6 }}>
            Без артикула: {noSku.map((r) => r.product.name).join(', ')}.
            Присвойте артикулы в разделе Товары кнопкой «Артикулы».
          </div>
        )}

        <div style={{ border: '1px solid var(--brd)', borderRadius: 11, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.product.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderTop: i ? '1px solid var(--brd)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product.name}</div>
                <div className="mono" style={{ fontSize: 10.5, color: r.product.sku ? 'var(--tx3)' : 'var(--rd-m)' }}>
                  {r.product.sku || 'нет артикула'}
                </div>
              </div>
              <input value={copies[r.product.id] ?? 1} inputMode="numeric"
                onChange={(e) => setCopies({ ...copies, [r.product.id]: e.target.value.replace(/[^0-9]/g, '') })}
                style={{ width: 62, minHeight: 38, textAlign: 'center', border: '1.5px solid var(--brd)', borderRadius: 9, background: 'var(--sur)', fontSize: 13.5, color: 'var(--tx)' }} />
            </div>
          ))}
        </div>

        {/* Предпросмотр в реальном масштабе: видно, влезает ли название */}
        {rows[0]?.product && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 6 }}>Как будет выглядеть</div>
            <div style={{ display: 'inline-block', border: '1px dashed var(--brd)', borderRadius: 6, padding: 4, background: '#fff', minHeight: 40 }}>
              <Label key={size} product={rows[0].product} size={size} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5 }}>
          <span style={{ color: 'var(--tx3)' }}>Всего наклеек</span>
          <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{total}</span>
        </div>

        {printer ? (
          <>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', textAlign: 'center' }}>
              Принтер: {printer.name}
            </div>
            <Btn size="lg" loading={sending} onClick={doSend} style={{ minHeight: 50 }}>Печать на принтер</Btn>
            <Btn v="secondary" onClick={doPrint} style={{ minHeight: 44 }}>Через окно браузера</Btn>
          </>
        ) : (
          <Btn size="lg" onClick={doPrint} style={{ minHeight: 50 }}>Печать</Btn>
        )}

        {/* Лист для печати: сетка наклеек встык, без отступов между ними */}
        <div style={{ display: 'none' }}>
          <div id="labels-sheet" style={{ display: 'flex', flexWrap: 'wrap', gap: 0, background: '#fff' }}>
            {tags.map((p, i) => (
              <div key={i} style={{ border: '0.2mm dashed #bbb' }}>
                <Label key={size + '-' + i} product={p} size={size} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
