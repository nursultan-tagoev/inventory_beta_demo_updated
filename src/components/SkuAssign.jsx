import { useState, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Sheet, useToast } from './ui'
import { assignSkus } from '../lib/sku'
import { exportXlsx } from '../lib/xlsx'

/* Массовое присвоение артикулов. Операция разовая и необратимая:
   старые коды пропадут, а по ним могли сверяться накладные поставщиков.
   Поэтому сначала полный предпросмотр и возможность выгрузить его в файл. */

export default function SkuAssign({ data, onClose, onDone }) {
  const { products, directions, productTypes, campaigns, invalidate } = data
  const toast = useToast()
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const alive = useMemo(() => (products || []).filter((p) => !p.archived), [products])
  const rows = useMemo(
    () => assignSkus(alive, { directions, productTypes, campaigns }, { onlyEmpty }),
    [alive, directions, productTypes, campaigns, onlyEmpty],
  )

  const changed = rows.filter((r) => r.changed)
  const rewritten = changed.filter((r) => r.old)   // были свои коды — их затрём

  const apply = async () => {
    if (!changed.length) return toast('Менять нечего', 'error')
    setBusy(true)
    let ok = 0, failed = 0
    for (const r of changed) {
      const { error } = await supabase.from('products').update({ sku: r.sku }).eq('id', r.id)
      error ? failed++ : ok++
    }
    setBusy(false)
    setDone({ ok, failed })
    invalidate?.(['products'])
    toast(failed ? `Присвоено ${ok}, с ошибкой ${failed}` : `Присвоено артикулов: ${ok}`)
  }

  const save = () => exportXlsx([{
    name: 'Артикулы',
    rows: rows.map((r) => ({
      Товар: r.name, 'Было': r.old || '—', 'Станет': r.sku, 'Меняется': r.changed ? 'да' : 'нет',
    })),
  }], 'artikuly')

  return (
    <Sheet open onClose={onClose} title="Артикулы">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {done ? (
          <>
            <div style={{ padding: '13px 15px', background: 'var(--gr-l)', borderRadius: 12, border: '1px solid var(--gr)' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--gr-m)' }}>Готово</div>
              <div style={{ fontSize: 11.5, color: 'var(--gr-m)', marginTop: 3 }}>
                Присвоено {done.ok}{done.failed ? `, с ошибкой ${done.failed}` : ''}
              </div>
            </div>
            <Btn size="lg" onClick={onDone} style={{ minHeight: 48 }}>Закрыть</Btn>
          </>
        ) : (
          <>
            <div style={{ padding: '11px 13px', background: 'var(--bg)', borderRadius: 11, fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.6 }}>
              Артикул собирается из направления, типа, цвета и размера — например RZN-FTB-BLU-M.
              Присваивается один раз: дальше он не меняется, даже если товар переименовать, —
              иначе наклейки на складе стали бы неверными.
            </div>

            <div style={{ display: 'flex', gap: 7 }}>
              <button onClick={() => setOnlyEmpty(true)}
                style={{ flex: 1, minHeight: 42, borderRadius: 10, fontSize: 12.5, fontWeight: onlyEmpty ? 600 : 400,
                  border: `1px solid ${onlyEmpty ? 'var(--ink)' : 'var(--brd)'}`,
                  background: onlyEmpty ? 'var(--ink-l)' : 'var(--sur)', color: onlyEmpty ? 'var(--ink)' : 'var(--tx3)' }}>
                Только пустые
              </button>
              <button onClick={() => setOnlyEmpty(false)}
                style={{ flex: 1, minHeight: 42, borderRadius: 10, fontSize: 12.5, fontWeight: !onlyEmpty ? 600 : 400,
                  border: `1px solid ${!onlyEmpty ? 'var(--am)' : 'var(--brd)'}`,
                  background: !onlyEmpty ? 'var(--am-l)' : 'var(--sur)', color: !onlyEmpty ? 'var(--am-m)' : 'var(--tx3)' }}>
                Перегенерировать всё
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[['Товаров', rows.length, 'var(--tx)'],
                ['Получат код', changed.length, 'var(--gr-m)'],
                ['Перезапишем', rewritten.length, rewritten.length ? 'var(--rd-m)' : 'var(--tx3)']].map(([l, v, c]) => (
                <div key={l} style={{ background: 'var(--bg)', borderRadius: 10, padding: '9px 11px', textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{l}</div>
                </div>
              ))}
            </div>

            {rewritten.length > 0 && (
              <div style={{ padding: '11px 13px', background: 'var(--rd-l)', borderRadius: 11, fontSize: 11.5, color: 'var(--rd-m)', lineHeight: 1.6 }}>
                У {rewritten.length} товаров артикул уже был — он будет заменён.
                Если по старым кодам сверяются накладные, сначала выгрузите таблицу.
              </div>
            )}

            <div style={{ border: '1px solid var(--brd)', borderRadius: 11, maxHeight: 280, overflowY: 'auto' }}>
              {rows.map((r, i) => (
                <div key={r.id} style={{ padding: '9px 12px', borderTop: i ? '1px solid var(--brd)' : 'none', display: 'flex', gap: 9, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    {r.old && r.changed && (
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--tx3)', textDecoration: 'line-through' }}>{r.old}</div>
                    )}
                  </div>
                  <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                    color: r.changed ? 'var(--gr-m)' : 'var(--tx3)' }}>{r.sku}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Btn v="secondary" onClick={save} style={{ minHeight: 48 }}>Выгрузить</Btn>
              <Btn onClick={apply} loading={busy} style={{ flex: 1, minHeight: 48 }}>
                Присвоить {changed.length}
              </Btn>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
