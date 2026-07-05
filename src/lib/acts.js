import { supabase } from '../supabaseClient'

function dataURLtoBlob(dataURL) {
  const [head, b64] = dataURL.split(',')
  const mime = /:(.*?);/.exec(head)[1]; const bin = atob(b64)
  const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export async function nextActNumber(prefix) {
  const { data, error } = await supabase.rpc('next_act_number', { p_prefix: prefix })
  if (error) throw new Error('Нумерация: ' + error.message)
  return data
}

async function upload(path, fileOrBlob) {
  const { error } = await supabase.storage.from('acts').upload(path, fileOrBlob, { upsert: true })
  if (error) throw new Error('Загрузка файла: ' + error.message)
  return path
}

// act: поля таблицы acts (кроме number/status/путей); items: [{product_id?,name,sku?,inv?,unit?,qty,price?,condition?}]
export async function createAct({ act, items, sigGiver, sigRecipient, scanFile }) {
  const prefix = act.type === 'return' ? 'АЗ' : 'АВ'
  const number = await nextActNumber(prefix)
  const base = number.replace(/[\/\\]/g, '-')
  let sig_giver_path = null, sig_recipient_path = null, scan_path = null
  if (sigGiver) sig_giver_path = await upload(`${base}/giver.png`, dataURLtoBlob(sigGiver))
  if (sigRecipient) sig_recipient_path = await upload(`${base}/recipient.png`, dataURLtoBlob(sigRecipient))
  if (scanFile) scan_path = await upload(`${base}/scan_${scanFile.name.replace(/\s+/g, '_')}`, scanFile)

  const status = act.sign_mode === 'electronic' ? (sigRecipient ? 'signed' : 'awaiting_sign') : (scan_path ? 'signed_manual' : 'awaiting_sign')
  const { data: a, error } = await supabase.from('acts').insert({ ...act, number, sig_giver_path, sig_recipient_path, scan_path, status }).select().single()
  if (error) throw new Error('Сохранение акта: ' + error.message)

  const rows = items.map((it) => ({ act_id: a.id, product_id: it.product_id || null, name: it.name, sku: it.sku || null, inv_number: it.inv || null, unit: it.unit || 'шт', qty: Number(it.qty) || 0, price: Number(it.price) || 0, sum: (Number(it.qty) || 0) * (Number(it.price) || 0), condition: it.condition || null }))
  const { error: e2 } = await supabase.from('act_items').insert(rows)
  if (e2) throw new Error('Позиции акта: ' + e2.message)
  return { number, id: a.id }
}
