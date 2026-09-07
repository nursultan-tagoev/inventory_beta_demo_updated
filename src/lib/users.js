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
  let d = {}, raw = ''
  try { raw = await res.text(); d = raw ? JSON.parse(raw) : {} } catch (e) { d = {} }
  if (!res.ok) {
    // Сервер мог ответить не JSON — тогда показываем то, что реально пришло
    const msg = typeof d?.error === 'string' ? d.error
      : (raw && raw.slice(0, 200)) || `Сервер ответил ${res.status}`
    return { error: msg }
  }
  return { data: d }
}

export const createUser = (payload) => call('create', payload)
export const resetPassword = (id) => call('reset_password', { id })
export const setActive = (id, is_active) => call('set_active', { id, is_active })

// Смену собственного пароля делает сам пользователь — служебный ключ тут не нужен
// Ошибки Supabase приходят на английском — переводим на человеческий
const RU = (m = '') => {
  const t = m.toLowerCase()
  if (t.includes('should be different')) return 'Новый пароль должен отличаться от временного'
  if (t.includes('at least') || t.includes('too short')) return 'Пароль слишком короткий'
  if (t.includes('weak') || t.includes('pwned')) return 'Пароль слишком простой — добавьте цифры или буквы'
  if (t.includes('session') || t.includes('jwt') || t.includes('expired')) return 'Сессия истекла — войдите заново'
  if (t.includes('failed to fetch') || t.includes('network')) return 'Нет связи с сервером — проверьте интернет'
  return m || 'Не удалось сменить пароль'
}

export async function changeOwnPassword(newPass) {
  if (!newPass || newPass.length < 8) return { error: 'Пароль не короче 8 символов' }

  const { data: u0 } = await supabase.auth.getUser()
  const uid = u0?.user?.id
  if (!uid) return { error: 'Сессия истекла — войдите заново' }

  const { error } = await supabase.auth.updateUser({ password: newPass })
  if (error) return { error: RU(error.message) }

  /* Флаг снимаем с проверкой результата. Раньше запись не проверялась:
     если она не проходила, экран закрывался, а при следующем входе
     смену пароля просили снова. Плюс updateUser обновляет токен,
     и первая попытка может уйти со старым — поэтому повторяем. */
  for (let i = 0; i < 3; i++) {
    const { data, error: e2 } = await supabase.from('profiles')
      .update({ must_change_password: false })
      .eq('id', uid).select('must_change_password').maybeSingle()
    if (!e2 && data && data.must_change_password === false) return { error: null }
    await new Promise((r) => setTimeout(r, 450))
  }
  return { error: 'Пароль изменён, но отметка не сохранилась. Войдите заново — если экран повторится, обратитесь к администратору.' }
}
