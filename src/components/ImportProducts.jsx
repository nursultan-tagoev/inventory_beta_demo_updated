import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { Btn, Sheet, useToast } from './ui'

/* Загрузка товаров списком. Ничего не пишем, пока человек не увидит,
   что именно произойдёт: новое, обновление, ошибки — раздельно. */

const COLS = ['Наименование', 'Артикул', 'Категория', 'Направление', 'Тип', 'Кампания', 'Цена']

// Заголовки в файле могут отличаться регистром и пробелами
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const PICK = {
  наименование: 'name', название: 'name', товар: 'name',
  категория: 'category', направление: 'direction', тип: 'type', кампания: 'campaign',
  цена: 'price', стоимость: 'price',
  артикул: 'sku', код: 'sku', sku: 'sku',
}

export default function ImportProducts({ data, onClose, onDone }) {
  const { products, categories, directions, productTypes, campaigns } = data
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')

  const template = () => {
    const ws = XLSX.utils.json_to_sheet([{
      Наименование: 'Ручка синяя брендированная', Артикул: 'PEN-001', Категория: 'Канцелярия',
      Направление: 'Розница', Тип: 'Сувенирная продукция', Кампания: 'Осень 2026', Цена: 45,
    }])
    ws['!cols'] = COLS.map((c) => ({ wch: Math.max(14, c.length + 4) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Товары')
    XLSX.writeFile(wb, 'shablon_tovary.xlsx')
  }

  const read = async (file) => {
    if (!file) return
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (!raw.length) return toast('В файле нет строк', 'error')

      const parsed = raw.map((r, i) => {
        const o = {}
        for (const [k, v] of Object.entries(r)) {
          const key = PICK[norm(k)]
          if (key) o[key] = typeof v === 'string' ? v.trim() : v
        }
        const name = (o.name || '').trim()
        const exists = products.find((p) => p.name.toLowerCase() === name.toLowerCase())
        const price = Number(String(o.price || '').replace(',', '.')) || 0

        let error = null
        if (!name) error = 'пустое наименование'
        else if (price < 0) error = 'отрицательная цена'

        return {
          line: i + 2, name, price,
          category: o.category || '', direction: o.direction || '',
          type: o.type || '', campaign: o.campaign || '',
          sku: (o.sku || '').toString().trim(),
          status: error ? 'error' : exists ? 'update' : 'new',
          error, existingId: exists?.id || null,
        }
      })

      // Дубликаты внутри самого файла — частая беда при копировании
      const seen = new Map()
      for (const r of parsed) {
        const k = r.name.toLowerCase()
        if (!k) continue
        if (seen.has(k)) { r.status = 'error'; r.error = 'повтор строки ' + seen.get(k) }
        else seen.set(k, r.line)
      }
      setRows(parsed)
    } catch (e) {
      toast('Не удалось прочитать файл: ' + e.message, 'error')
    }
  }

  // Справочники дозаводим по ходу, чтобы файл не требовал ручной подготовки
  const ensure = async (table, name, extra = {}) => {
    if (!name) return null
    const src = { categories, directions, product_types: productTypes, campaigns }[table] || []
    const hit = src.find((x) => x.name?.toLowerCase() === name.toLowerCase())
    if (hit) return hit.id
    const { data: created } = await supabase.from(table).insert({ name, ...extra }).select().single()
    if (created) src.push(created)
    return created?.id || null
  }

  const apply = async () => {
    const good = rows.filter((r) => r.status !== 'error')
    if (!good.length) return toast('Нечего загружать', 'error')
    setBusy(true)
    let added = 0, updated = 0, failed = 0

    for (const r of good) {
      try {
        const category_id = await ensure('categories', r.category)
        const direction_id = await ensure('directions', r.direction)
        const product_type_id = await ensure('product_types', r.type, direction_id ? { direction_id } : {})
        const campaign_id = await ensure('campaigns', r.campaign, product_type_id ? { product_type_id } : {})

        const body = {
          name: r.name, sku: r.sku || null, price: r.price, archived: false,
          category_id, direction_id, product_type_id, campaign_id,
        }
        if (r.existingId) {
          const { error } = await supabase.from('products').update(body).eq('id', r.existingId)
          error ? failed++ : updated++
        } else {
          const { error } = await supabase.from('products').insert(body)
          error ? failed++ : added++
        }
      } catch (e) { failed++ }
    }

    setBusy(false)
    toast(`Добавлено ${added}, обновлено ${updated}${failed ? `, с ошибкой ${failed}` : ''}`)
    onDone()
  }

  const counts = rows ? {
    new: rows.filter((r) => r.status === 'new').length,
    update: rows.filter((r) => r.status === 'update').length,
    error: rows.filter((r) => r.status === 'error').length,
  } : null

  const TONE = {
    new: ['var(--gr-l)', 'var(--gr-m)', 'новый'],
    update: ['var(--am-l)', 'var(--am-m)', 'обновится'],
    error: ['var(--rd-l)', 'var(--rd-m)', 'ошибка'],
  }

  return (
    <Sheet open onClose={onClose} title="Загрузка товаров списком">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!rows && (
          <>
            <div style={{ padding: '11px 13px', background: 'var(--bg)', borderRadius: 11, fontSize: 12, color: 'var(--tx2)', lineHeight: 1.6 }}>
              Файл Excel, первая строка — заголовки. Обязательна только колонка «Наименование».
              Категории, направления, типы и кампании создадутся сами, если их ещё нет.
              Товар с таким же названием не задвоится, а обновится.
            </div>

            <Btn v="secondary" onClick={template} style={{ minHeight: 46 }}>Скачать шаблон</Btn>

            <label style={{ display: 'block', border: '1.5px dashed var(--brd)', borderRadius: 12, padding: '26px 16px', textAlign: 'center', cursor: 'pointer' }}>
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={(e) => read(e.target.files?.[0])} />
              <div style={{ fontSize: 26, marginBottom: 6 }}>📄</div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Выбрать файл</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 3 }}>xlsx, xls или csv</div>
            </label>
          </>
        )}

        {rows && (
          <>
            <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{fileName} · строк: {rows.length}</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {['new', 'update', 'error'].map((k) => (
                <div key={k} style={{ background: TONE[k][0], borderRadius: 10, padding: '9px 11px', textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: TONE[k][1] }}>{counts[k]}</div>
                  <div style={{ fontSize: 10, color: TONE[k][1] }}>{TONE[k][2]}</div>
                </div>
              ))}
            </div>

            <div style={{ border: '1px solid var(--brd)', borderRadius: 11, maxHeight: 300, overflowY: 'auto' }}>
              {rows.map((r, i) => (
                <div key={i} style={{ padding: '9px 12px', borderTop: i ? '1px solid var(--brd)' : 'none', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--tx3)', width: 26, flexShrink: 0 }}>{r.line}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name || <span style={{ color: 'var(--tx3)' }}>без названия</span>}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                      {r.error || [r.direction, r.type, r.campaign].filter(Boolean).join(' · ') || 'без иерархии'}
                    </div>
                  </div>
                  <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', background: TONE[r.status][0], color: TONE[r.status][1] }}>
                    {TONE[r.status][2]}
                  </span>
                </div>
              ))}
            </div>

            {counts.error > 0 && (
              <div style={{ padding: '10px 12px', background: 'var(--rd-l)', borderRadius: 11, fontSize: 11.5, color: 'var(--rd-m)', lineHeight: 1.5 }}>
                Строки с ошибкой будут пропущены — остальные загрузятся.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Btn v="secondary" onClick={() => { setRows(null); setFileName('') }} style={{ minHeight: 48 }}>Другой файл</Btn>
              <Btn onClick={apply} loading={busy} style={{ flex: 1, minHeight: 48 }}>
                Загрузить {counts.new + counts.update}
              </Btn>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
