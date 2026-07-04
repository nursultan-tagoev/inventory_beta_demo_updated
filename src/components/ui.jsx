export function Btn({ children, onClick, v = 'primary', size = 'md', disabled, loading, style, type = 'button' }) {
  const base = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600, borderRadius: 11, cursor: disabled || loading ? 'default' : 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', opacity: disabled ? .5 : 1, border: '1px solid transparent' }
  const sizes = { md: { height: 40, padding: '0 18px', fontSize: 13.5 }, sm: { height: 33, padding: '0 13px', fontSize: 12.5, borderRadius: 9 }, lg: { height: 46, padding: '0 22px', fontSize: 14 } }
  const vs = {
    primary: { background: 'var(--ink)', color: '#fff' },
    secondary: { background: 'var(--sur)', border: '1px solid var(--brd2)', color: 'var(--tx)' },
    success: { background: 'var(--gr)', color: '#fff' },
    danger: { background: 'var(--rd)', color: '#fff' },
    ghost: { background: 'transparent', color: 'var(--tx2)' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} style={{ ...base, ...sizes[size], ...vs[v], ...style }}>
      {loading ? <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> : children}
    </button>
  )
}

export function Spin({ s = 24 }) {
  return <span style={{ width: s, height: s, border: '3px solid var(--brd2)', borderTopColor: 'var(--ink)', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} />
}

export function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>{label}</span>
      {children}
    </label>
  )
}

const inpStyle = { width: '100%', height: 44, padding: '0 14px', borderRadius: 12, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 14 }
export const Input = (p) => <input {...p} style={{ ...inpStyle, ...(p.style || {}) }} />
export const Select = (p) => <select {...p} style={{ ...inpStyle, ...(p.style || {}) }}>{p.children}</select>

export function Badge({ children, color = 'slate' }) {
  const c = { slate: ['var(--sur2)', 'var(--tx2)'], green: ['var(--gr-l)', 'var(--gr-m)'], red: ['var(--rd-l)', 'var(--rd-m)'], ink: ['var(--ink-l)', 'var(--ink)'], purple: ['var(--pu-l)', 'var(--pu)'], amber: ['var(--am-l)', 'var(--am-m)'] }[color]
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, background: c[0], color: c[1] }}>{children}</span>
}

export function Stat({ label, value, unit, color, accent }) {
  return (
    <div className="card" style={{ padding: '16px 18px', borderTop: accent ? `3px solid ${color}` : '1px solid var(--brd)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 10 }}>{label}</div>
      <div className="mono" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-.02em', color: color || 'var(--tx)' }}>{value}{unit && <span style={{ fontFamily: 'var(--f)', fontSize: 13, color: 'var(--tx3)', fontWeight: 500 }}> {unit}</span>}</div>
    </div>
  )
}
