import { useState, useEffect, useCallback } from 'react'
import { Btn, useToast } from './ui'
import { queueCount, oldestAgeDays, snapshotAge, queueList } from '../lib/offline'
import { syncQueue } from '../lib/sync'

/* Состояние работы без связи: возраст данных, сколько операций ждёт отправки
   и предупреждение, если они висят слишком долго. */

const fmtAge = (ms) => {
  if (ms == null) return 'нет данных'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} дн назад`
}

export default function OfflineBar({ data }) {
  const toast = useToast()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [count, setCount] = useState(0)
  const [days, setDays] = useState(0)
  const [age, setAge] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])

  const refreshState = useCallback(async () => {
    setCount(await queueCount())
    setDays(await oldestAgeDays())
    setAge(await snapshotAge())
  }, [])

  useEffect(() => {
    refreshState()
    const t = setInterval(refreshState, 20000)
    const up = () => { setOnline(true); refreshState() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [refreshState])

  // Связь вернулась — очередь уходит сама, без нажатий
  useEffect(() => {
    if (!online || !count || busy) return
    const t = setTimeout(() => send(true), 1200)
    return () => clearTimeout(t)
  }, [online, count])

  const send = async (auto) => {
    setBusy(true)
    const { sent, failed, conflicts } = await syncQueue()
    setBusy(false)
    await refreshState()
    data?.invalidate?.(['movements', 'stock', 'products'])

    if (!sent && !failed) return
    if (conflicts.length) {
      toast(`Отправлено ${sent}, с расхождением ${conflicts.length} — проверьте остатки`, 'error')
    } else if (failed) {
      toast(`Отправлено ${sent}, не прошло ${failed}`, 'error')
    } else if (!auto || sent) {
      toast(`Отправлено операций: ${sent}`)
    }
  }

  const showBig = count > 0 && days >= 3
  if (!count && online) return null

  return (
    <>
      {/* Крупное предупреждение: остатки в системе всё это время неверные */}
      {showBig && (
        <div onClick={() => setOpen(true)} style={{
          margin: '0 0 12px', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
          background: 'var(--rd-l)', border: '1px solid var(--rd)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
            <span style={{ fontSize: 17 }}>⚠️</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--rd-m)' }}>
              {count} операций не отправлено, {days} дн
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.6 }}>
            Всё это время остатки в системе неверные — их видят и другие.
            Подойдите туда, где есть связь, и отправьте.
          </div>
        </div>
      )}

      {/* Обычная полоса */}
      {!showBig && (
        <div style={{
          margin: '0 0 12px', padding: '10px 14px', borderRadius: 11,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: online ? 'var(--am-l)' : 'var(--sur2)',
          border: `1px solid ${online ? 'var(--am)' : 'var(--brd)'}`,
        }}>
          <span style={{ fontSize: 15 }}>{online ? '↑' : '📴'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: online ? 'var(--am-m)' : 'var(--tx2)' }}>
              {online
                ? `${count} операц. ждёт отправки`
                : count ? `Без связи · ${count} операц. в очереди` : 'Работаем без связи'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 1 }}>
              данные обновлялись {fmtAge(age)}
            </div>
          </div>
          {count > 0 && (
            <button onClick={async () => { setItems(await queueList()); setOpen(true) }}
              style={{ fontSize: 11.5, color: 'var(--tx3)', minHeight: 34, padding: '0 8px' }}>что именно</button>
          )}
          {online && count > 0 && (
            <Btn size="sm" loading={busy} onClick={() => send(false)} style={{ minHeight: 36 }}>Отправить</Btn>
          )}
        </div>
      )}

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 16, overflow: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 420, padding: 20 }}>
            <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Ждут отправки</div>
            <div style={{ border: '1px solid var(--brd)', borderRadius: 11, maxHeight: 300, overflowY: 'auto', marginBottom: 14 }}>
              {items.map((r, i) => (
                <div key={r.id} style={{ padding: '9px 12px', borderTop: i ? '1px solid var(--brd)' : 'none' }}>
                  <div style={{ fontSize: 12.5 }}>{r.title || r.kind}</div>
                  <div style={{ fontSize: 10.5, color: r.error ? 'var(--rd-m)' : 'var(--tx3)', marginTop: 2 }}>
                    {new Date(r.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {r.error ? ' · ' + r.error : ''}
                  </div>
                </div>
              ))}
              {!items.length && <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>Очередь пуста</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {online && <Btn loading={busy} onClick={async () => { await send(false); setItems(await queueList()) }} style={{ flex: 1, minHeight: 46 }}>Отправить</Btn>}
              <Btn v="secondary" onClick={() => setOpen(false)} style={{ minHeight: 46 }}>Закрыть</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
