import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { Spin } from '../components/ui'

/* Журнал действий. Раньше писался в базу, но посмотреть его можно было
   только запросом — теперь есть экран. Доступен только суперадмину:
   здесь видно, кто что делал, включая удаления. */

// Человеческие названия вместо служебных кодов
const ACTIONS = {
  inventory_start: ['Начата сверка', '📋', 'var(--bl-l, var(--sur2))'],
  inventory_compare: ['Сверка сравнена', '📋', 'var(--sur2)'],
  inventory_apply: ['Проведена корректировка', '📋', 'var(--am-l)'],
  defect_writeoff: ['Списан брак', '⚠️', 'var(--rd-l)'],
  movement_cancel: ['Отменено движение', '↩', 'var(--am-l)'],
  movement_restore: ['Восстановлено движение', '↪', 'var(--gr-l)'],
  movement_delete: ['Удалено движение', '🗑', 'var(--rd-l)'],
  act_delete: ['Удалён акт', '🗑', 'var(--rd-l)'],
  issue_basket: ['Выдача набором', '📤', 'var(--ink-l)'],
  cancel_requested: ['Запрошена отмена', '⏸', 'var(--am-l)'],
  cancel_confirmed: ['Отмена подтверждена', '✕', 'var(--rd-l)'],
  cancel_declined: ['Отмена отклонена', '✓', 'var(--gr-l)'],
}
const label = (a) => ACTIONS[a]?.[0] || a
const icon = (a) => ACTIONS[a]?.[1] || '•'
const tone = (a) => ACTIONS[a]?.[2] || 'var(--sur2)'

const DAY = 86400000
const PERIODS = [['7', 'Неделя'], ['30', 'Месяц'], ['90', 'Квартал'], ['all', 'Всё']]

export default function Audit({ profile }) {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [days, setDays] = useState('30')
  const [kind, setKind] = useState('all')

  useEffect(() => {
    let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500)
    if (days !== 'all') query = query.gte('created_at', new Date(Date.now() - Number(days) * DAY).toISOString())
    query.then(({ data }) => setRows(data || []))
  }, [days])

  // Показываем только те виды действий, что реально встречались
  const kinds = useMemo(() => {
    const set = new Set((rows || []).map((r) => r.action))
    return [...set].sort()
  }, [rows])

  const list = useMemo(() => (rows || []).filter((r) => {
    if (kind !== 'all' && r.action !== kind) return false
    if (!q) return true
    const s = `${r.actor_name || ''} ${label(r.action)} ${r.entity_ref || ''} ${r.details || ''}`.toLowerCase()
    return s.includes(q.toLowerCase())
  }), [rows, kind, q])

  // Группировка по дням: так журнал читается, а не листается
  const byDay = useMemo(() => {
    const g = {}
    for (const r of list) {
      const d = new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      ;(g[d] || (g[d] = [])).push(r)
    }
    return Object.entries(g)
  }, [list])

  if (profile?.role !== 'admin') return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '60px 20px', textAlign: 'center', color: 'var(--tx3)' }}>
      Журнал действий доступен только суперадминистратору.
    </div>
  )

  const inp = {
    minHeight: 38, padding: '0 12px', borderRadius: 9,
    border: '1.5px solid var(--brd)', background: 'var(--sur)', fontSize: 13, color: 'var(--tx)',
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px', animation: 'fadeUp .3s ease' }}>
      <div className="head-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 21, fontWeight: 600 }}>Журнал действий</span>
        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'var(--sur2)', color: 'var(--tx3)' }}>
          {list.length} записей
        </span>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по имени, документу, причине"
        style={{ ...inp, width: '100%', minHeight: 42, marginBottom: 10 }} />

      <div className="scroll-x" style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {PERIODS.map(([v, l]) => (
          <button key={v} onClick={() => setDays(v)}
            style={{ padding: '7px 14px', minHeight: 38, borderRadius: 9, fontSize: 12.5, whiteSpace: 'nowrap',
              border: `1px solid ${days === v ? 'var(--ink)' : 'var(--brd)'}`,
              background: days === v ? 'var(--ink-l)' : 'var(--sur)',
              color: days === v ? 'var(--ink)' : 'var(--tx2)', fontWeight: days === v ? 600 : 400 }}>{l}</button>
        ))}
      </div>

      {kinds.length > 1 && (
        <div className="scroll-x" style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={() => setKind('all')}
            style={{ padding: '6px 12px', minHeight: 36, borderRadius: 9, fontSize: 12, whiteSpace: 'nowrap',
              border: `1px solid ${kind === 'all' ? 'var(--ink)' : 'var(--brd)'}`,
              background: kind === 'all' ? 'var(--ink-l)' : 'var(--sur)',
              color: kind === 'all' ? 'var(--ink)' : 'var(--tx3)' }}>Все</button>
          {kinds.map((k) => (
            <button key={k} onClick={() => setKind(k)}
              style={{ padding: '6px 12px', minHeight: 36, borderRadius: 9, fontSize: 12, whiteSpace: 'nowrap',
                border: `1px solid ${kind === k ? 'var(--ink)' : 'var(--brd)'}`,
                background: kind === k ? 'var(--ink-l)' : 'var(--sur)',
                color: kind === k ? 'var(--ink)' : 'var(--tx3)' }}>{label(k)}</button>
          ))}
        </div>
      )}

      {rows === null && <div style={{ padding: 50, display: 'grid', placeItems: 'center' }}><Spin s={24} /></div>}

      {rows !== null && list.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 9 }}>📜</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Записей нет</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
            {q || kind !== 'all' ? 'Попробуйте изменить фильтры' : 'Здесь появятся отмены, удаления и корректировки'}
          </div>
        </div>
      )}

      {byDay.map(([day, items]) => (
        <div key={day} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 7, paddingLeft: 2 }}>{day}</div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {items.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 14px', borderTop: i ? '1px solid var(--brd)' : 'none' }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: tone(r.action), display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0 }}>
                  {icon(r.action)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{label(r.action)}</span>
                    {r.entity_ref && <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)' }}>{r.entity_ref}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
                    {(r.actor_name || '').replace(/@.*$/, '') || 'система'}
                    {r.details ? ' · ' + r.details : ''}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
                  {new Date(r.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
