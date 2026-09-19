import { useState, useEffect } from 'react'
import { queueCount, snapshotAge } from '../lib/offline'

/* Статус связи крупно, над блоком пользователя. Кладовщик должен видеть
   одним взглядом, работает он в сети или нет — от этого зависит,
   уйдёт ли операция сразу или ляжет в очередь. */

const fmtAge = (ms) => {
  if (ms == null) return null
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} дн назад`
}

export default function OfflineStatus({ compact }) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [count, setCount] = useState(0)
  const [age, setAge] = useState(null)

  useEffect(() => {
    const tick = async () => { setCount(await queueCount()); setAge(await snapshotAge()) }
    tick()
    const t = setInterval(tick, 20000)
    const up = () => { setOnline(true); tick() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const tone = !online
    ? { bg: 'var(--rd-l)', fg: 'var(--rd-m)', dot: 'var(--rd)', text: 'ВНЕ СЕТИ' }
    : count
      ? { bg: 'var(--am-l)', fg: 'var(--am-m)', dot: 'var(--am)', text: 'ОТПРАВКА' }
      : { bg: 'var(--gr-l)', fg: 'var(--gr-m)', dot: 'var(--gr)', text: 'В СЕТИ' }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: compact ? '7px 10px' : '9px 11px',
      borderRadius: 10, background: tone.bg, marginBottom: 8,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone.dot, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: tone.fg }}>
          {tone.text}
        </div>
        <div style={{ fontSize: 10.5, color: tone.fg, opacity: .85, marginTop: 1 }}>
          {!online && age != null
            ? `данные ${fmtAge(age)}`
            : count
              ? `${count} операц. в очереди`
              : 'всё отправлено'}
        </div>
      </div>
    </div>
  )
}
