import { useState, useEffect, useRef } from 'react'
import { tourFor } from '../lib/tours'

/* Обучающий тур: переводит по реальным экранам и подсвечивает то, о чём говорит.
   Элемент ищется по data-tour; если не нашёлся — шаг показывается по центру. */
export default function Tour({ role, setView, onClose, onFinish }) {
  const tour = tourFor(role)
  const [i, setI] = useState(0)
  const [box, setBox] = useState(null)
  const step = tour.steps[i]
  const last = i === tour.steps.length - 1
  const timer = useRef(null)

  // Переводим на нужный экран заранее, чтобы якорь успел появиться
  useEffect(() => {
    if (step?.view) setView(step.view)
  }, [i])

  // Ищем якорь: элемент может отрисоваться не сразу
  useEffect(() => {
    clearInterval(timer.current)
    if (!step?.sel) { setBox(null); return }
    let tries = 0
    const find = () => {
      const el = document.querySelector(step.sel)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width || r.height) {
          setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          clearInterval(timer.current)
          return
        }
      }
      if (++tries > 12) { setBox(null); clearInterval(timer.current) }
    }
    find()
    timer.current = setInterval(find, 120)
    return () => clearInterval(timer.current)
  }, [i])

  // Пересчёт при прокрутке и повороте экрана
  useEffect(() => {
    const recalc = () => {
      if (!step?.sel) return
      const el = document.querySelector(step.sel)
      if (!el) return
      const r = el.getBoundingClientRect()
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener('resize', recalc)
    window.addEventListener('scroll', recalc, true)
    return () => { window.removeEventListener('resize', recalc); window.removeEventListener('scroll', recalc, true) }
  }, [i])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const next = () => (last ? onFinish() : setI((v) => v + 1))

  const PAD = 6
  const hole = box && {
    top: box.top - PAD, left: box.left - PAD,
    width: box.width + PAD * 2, height: box.height + PAD * 2,
  }

  // Карточку ставим под подсветкой, а если места нет — над ней
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const below = hole ? hole.top + hole.height + 14 : 0
  const cardTop = !hole ? null : below + 200 < vh ? below : Math.max(12, hole.top - 210)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }}>
      {/* Затемнение с окном для подсвеченного элемента */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(24,20,16,.62)',
        ...(hole ? {
          clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0,
            ${hole.left}px ${hole.top}px,
            ${hole.left}px ${hole.top + hole.height}px,
            ${hole.left + hole.width}px ${hole.top + hole.height}px,
            ${hole.left + hole.width}px ${hole.top}px,
            ${hole.left}px ${hole.top}px)`,
        } : {}),
      }} />

      {hole && (
        <div style={{
          position: 'absolute', top: hole.top, left: hole.left, width: hole.width, height: hole.height,
          border: '2.5px solid var(--ink)', borderRadius: 12, pointerEvents: 'none',
          boxShadow: '0 0 0 4px rgba(255,255,255,.25)', transition: 'all .25s ease',
        }} />
      )}

      <div className="card" style={{
        position: 'absolute', width: 'min(380px, calc(100vw - 32px))', padding: 20,
        ...(cardTop !== null
          ? { top: cardTop, left: Math.min(Math.max(12, (hole?.left || 0)), (typeof window !== 'undefined' ? window.innerWidth : 400) - 392) }
          : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }),
        boxShadow: '0 18px 50px rgba(0,0,0,.28)', animation: 'fadeUp .22s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="mono" style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, background: 'var(--ink-l)', color: 'var(--ink)', fontWeight: 700 }}>
            {i + 1} из {tour.steps.length}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{tour.title}</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: 'var(--tx3)', fontSize: 17, padding: 4, lineHeight: 1 }}>×</button>
        </div>

        <div className="ff" style={{ fontSize: 16.5, fontWeight: 600, marginBottom: 7 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.62, marginBottom: 16 }}>{step.body}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && (
            <button onClick={() => setI(i - 1)}
              style={{ padding: '10px 14px', minHeight: 42, borderRadius: 10, background: 'var(--sur2)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>Назад</button>
          )}
          <button onClick={next}
            style={{ flex: 1, padding: '10px 16px', minHeight: 42, borderRadius: 10, background: 'var(--ink)', color: '#fff', fontSize: 13.5, fontWeight: 600 }}>
            {last ? 'Понятно, начать работу' : 'Дальше'}
          </button>
          {!last && (
            <button onClick={onFinish}
              style={{ padding: '10px 12px', minHeight: 42, color: 'var(--tx3)', fontSize: 12 }}>Пропустить</button>
          )}
        </div>
      </div>
    </div>
  )
}
