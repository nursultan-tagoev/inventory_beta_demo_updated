// /api/lucy — «мозг» Люси под капотом. Ключи берутся из переменных окружения Vercel.
// Основной провайдер — Gemini; при лимите/перегрузке тихо переключается на Groq.
// Клиент присылает { text, role, history } и получает { call, text }.

const TOOLS = [
  { name: 'create_operation', description: 'Оформить складскую операцию (in=приход, out=выдача, return=возврат, writeoff=списание). Только admin. Поддерживает несколько позиций.',
    parameters: { type: 'object', properties: {
      type: { type: 'string', enum: ['in', 'out', 'return', 'writeoff'] },
      items: { type: 'array', items: { type: 'object', properties: { product: { type: 'string' }, quantity: { type: 'integer' } }, required: ['product', 'quantity'] } },
      recipient: { type: 'string' }, branch: { type: 'string' }, purpose: { type: 'string' },
    }, required: ['type', 'items'] } },
  { name: 'get_stock', description: 'Остаток товара.', parameters: { type: 'object', properties: { product: { type: 'string' } }, required: ['product'] } },
  { name: 'list_inventory', description: 'Список остатков.', parameters: { type: 'object', properties: {} } },
  { name: 'list_overdue', description: 'Просроченные выдачи.', parameters: { type: 'object', properties: {} } },
  { name: 'open_screen', description: 'Открыть экран.', parameters: { type: 'object', properties: { screen: { type: 'string', enum: ['home', 'items', 'movements', 'recipients', 'reports'] } }, required: ['screen'] } },
]

function systemPrompt(role) {
  return `Ты — Люси: тёплая, обаятельная и слегка игривая помощница склада банка. Отвечай ТОЛЬКО по-русски, коротко, без смешения языков (латиница лишь в названиях, напр. UFC). Роль пользователя: ${role}.
Правила: приводи названия и имена в именительный падеж; для складских действий вызывай create_operation (несколько товаров — раздели в items); операции может оформлять ТОЛЬКО admin (иначе тепло откажи и предложи аналитику); если данных не хватает — задай ОДИН уточняющий вопрос; на общие вопросы отвечай верно, с искоркой, по-доброму намекая, что твоя стихия — склад и учёт. Без разметки и эмодзи.`
}

const OAI_TOOLS = TOOLS.map((t) => ({ type: 'function', function: t }))

async function callGemini(text, role, history) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('no-gemini-key')
  const contents = [...(history || []).map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })), { role: 'user', parts: [{ text }] }]
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt(role) }] }, contents, tools: [{ function_declarations: TOOLS }], generationConfig: { temperature: 0.5 } }) })
  const d = await r.json()
  if (d.error) { const e = new Error(d.error.message); e.code = d.error.code; throw e }
  const parts = d.candidates?.[0]?.content?.parts || []
  const fc = parts.find((p) => p.functionCall)?.functionCall
  return { call: fc ? { name: fc.name, args: fc.args } : null, text: parts.filter((p) => p.text).map((p) => p.text).join(' ').trim() }
}

async function callGroq(text, role, history) {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('no-groq-key')
  const messages = [{ role: 'system', content: systemPrompt(role) }, ...(history || []).map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: text }]
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, tools: OAI_TOOLS, tool_choice: 'auto', temperature: 0.5 }) })
  const d = await r.json()
  if (d.error) throw new Error(d.error.message || 'groq-error')
  const msg = d.choices?.[0]?.message
  const tc = msg?.tool_calls?.[0]
  return { call: tc ? { name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') } : null, text: msg?.content || '' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
  const { text, role = 'employee', history = [] } = req.body || {}
  if (!text) { res.status(400).json({ error: 'no text' }); return }
  try {
    const out = await callGemini(text, role, history)
    res.status(200).json({ ...out, provider: 'gemini' })
  } catch (e) {
    const transient = e.code === 429 || e.code === 503 || /quota|overload|unavailable/i.test(e.message || '')
    if ((transient || e.message === 'no-gemini-key') && process.env.GROQ_API_KEY) {
      try { const out = await callGroq(text, role, history); res.status(200).json({ ...out, provider: 'groq' }); return } catch (e2) {}
    }
    res.status(200).json({ call: null, text: '', error: e.message || 'ai-error' })
  }
}
