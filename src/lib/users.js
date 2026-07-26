import { supabase } from '../supabaseClient'

// Логин собирается так же, как на сервере — чтобы показать его до создания
const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const translit = (s) => (s || '').toLowerCase().split('').map((c) => (MAP[c] !== undefined ? MAP[c] : c)).join('').replace(/[^a-z0-9]/g, '')

export function loginPreview(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return translit(parts[0])
  return translit(parts[1]).slice(0, 1) + translit(parts[0])
}

async function call(action, payload) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { error: 'Сессия истекла — войдите заново' }
  let res
  try {
    res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action, payload }),
    })
  } catch (e) { return { error: 'Сервер недоступен' } }
  let d = {}
  try { d = await res.json() } catch (e) {}
  if (!res.ok) return { error: d.error || 'Ошибка ' + res.status }
  return { data: d }
}

export const createUser = (payload) => call('create', payload)
export const resetPassword = (id) => call('reset_password', { id })
export const setActive = (id, is_active) => call('set_active', { id, is_active })

// Смену собственного пароля делает сам пользователь — служебный ключ тут не нужен
export async function changeOwnPassword(newPass) {
  if (!newPass || newPass.length < 8) return { error: 'Пароль не короче 8 символов' }
  const { error } = await supabase.auth.updateUser({ password: newPass })
  if (error) return { error: error.message }
  const { data: u } = await supabase.auth.getUser()
  if (u?.user) await supabase.from('profiles').update({ must_change_password: false }).eq('id', u.user.id)
  return { error: null }
}
