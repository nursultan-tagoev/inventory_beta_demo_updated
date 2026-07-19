import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { push, clearFor } from '../lib/notify'
import { Btn } from './ui'

/* Чат уточнения внутри заявки — пишут все участники */
export default function RequestChat({ req, data, profile, compact }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const msgs = (data.reqMessages || []).filter((m) => m.request_id === req.id)

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setBusy(true)
    const { error } = await supabase.from('request_messages').insert({
      request_id: req.id, author_id: profile.id,
      author_name: profile.full_name || profile.email, body,
    })
    setBusy(false)
    if (error) return
    setText('')
    // ответил — вопрос для меня закрыт
    await clearFor('request', req.id, profile.id)
    // уведомляем остальных участников
    const parts = new Set()
    if (req.author_id) parts.add(req.author_id)
    for (const a of (data.reqApprovers || []).filter((x) => x.request_id === req.id && x.user_id)) parts.add(a.user_id)
    const admin = (data.profiles || []).find((p) => p.role === 'admin')
    if (admin && req.sent_at) parts.add(admin.id)
    parts.delete(profile.id)
    for (const uid of parts) {
      await push({ userId: uid, kind: 'message', action: true,
        title: `Вопрос по заявке №${req.id}`, body, entity: 'request', entityId: req.id })
    }
    data.reload()
  }

  return (
    <div style={{ marginTop: 10, padding: compact ? '11px 12px' : '13px 14px', background: 'var(--bg)', borderRadius: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: msgs.length ? 11 : 9 }}>
        <span style={{ fontSize: 14 }}>💬</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Уточнение</span>
        {msgs.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>{msgs.length}</span>}
      </div>

      {msgs.map((m) => {
        const me = m.author_id === profile.id
        return (
          <div key={m.id} style={{ display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start', marginBottom: 9 }}>
            <div style={{ maxWidth: '84%' }}>
              <div style={{ fontSize: 9.5, color: 'var(--tx3)', marginBottom: 3, textAlign: me ? 'right' : 'left' }}>
                {m.author_name} · {new Date(m.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ padding: '9px 12px', borderRadius: me ? '13px 13px 4px 13px' : '13px 13px 13px 4px',
                background: me ? 'var(--ink-l)' : 'var(--sur)', border: me ? 'none' : '1px solid var(--brd)',
                fontSize: 12.5, lineHeight: 1.55 }}>{m.body}</div>
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 7, marginTop: msgs.length ? 4 : 0 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Написать…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          style={{ flex: 1, minWidth: 0, minHeight: 44, padding: '0 13px', border: '1.5px solid var(--brd)', borderRadius: 11, background: 'var(--sur)', fontSize: 12.5, color: 'var(--tx)' }} />
        <Btn size="sm" onClick={send} loading={busy} style={{ minHeight: 44, padding: '0 15px' }}>→</Btn>
      </div>
    </div>
  )
}
