import { useState, useEffect } from 'react'

const KEY = 'install_dismissed_v1'

/* Определяем, стоит ли вообще предлагать установку */
export function useInstall() {
  const [evt, setEvt] = useState(null)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const installed = typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)

  useEffect(() => {
    // Android и десктопный Chrome дают штатное окно установки
    const onPrompt = (e) => { e.preventDefault(); setEvt(e) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    const onInstalled = () => { setEvt(null); hide() }
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const hide = () => {
    setDismissed(true)
    try { localStorage.setItem(KEY, '1') } catch {}
  }

  const install = async () => {
    if (!evt) return false
    evt.prompt()
    const res = await evt.userChoice
    setEvt(null)
    if (res?.outcome === 'accepted') hide()
    return res?.outcome === 'accepted'
  }

  // На iPhone штатного окна нет — показываем инструкцию
  const canOffer = isMobile && !installed && !dismissed && (!!evt || isIOS)

  return { canOffer, isIOS, install, hide, installed, isMobile }
}

/* Плашка внизу экрана — появляется один раз, закрывается насовсем */
export default function InstallPrompt() {
  const { canOffer, isIOS, install, hide } = useInstall()
  const [steps, setSteps] = useState(false)
  if (!canOffer) return null

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 74px)',
      zIndex: 1200, borderRadius: 14, padding: 14, background: 'var(--sur)',
      border: '1px solid var(--brd)', boxShadow: '0 12px 34px rgba(0,0,0,.22)', animation: 'fadeUp .25s ease',
    }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--ink-l)', display: 'grid', placeItems: 'center', fontSize: 19, flexShrink: 0 }}>📦</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ff" style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 3 }}>Установить приложение</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.5 }}>
            Открывается с рабочего стола, работает быстрее и без адресной строки.
          </div>
        </div>
        <button onClick={hide} style={{ color: 'var(--tx3)', fontSize: 17, padding: 2, lineHeight: 1 }}>×</button>
      </div>

      {steps && isIOS && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, fontSize: 12, color: 'var(--tx2)', lineHeight: 1.65 }}>
          1. Нажмите <b>Поделиться</b> внизу Safari<br />
          2. Выберите <b>«На экран “Домой”»</b><br />
          3. Нажмите <b>Добавить</b>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
        <button onClick={() => (isIOS ? setSteps(!steps) : install())}
          style={{ flex: 1, minHeight: 44, borderRadius: 11, background: 'var(--ink)', color: '#fff', fontSize: 13.5, fontWeight: 600 }}>
          {isIOS ? (steps ? 'Понятно' : 'Как установить') : 'Установить'}
        </button>
        <button onClick={hide} style={{ minHeight: 44, padding: '0 14px', borderRadius: 11, background: 'var(--sur2)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>Позже</button>
      </div>
    </div>
  )
}

/* Карточка на Главной — для тех, кто закрыл плашку или зашёл позже */
export function InstallCard() {
  const { isIOS, install, installed, isMobile } = useInstall()
  const [steps, setSteps] = useState(false)
  if (!isMobile || installed) return null

  return (
    <div className="card" style={{ padding: 15, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--ink-l)', display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0 }}>📦</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ff" style={{ fontSize: 15, fontWeight: 600 }}>Приложение на телефон</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>Иконка на рабочем столе, запуск без браузера</div>
        </div>
        <button onClick={() => (isIOS ? setSteps(!steps) : install())}
          style={{ minHeight: 42, padding: '0 15px', borderRadius: 11, background: 'var(--ink)', color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {isIOS ? 'Как' : 'Установить'}
        </button>
      </div>
      {steps && isIOS && (
        <div style={{ marginTop: 11, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, fontSize: 12, color: 'var(--tx2)', lineHeight: 1.65 }}>
          1. Нажмите <b>Поделиться</b> внизу Safari<br />
          2. Выберите <b>«На экран “Домой”»</b><br />
          3. Нажмите <b>Добавить</b>
        </div>
      )}
    </div>
  )
}
