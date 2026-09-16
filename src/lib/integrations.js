import { supabase } from '../supabaseClient'

/* Подключения устройств. Сейчас принтеры и камера, но тип — просто поле,
   поэтому весы или обмен с бухгалтерией добавятся без перестройки раздела. */

export async function listIntegrations() {
  const { data } = await supabase.from('integrations').select('*').order('kind').order('name')
  return data || []
}

export async function saveIntegration(row) {
  const patch = {
    kind: row.kind, name: (row.name || '').trim(),
    is_active: row.is_active !== false,
    warehouse_id: row.warehouse_id ? Number(row.warehouse_id) : null,
    host: row.host?.trim() || null,
    port: Number(row.port) || 9100,
    label_size: row.label_size || '40x30',
  }
  if (!patch.name) return { error: 'Введите название' }
  if (patch.kind === 'printer' && !patch.host) return { error: 'Укажите адрес принтера' }

  const q = row.id
    ? supabase.from('integrations').update(patch).eq('id', row.id)
    : supabase.from('integrations').insert(patch)
  const { error } = await q
  return { error: error ? error.message : null }
}

export async function deleteIntegration(id) {
  const { error } = await supabase.from('integrations').delete().eq('id', id)
  return { error: error ? error.message : null }
}

export async function setActive(id, is_active) {
  const { error } = await supabase.from('integrations').update({ is_active }).eq('id', id)
  return { error: error ? error.message : null }
}

/* Принтер для склада: сначала привязанный к нему, иначе любой общий */
export function printerFor(list, warehouseId) {
  const active = (list || []).filter((x) => x.kind === 'printer' && x.is_active)
  return active.find((x) => x.warehouse_id === Number(warehouseId))
    || active.find((x) => !x.warehouse_id)
    || null
}

export const cameraOn = (list) => {
  const c = (list || []).find((x) => x.kind === 'camera')
  return !c || c.is_active   // записи нет — считаем включённой
}

/* ── Печать на сетевой принтер ──
   Браузер не умеет открывать сетевое соединение напрямую, поэтому
   команды уходят через серверный обработчик. Он же и проверяет связь. */
export async function printerRequest(action, payload) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { error: 'Сессия истекла — войдите заново' }

  let res
  try {
    res = await fetch('/api/printer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action, payload }),
    })
  } catch (e) { return { error: 'Сервер недоступен' } }

  let raw = '', d = {}
  try { raw = await res.text(); d = raw ? JSON.parse(raw) : {} } catch (e) { d = {} }
  if (!res.ok) return { error: typeof d?.error === 'string' ? d.error : (raw.slice(0, 160) || `Ошибка ${res.status}`) }
  return { data: d }
}

export const testPrinter = (id) => printerRequest('test', { id })
export const pingPrinter = (id) => printerRequest('ping', { id })
export const printLabels = (id, labels) => printerRequest('print', { id, labels })
