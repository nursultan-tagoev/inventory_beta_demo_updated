import { supabase } from '../supabaseClient'

/* Выход по бездействию. Вкладка может стоять открытой сутками — на общем
   компьютере склада этого достаточно, чтобы чужой человек увидел остатки,
   суммы и фамилии.

   Работу на складе при этом не рвём: пока приложение открыто и человек
   что-то делает, отсчёт сбрасывается. */

const LIMIT = 8 * 60 * 60 * 1000       // восемь часов — рабочая смена
const WARN = 5 * 60 * 1000             // за пять минут предупреждаем
const KEY = 'sklad-last-seen'

const now = () => Date.now()
const read = () => Number(localStorage.getItem(KEY)) || 0
const touch = () => { try { localStorage.setItem(KEY, String(now())) } catch (e) {} }

export function idleLeft() {
  const last = read()
  if (!last) return LIMIT
  return Math.max(0, LIMIT - (now() - last))
}

/* Запускаем слежение. onWarn зовётся за пять минут до выхода,
   onExpire — когда время вышло. */
export function watchIdle({ onWarn, onExpire }) {
  touch()
  let warned = false

  const activity = () => {
    touch()
    warned = false
  }

  // Считаем активностью только осмысленные действия, не движение мыши:
  // иначе сессия не истечёт никогда
  const events = ['click', 'keydown', 'touchstart', 'visibilitychange']
  for (const e of events) window.addEventListener(e, activity, { passive: true })

  const timer = setInterval(() => {
    const left = idleLeft()
    if (left <= 0) { onExpire?.(); return }
    if (left <= WARN && !warned) { warned = true; onWarn?.(Math.ceil(left / 60000)) }
  }, 30000)

  return () => {
    clearInterval(timer)
    for (const e of events) window.removeEventListener(e, activity)
  }
}

export async function expireSession() {
  try { localStorage.removeItem(KEY) } catch (e) {}
  // Очередь и снимки не трогаем: человек вернётся и отправит накопленное
  try { await supabase.auth.signOut() } catch (e) {}
}

export const resetIdle = touch
