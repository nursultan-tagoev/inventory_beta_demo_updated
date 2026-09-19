import { supabase } from '../supabaseClient'

/* Пачка номеров актов на устройство. Без связи акт должен получить номер
   сразу — кладовщик печатает его на месте, а не поднимается наверх.

   Пропуски в нумерации допустимы: устройство берёт номера заранее,
   и часть может остаться неиспользованной. Мы это обсуждали — для
   бухгалтерии пропуск не проблема, а двух актов с одним номером быть не должно. */

const DEVICE_KEY = 'sklad-device-id'
const POOL_KEY = 'sklad-act-pool'
const WANT = 30          // на смену с запасом
const LOW = 10           // ниже этого — пополняем

export function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

const readPool = () => {
  try { return JSON.parse(localStorage.getItem(POOL_KEY) || '{}') } catch (e) { return {} }
}
const writePool = (p) => {
  try { localStorage.setItem(POOL_KEY, JSON.stringify(p)) } catch (e) {}
}

export const poolCount = (prefix = 'АВ') => (readPool()[prefix] || []).length

/* Пополняем при каждом заходе со связью. Молча: если не вышло,
   значит номера возьмутся с сервера, как раньше. */
export async function topUpPool(prefix = 'АВ') {
  if (!navigator.onLine) return 0
  const pool = readPool()
  const have = (pool[prefix] || []).length
  if (have >= LOW) return have

  const { data, error } = await supabase.rpc('reserve_act_numbers', {
    p_prefix: prefix, p_device: deviceId(), p_count: WANT - have,
  })
  if (error || !data) return have

  const list = Array.isArray(data) ? data.map((x) => (typeof x === 'string' ? x : x.reserve_act_numbers)) : []
  pool[prefix] = [...(pool[prefix] || []), ...list.filter(Boolean)]
  writePool(pool)
  return pool[prefix].length
}

/* Берём номер из пачки. Возвращаем null, если пусто — тогда
   акт оформляется без номера и получает его при синхронизации. */
export function takeNumber(prefix = 'АВ') {
  const pool = readPool()
  const list = pool[prefix] || []
  if (!list.length) return null
  const n = list.shift()
  pool[prefix] = list
  writePool(pool)
  return n
}

// Вернуть номер в пачку, если акт так и не создался
export function returnNumber(prefix, number) {
  if (!number) return
  const pool = readPool()
  pool[prefix] = [number, ...(pool[prefix] || [])]
  writePool(pool)
}

export async function markUsed(number) {
  if (!number || !navigator.onLine) return
  try { await supabase.from('act_number_pool').update({ used_at: new Date().toISOString() }).eq('number', number) } catch (e) {}
}
