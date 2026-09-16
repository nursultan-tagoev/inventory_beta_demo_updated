import { useEffect, useRef, useState } from 'react'
import { Btn } from './ui'

/* Сканер штрихкодов и QR камерой. Работает целиком в браузере —
   на складе связи нет, обращаться к серверу нельзя.

   Chrome на Android и на компьютере умеет распознавать сам, быстро.
   Safari на iPhone не умеет — там подключается библиотека. */

// Из ссылки достаём артикул: в наклейках код вида {адрес}/s/АРТИКУЛ
export function extractSku(raw) {
  const v = String(raw || '').trim()
  if (!v) return ''
  const m = v.match(/\/s\/([^/?#]+)/)
  if (m) { try { return decodeURIComponent(m[1]) } catch (e) { return m[1] } }
  return v
}

export default function Scanner({ onFound, onClose, title = 'Наведите на код' }) {
  const videoRef = useRef(null)
  const [error, setError] = useState(null)
  const [manual, setManual] = useState('')
  const [last, setLast] = useState(null)      // что поймали последним
  const [count, setCount] = useState(0)
  const stopRef = useRef(null)
  const seenRef = useRef({ code: null, at: 0 })

  /* Непрерывный режим: камера не закрывается после каждого кода.
     Один и тот же код игнорируем полторы секунды — иначе одна наклейка
     в кадре добавится двадцать раз. */
  const handle = (raw) => {
    const sku = extractSku(raw)
    if (!sku) return
    const now = Date.now()
    if (seenRef.current.code === sku && now - seenRef.current.at < 1500) return
    seenRef.current = { code: sku, at: now }
    setLast(sku)
    setCount((c) => c + 1)
    try { navigator.vibrate?.(40) } catch (e) {}
    onFound(sku)
  }

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },   // задняя камера
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        stopRef.current = () => stream.getTracks().forEach((t) => t.stop())

        // Встроенный распознаватель — быстрее и не грузит библиотеку
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector({
            formats: ['qr_code', 'code_128', 'ean_13', 'code_39'],
          })
          const tick = async () => {
            if (cancelled || !videoRef.current) return
            try {
              const found = await det.detect(videoRef.current)
              if (found?.length) handle(found[0].rawValue)
            } catch (e) { /* кадр не разобрался — пробуем следующий */ }
            setTimeout(tick, 250)
          }
          tick()
          return
        }

        // Safari на iPhone: подключаем библиотеку только здесь
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled) return
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoElement(videoRef.current, (res) => {
          if (res) handle(res.getText())
        })
        const stopStream = stopRef.current
        stopRef.current = () => { try { controls.stop() } catch (e) {} ; stopStream?.() }
      } catch (e) {
        if (cancelled) return
        setError(e.name === 'NotAllowedError'
          ? 'Доступ к камере запрещён. Разрешите его в настройках браузера и откройте сканер заново.'
          : e.name === 'NotFoundError'
            ? 'Камера не найдена'
            : 'Не удалось включить камеру: ' + e.message)
      }
    }

    start()
    return () => { cancelled = true; stopRef.current?.() }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{title}</span>
        {count > 0 && (
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,.18)' }}>
            найдено {count}
          </span>
        )}
        <button onClick={onClose} style={{ color: '#fff', fontSize: 22, padding: '2px 8px', lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

        {/* Рамка прицела: помогает поднести наклейку на нужное расстояние */}
        {!error && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 'min(76vw, 300px)', height: 'min(46vw, 180px)',
            border: '2px solid rgba(255,255,255,.85)', borderRadius: 14,
            boxShadow: '0 0 0 100vmax rgba(0,0,0,.45)',
          }} />
        )}

        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, background: '#000' }}>
            <div style={{ color: '#fff', textAlign: 'center', fontSize: 13.5, lineHeight: 1.6, maxWidth: 320 }}>{error}</div>
          </div>
        )}

        {last && (
          <div style={{
            position: 'absolute', left: 16, right: 16, bottom: 16,
            background: 'rgba(255,255,255,.95)', borderRadius: 12, padding: '11px 14px',
          }}>
            <div style={{ fontSize: 10.5, color: '#666' }}>последний код</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{last}</div>
          </div>
        )}
      </div>

      {/* Ручной ввод: наклейка мятая, камера не берёт — артикул напечатан текстом */}
      <div style={{ padding: 16, background: '#111', display: 'flex', gap: 8 }}>
        <input value={manual} onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) { handle(manual.trim()); setManual('') } }}
          placeholder="Ввести артикул вручную"
          style={{ flex: 1, minHeight: 46, padding: '0 13px', borderRadius: 11, border: '1px solid #333', background: '#1c1c1c', color: '#fff', fontSize: 14 }} />
        <Btn onClick={() => { if (manual.trim()) { handle(manual.trim()); setManual('') } }}
          style={{ minHeight: 46 }}>Найти</Btn>
      </div>
    </div>
  )
}
