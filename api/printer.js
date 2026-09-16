import { createClient } from '@supabase/supabase-js'
import net from 'node:net'

/* Печать на сетевой термопринтер. Браузер не умеет открывать соединение
   с устройством в локальной сети, поэтому команды уходят отсюда.

   Язык TSPL — его понимают Xprinter, Godex и совместимые.
   У Zebra свой ZPL: если купите её, добавим второй диалект. */

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = () => createClient(URL, SERVICE, { auth: { persistSession: false } })

async function requireWarehouse(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Нет токена' }
  const sb = admin()

  // Токен проверяем прямым запросом: библиотека на сервере смотрит
  // на локальную сессию, которой здесь нет
  const r = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return { error: `Сессия недействительна (${r.status})` }
  const u = await r.json()
  if (!u?.id) return { error: 'Сессия недействительна' }

  const { data: prof } = await sb.from('profiles').select('role, is_active').eq('id', u.id).single()
  if (!prof || prof.is_active === false || !['admin', 'warehouse'].includes(prof.role)) {
    return { error: 'Недостаточно прав' }
  }
  return { sb, userId: u.id, role: prof.role }
}

/* Отправка на принтер. Таймаут обязателен: если устройство выключено,
   соединение висит минутами и запрос не возвращается. */
function send(host, port, data, timeout = 6000) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (error) => {
      if (done) return
      done = true
      try { socket.destroy() } catch (e) {}
      resolve({ error })
    }
    socket.setTimeout(timeout)
    socket.on('timeout', () => finish('Принтер не отвечает — проверьте адрес и питание'))
    socket.on('error', (e) => finish(
      e.code === 'ECONNREFUSED' ? 'Принтер отклонил соединение — проверьте порт'
        : e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH' ? 'Принтер недоступен в сети'
        : e.message))
    socket.connect(port, host, () => {
      socket.write(data, 'binary', () => setTimeout(() => finish(null), 250))
    })
  })
}

// Экранируем кавычки: они ограничивают текст в командах TSPL
const esc = (s) => String(s || '').replace(/"/g, "'")

/* Команды наклейки. Размер в миллиметрах, координаты — в точках
   при 203 dpi: это 8 точек на миллиметр. */
function tspl({ w, h, name, attrs, sku, copies = 1 }) {
  const D = 8
  const mm = (v) => Math.round(v * D)
  const both = w >= 40

  const lines = [
    `SIZE ${w} mm,${h} mm`,
    'GAP 2 mm,0 mm',
    'DIRECTION 1',
    'CLS',
    `TEXT ${mm(2)},${mm(2)},"2",0,1,1,"${esc(name).slice(0, 26)}"`,
  ]
  if (attrs) lines.push(`TEXT ${mm(2)},${mm(5.5)},"1",0,1,1,"${esc(attrs).slice(0, 30)}"`)

  const codeY = mm(h - 13)
  // Штрихкод слева, QR справа — на узкой наклейке только штрихкод
  lines.push(`BARCODE ${mm(2)},${codeY},"128",${mm(7)},0,0,2,4,"${esc(sku)}"`)
  if (both) lines.push(`QRCODE ${mm(w - 14)},${codeY},M,4,A,0,"${esc(sku)}"`)
  lines.push(`TEXT ${mm(2)},${mm(h - 4)},"1",0,1,1,"${esc(sku)}"`)
  lines.push(`PRINT ${copies},1`)

  return lines.join('\r\n') + '\r\n'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!URL || !SERVICE) return res.status(500).json({ error: 'Не задан SUPABASE_SERVICE_ROLE_KEY' })

  const gate = await requireWarehouse(req)
  if (gate.error) return res.status(403).json({ error: gate.error })
  const { sb } = gate

  const { action, payload = {} } = req.body || {}
  if (!payload.id) return res.status(400).json({ error: 'Не указан принтер' })

  const { data: p } = await sb.from('integrations').select('*').eq('id', payload.id).single()
  if (!p || p.kind !== 'printer') return res.status(400).json({ error: 'Принтер не найден' })
  if (!p.host) return res.status(400).json({ error: 'У принтера не указан адрес' })

  const note = async (error) => {
    await sb.from('integrations').update({
      last_ok_at: error ? p.last_ok_at : new Date().toISOString(),
      last_error: error || null,
    }).eq('id', p.id)
  }

  const [w, h] = String(p.label_size || '40x30').split('x').map(Number)

  if (action === 'ping') {
    // Пустая команда: принтер должен принять соединение
    const { error } = await send(p.host, p.port || 9100, 'CLS\r\n')
    await note(error)
    return error ? res.status(400).json({ error }) : res.status(200).json({ ok: true })
  }

  if (action === 'test') {
    const data = tspl({ w, h, name: 'Пробная наклейка', attrs: p.name, sku: 'TEST-0001', copies: 1 })
    const { error } = await send(p.host, p.port || 9100, data)
    await note(error)
    return error ? res.status(400).json({ error }) : res.status(200).json({ ok: true })
  }

  if (action === 'print') {
    const labels = Array.isArray(payload.labels) ? payload.labels : []
    if (!labels.length) return res.status(400).json({ error: 'Нечего печатать' })

    const data = labels
      .map((l) => tspl({ w, h, name: l.name, attrs: l.attrs, sku: l.sku, copies: l.copies || 1 }))
      .join('')
    const { error } = await send(p.host, p.port || 9100, data, 15000)
    await note(error)
    return error ? res.status(400).json({ error }) : res.status(200).json({ ok: true, count: labels.length })
  }

  return res.status(400).json({ error: 'Неизвестное действие' })
}
