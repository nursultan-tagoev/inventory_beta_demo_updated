// Пингер против засыпания. Vercel дёргает его по расписанию раз в сутки —
// любое обращение к базе сбрасывает недельный таймер бесплатного тарифа.
// Отдельная учётка не нужна, достаточно самого запроса.

export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    return res.status(500).json({ ok: false, error: 'Не заданы адрес или ключ Supabase' })
  }

  try {
    // Самый лёгкий запрос: одна строка из справочника складов
    const r = await fetch(`${url}/rest/v1/warehouses?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    return res.status(200).json({
      ok: r.ok,
      status: r.status,
      at: new Date().toISOString(),
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}
