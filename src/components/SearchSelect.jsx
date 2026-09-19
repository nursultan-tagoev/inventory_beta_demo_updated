import { useState, useRef, useEffect, useMemo } from 'react'

/* Выпадающий список с поиском. Обычный список на пятьсот товаров
   или семьдесят департаментов пролистывать невозможно —
   человек ищет глазами то, что нашлось бы вводом двух букв. */

export default function SearchSelect({
  value, onChange, options, placeholder = '— выбрать —',
  groupBy, extra, required, style,
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  const current = options.find((o) => String(o.value) === String(value))

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    setTimeout(() => inputRef.current?.focus(), 30)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return options
    return options.filter((o) =>
      o.label.toLowerCase().includes(s) || (o.hint || '').toLowerCase().includes(s))
  }, [q, options])

  // Группы показываем только когда не ищем: при поиске они мешают
  const groups = useMemo(() => {
    if (!groupBy || q.trim()) return [['', list]]
    const g = {}
    for (const o of list) (g[o.group || ''] ||= []).push(o)
    return Object.entries(g)
  }, [list, groupBy, q])

  const field = {
    width: '100%', minHeight: 44, padding: '0 14px', borderRadius: 12,
    border: `1px solid ${required && !value ? 'var(--am)' : 'var(--brd2)'}`,
    background: 'var(--sur)', fontSize: 14, color: value ? 'var(--tx)' : 'var(--tx3)',
    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left',
    ...style,
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={field}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.label : placeholder}
        </span>
        <span style={{ color: 'var(--tx3)', fontSize: 11 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
          background: 'var(--sur)', border: '1px solid var(--brd2)', borderRadius: 12,
          boxShadow: 'var(--sh3)', overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--brd)' }}>
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск"
              style={{ width: '100%', minHeight: 38, padding: '0 11px', borderRadius: 9, border: '1px solid var(--brd)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--tx)' }} />
          </div>

          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {list.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>Ничего не нашлось</div>
            )}

            {groups.map(([name, items]) => (
              <div key={name || 'all'}>
                {name && (
                  <div style={{ padding: '7px 13px 4px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--tx3)', background: 'var(--bg)' }}>{name}</div>
                )}
                {items.map((o) => (
                  <button key={o.value} type="button"
                    onClick={() => { onChange(o.value); setOpen(false); setQ('') }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 13px', minHeight: 44,
                      background: String(o.value) === String(value) ? 'var(--ink-l)' : 'transparent',
                      color: String(o.value) === String(value) ? 'var(--ink)' : 'var(--tx)',
                      fontSize: 13.5, display: 'block',
                    }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                    {o.hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 1 }}>{o.hint}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {extra && (
            <div style={{ borderTop: '1px solid var(--brd)' }}>
              <button type="button" onClick={() => { setOpen(false); setQ(''); extra.onClick() }}
                style={{ width: '100%', padding: '12px 13px', minHeight: 46, textAlign: 'left', fontSize: 13, color: 'var(--ink)' }}>
                {extra.label}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
