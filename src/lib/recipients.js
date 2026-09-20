import { supabase } from '../supabaseClient'
import { enqueue, tempId } from './offline'

/* Получатели: создание прямо из формы и закрепление департамента.
   Уходить в справочник посреди выдачи неудобно, а вводить один и тот же
   департамент каждый раз — тем более. */

export async function createRecipient({ name, dept, branch_id }) {
  const n = (name || '').trim()
  if (!n) return { error: 'Введите имя' }

  const body = { name: n, dept: dept || null, branch_id: branch_id ? Number(branch_id) : null }

  // Без связи заводим с временным идентификатором — заменится при отправке
  if (!navigator.onLine) {
    const id = tempId()
    await enqueue({ kind: 'recipient', payload: body, tempId: id, title: 'Новый получатель · ' + n })
    return { data: { ...body, id }, offline: true }
  }

  // Двойников не плодим: тот же человек мог появиться, пока мы работали
  const { data: same } = await supabase.from('recipients').select('*').ilike('name', n).maybeSingle()
  if (same) return { data: same, existed: true }

  const { data, error } = await supabase.from('recipients').insert(body).select().single()
  return error ? { error: error.message } : { data }
}

/* Департамент закрепляем за получателем, если в карточке пусто.
   Заполненное не трогаем: разовая выдача в другой отдел не должна
   переписывать постоянные данные человека. */
export async function pinDept(recipientId, dept) {
  if (!recipientId || !dept || !navigator.onLine) return
  try {
    const { data: r } = await supabase.from('recipients').select('dept').eq('id', recipientId).maybeSingle()
    if (r && !r.dept) await supabase.from('recipients').update({ dept }).eq('id', recipientId)
  } catch (e) {}
}
