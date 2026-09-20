import { useState, useEffect } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { Btn } from './ui'

/* Обновление установленного приложения. Раньше оно держало старую сборку,
   пока человек не удалит иконку и не поставит заново — новая версия
   ждала закрытия всех вкладок, а их никто не закрывал. */

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null

export const buildLabel = () => {
  if (!BUILD_TIME) return APP_VERSION
  const d = new Date(BUILD_TIME)
  return `${APP_VERSION} · ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

/* Проверка вручную: спрашиваем у сервера, есть ли новая сборка, и говорим
   словами, что нашли. Раньше кнопка просто перезагружала страницу,
   и человек не понимал, обновился он или и так был на свежей. */
export async function checkForUpdate() {
  if (!navigator.serviceWorker) return { error: 'Обновления доступны только в установленном приложении' }
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return { error: 'Приложение не установлено — обновите страницу обычным способом' }

    await reg.update()
    // Новая сборка появляется как ожидающая или устанавливающаяся
    const pending = reg.waiting || reg.installing
    return pending ? { found: true } : { found: false }
  } catch (e) {
    return { error: 'Не удалось проверить: ' + e.message }
  }
}

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [update, setUpdate] = useState(null)

  useEffect(() => {
    const fn = registerSW({
      immediate: true,
      onNeedRefresh() { setUpdate(() => fn); setReady(true) },
      onRegisteredSW(_url, reg) {
        // Проверяем раз в полчаса: человек может не перезагружать страницу сутками
        if (reg) setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)
      },
    })
  }, [])

  if (!ready) return null

  return (
    <div style={{
      position: 'fixed', left: 16, right: 16, zIndex: 1600,
      bottom: 'calc(16px + env(safe-area-inset-bottom, 0px) + 60px)',
      maxWidth: 420, margin: '0 auto',
      background: 'var(--sur)', border: '1px solid var(--ink)', borderRadius: 14,
      boxShadow: 'var(--sh3)', padding: '13px 15px',
      display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 17 }}>↑</span>
      <div style={{ flex: 1, minWidth: 130 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Вышло обновление</div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1 }}>
          Приложение перезапустится, несохранённое не потеряется
        </div>
      </div>
      <Btn size="sm" loading={busy} onClick={() => { setBusy(true); update?.(true) }} style={{ minHeight: 38 }}>
        Обновить
      </Btn>
      <button onClick={() => setReady(false)} style={{ fontSize: 11.5, color: 'var(--tx3)', minHeight: 36, padding: '0 6px' }}>
        позже
      </button>
    </div>
  )
}
