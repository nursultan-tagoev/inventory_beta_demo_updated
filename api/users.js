// /api/users — управление учётками. Работает служебным ключом Supabase,
// поэтому живёт ТОЛЬКО на сервере: service_role обходит все RLS.
// Клиент присылает свой access_token, сервер проверяет, что это админ.
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOMAIN = '@inventory.kg'

const admin = () => createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

// Кириллица → латиница для логина
const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const translit = (s) => (s || '').toLowerCase().split('').map((c) => (MAP[c] !== undefined ? MAP[c] : c)).join('').replace(/[^a-z0-9]/g, '')

// Логин = первая буква имени + фамилия
export function loginFrom(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return translit(parts[0])
  const surname = translit(parts[0])
  const name = translit(parts[1])
  return (name.slice(0, 1) + surname)
}

// Пароль, который можно продиктовать по телефону: без похожих символов
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const tempPassword = (len = 10) => Array.from({ length: len }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

// Проверяем, что запрос пришёл от действующего админа
async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Нет токена' }
  const sb = admin()
  const { data: u, error } = await sb.auth.getUser(token)
  if (error || !u?.user) return { error: 'Сессия недействительна' }
  const { data: prof } = await sb.from('profiles').select('role, is_active').eq('id', u.user.id).single()
  if (!prof || prof.role !== 'admin' || prof.is_active === false) return { error: 'Недостаточно прав' }
  return { userId: u.user.id }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!URL || !SERVICE) return res.status(500).json({ error: 'Не задан SUPABASE_SERVICE_ROLE_KEY в переменных Vercel' })

  const gate = await requireAdmin(req)
  if (gate.error) return res.status(403).json({ error: gate.error })

  const sb = admin()
  const { action, payload = {} } = req.body || {}

  try {
    /* ── Создать учётку ── */
    if (action === 'create') {
      const fullName = (payload.full_name || '').trim()
      if (!fullName) return res.status(400).json({ error: 'Укажите ФИО' })
      // Роли, которые может назначить суперадмин. Своего клона не создаём.
      if (!['warehouse', 'manager', 'employee', 'director'].includes(payload.role)) {
        return res.status(400).json({ error: 'Недопустимая роль: ' + (payload.role || 'не выбрана') })
      }

      // Логин: если занят — добавляем цифру
      const base = payload.login ? translit(payload.login) : loginFrom(fullName)
      if (!base) return res.status(400).json({ error: 'Не удалось собрать логин из ФИО' })
      const { data: taken } = await sb.from('profiles').select('email')
      const busy = new Set((taken || []).map((p) => (p.email || '').toLowerCase()))
      let login = base, n = 1
      while (busy.has(login + DOMAIN)) { n += 1; login = base + n }
      const email = login + DOMAIN

      const password = payload.password || tempPassword()
      const { data: created, error: e1 } = await sb.auth.admin.createUser({
        email, password, email_confirm: true,   // почта служебная, подтверждать нечем
        user_metadata: { full_name: fullName },
      })
      if (e1) return res.status(400).json({ error: 'Учётка: ' + e1.message })

      // Профиль может создаваться триггером — поэтому обновляем, а не вставляем вслепую
      const row = {
        id: created.user.id, full_name: fullName, email,
        role: payload.role, branch_id: payload.branch_id || null,
        manager_id: payload.manager_id || null, position: payload.position || null,
        is_active: true, must_change_password: true,
      }
      const { error: e2 } = await sb.from('profiles').upsert(row, { onConflict: 'id' })
      if (e2) {
        await sb.auth.admin.deleteUser(created.user.id)   // не оставляем половинчатого пользователя
        return res.status(400).json({ error: 'Профиль: ' + e2.message })
      }
      return res.status(200).json({ login, email, password })
    }

    /* ── Сбросить пароль (почты нет — только так) ── */
    if (action === 'reset_password') {
      if (!payload.id) return res.status(400).json({ error: 'Не указан пользователь' })
      const password = tempPassword()
      const { error } = await sb.auth.admin.updateUserById(payload.id, { password })
      if (error) return res.status(400).json({ error: error.message })
      await sb.from('profiles').update({ must_change_password: true }).eq('id', payload.id)
      return res.status(200).json({ password })
    }

    /* ── Включить / отключить доступ ── */
    if (action === 'set_active') {
      if (!payload.id) return res.status(400).json({ error: 'Не указан пользователь' })
      if (payload.id === gate.userId && payload.is_active === false) {
        return res.status(400).json({ error: 'Нельзя отключить самого себя' })
      }
      const active = payload.is_active !== false
      const { error } = await sb.from('profiles').update({ is_active: active }).eq('id', payload.id)
      if (error) return res.status(400).json({ error: error.message })
      // Отключённый не должен войти даже с верным паролем
      await sb.auth.admin.updateUserById(payload.id, { ban_duration: active ? 'none' : '876000h' })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Неизвестное действие' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Ошибка сервера' })
  }
}
