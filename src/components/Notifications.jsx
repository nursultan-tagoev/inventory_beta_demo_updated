import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { markSeen, splitNotifs, ICONS, TONE } from '../lib/notify'

function Row({ n, dismissable, onGo, onRead }) {
  const t = TONE[n.kind] || ['var(--sur2)', 'var(--tx2)']
  return (
    <div onClick={() => onGo(n)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: '1px solid var(--brd)', cursor: 'pointer' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: t[0], display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0 }}>{ICONS[n.kind] || '🔔'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{n.title}</div>
        {n.body && <div style={{ fontSize: 10.5, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
      </div>
      {dismissable && <button onClick={(e) => { e.stopPropagation(); onRead(n) }} style={{ fontSize: 15, color: 'var(--tx3)', padding: '0 4px' }}>×</button>}
    </div>
  )
}

/* Колокольчик в шапке + шторка со списком */
export default function Notifications({ profile, onOpen }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)

  const load = async () => {
    if (!profile?.id) return
    const { data } = await supabase.from('notifications').select('*')
      .eq('user_id', profile.id).eq('seen', false).order('created_at', { ascending: false }).limit(50)
    setList(data || [])
  }

  useEffect(() => { load() }, [profile?.id])
  useEffect(() => {
    if (!profile?.id) return
    const ch = supabase.channel('notif-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id])

  const { actions, news } = splitNotifs(list)
  const total = actions.length + news.length

  const readAll = async () => { await markSeen(news.map((n) => n.id)); load() }
  const readOne = async (n) => { await markSeen([n.id]); load() }
  const go = (n) => {
    setOpen(false)
    if (onOpen) onOpen(n)
  }

  return (
    <>
      <button onClick={() => setOpen(!open)} title="Уведомления"
        style={{ position: 'relative', width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center',
          background: total ? 'var(--ink-l)' : 'var(--sur2)', color: total ? 'var(--ink)' : 'var(--tx3)', fontSize: 17 }}>
        🔔
        {total > 0 && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9, background: 'var(--rd)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{total}</span>}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(61,55,47,.35)', backdropFilter: 'blur(2px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="notif-panel"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, maxWidth: 460, margin: '0 auto', background: 'var(--sur)', borderRadius: '0 0 18px 18px', padding: '16px 18px 20px', boxShadow: 'var(--sh3)', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
              <span className="ff" style={{ fontSize: 16 }}>Уведомления</span>
              {news.length > 0 && <button onClick={readAll} style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink)' }}>прочитать всё</button>}
            </div>

            {total === 0 && <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--tx3)' }}>
              <div style={{ fontSize: 26, marginBottom: 7 }}>✓</div>
              <div style={{ fontSize: 12.5 }}>Всё просмотрено</div>
            </div>}

            {actions.length > 0 && (
              <div style={{ border: '1.5px solid var(--ink)', borderRadius: 12, padding: '11px 13px', marginBottom: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink)' }}>Требует действия · {actions.length}</span>
                  <button onClick={async () => { await markSeen(actions.map((n) => n.id)); load() }} style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>скрыть все</button>
                </div>
                {actions.map((n) => <Row key={n.id} n={n} dismissable onGo={go} onRead={readOne} />)}
              </div>
            )}

            {news.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 5 }}>Что нового · {news.length}</div>
                {news.map((n) => <Row key={n.id} n={n} dismissable onGo={go} onRead={readOne} />)}
              </>
            )}

            <div style={{ width: 38, height: 4, background: 'var(--brd2)', borderRadius: 3, margin: '14px auto 0' }} />
          </div>
        </div>
      )}
    </>
  )
}
