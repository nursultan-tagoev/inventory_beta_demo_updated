import { createContext, useContext, useState, useCallback } from 'react'

/* ── Кнопки, поля ── */
export function Btn({ children, onClick, v = 'primary', size = 'md', disabled, loading, style, type = 'button' }) {
  const base = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600, borderRadius: 11, cursor: disabled || loading ? 'default' : 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', opacity: disabled ? .5 : 1, border: '1px solid transparent' }
  const sizes = { md: { height: 40, padding: '0 18px', fontSize: 13.5 }, sm: { height: 33, padding: '0 13px', fontSize: 12.5, borderRadius: 9 }, lg: { height: 46, padding: '0 22px', fontSize: 14 } }
  const vs = {
    primary: { background: 'var(--ink)', color: '#fff' }, secondary: { background: 'var(--sur)', border: '1px solid var(--brd2)', color: 'var(--tx)' },
    success: { background: 'var(--gr)', color: '#fff' }, danger: { background: 'var(--rd)', color: '#fff' }, ghost: { background: 'transparent', color: 'var(--tx2)' },
  }
  return <button type={type} onClick={onClick} disabled={disabled || loading} style={{ ...base, ...sizes[size], ...vs[v], ...style }}>
    {loading ? <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> : children}
  </button>
}
export function Spin({ s = 24 }) { return <span style={{ width: s, height: s, border: '3px solid var(--brd2)', borderTopColor: 'var(--ink)', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} /> }
export function Field({ label, children }) {
  return <label style={{ display: 'block' }}><span style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>{label}</span>{children}</label>
}
const inpStyle = { width: '100%', height: 44, padding: '0 14px', borderRadius: 12, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 14 }
export const Input = (p) => <input {...p} style={{ ...inpStyle, ...(p.style || {}) }} />
export const Select = (p) => <select {...p} style={{ ...inpStyle, ...(p.style || {}) }}>{p.children}</select>
export function Badge({ children, color = 'slate' }) {
  const c = { slate: ['var(--sur2)', 'var(--tx2)'], green: ['var(--gr-l)', 'var(--gr-m)'], red: ['var(--rd-l)', 'var(--rd-m)'], ink: ['var(--ink-l)', 'var(--ink)'], purple: ['var(--pu-l)', 'var(--pu)'], amber: ['var(--am-l)', 'var(--am-m)'] }[color]
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, background: c[0], color: c[1] }}>{children}</span>
}
export function Stat({ label, value, unit, color, accent }) {
  return <div className="card" style={{ padding: '16px 18px', borderTop: accent ? `3px solid ${color}` : '1px solid var(--brd)' }}>
    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 10 }}>{label}</div>
    <div className="mono" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.02em', color: color || 'var(--tx)' }}>{value}{unit && <span style={{ fontFamily: 'var(--f)', fontSize: 12, color: 'var(--tx3)', fontWeight: 500 }}> {unit}</span>}</div>
  </div>
}

/* ── Тосты ── */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const toast = useCallback((msg, type = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((p) => [...p, { id, msg, type }])
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 3400)
  }, [])
  return <ToastCtx.Provider value={toast}>
    {children}
    <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
      {items.map((t) => <div key={t.id} style={{ padding: '11px 20px', borderRadius: 12, fontSize: 13, fontWeight: 500, color: '#fff', boxShadow: 'var(--sh3)', background: t.type === 'error' ? 'var(--rd)' : t.type === 'warn' ? 'var(--am-m)' : 'var(--nav)', animation: 'fadeUp .2s ease' }}>{t.type === 'error' ? '✕ ' : t.type === 'warn' ? '⚠ ' : '✓ '}{t.msg}</div>)}
    </div>
  </ToastCtx.Provider>
}

/* ── Нижний лист ── */
export function Sheet({ open, onClose, title, children }) {
  if (!open) return null
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,10,14,.45)', backdropFilter: 'blur(3px)', animation: 'fadeUp .2s' }} />
    <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', background: 'var(--sur)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--sh3)', border: '1px solid var(--brd)', borderBottom: 'none', animation: 'slideUp .28s cubic-bezier(.32,.72,0,1)' }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}><div style={{ width: 42, height: 5, borderRadius: 3, background: 'var(--brd2)' }} /></div>
      {title && <div className="ff" style={{ padding: '10px 24px 0', fontWeight: 600, fontSize: 19 }}>{title}</div>}
      <div style={{ padding: '14px 24px 28px' }}>{children}</div>
    </div>
  </div>
}

/* ── Подтверждение ── */
export function Confirm({ title, message, onOk, onCancel, danger }) {
  return <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(3px)' }}>
    <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 380, padding: 24, animation: 'fadeUp .2s' }}>
      <div className="ff" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 20 }}>{message}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn v="secondary" size="sm" onClick={onCancel}>Отмена</Btn>
        <Btn v={danger ? 'danger' : 'primary'} size="sm" onClick={onOk}>Подтвердить</Btn>
      </div>
    </div>
  </div>
}

export const slideUpKeyframes = ''
