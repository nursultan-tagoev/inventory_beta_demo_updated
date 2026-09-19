import { supabase } from '../supabaseClient'

/* Создание записей классификатора прямо из формы. Раньше, если нужной
   кампании не было, приходилось уходить в справочник и терять начатое. */

export async function createDirection(name) {
  const n = (name || '').trim()
  if (!n) return { error: 'Введите название' }

  // Такое уже может быть — берём существующее, а не плодим двойников
  const { data: same } = await supabase.from('directions').select('*').ilike('name', n).maybeSingle()
  if (same) return { data: same, existed: true }

  const { data, error } = await supabase.from('directions').insert({ name: n }).select().single()
  return error ? { error: error.message } : { data }
}

export async function createProductType(name, directionId) {
  const n = (name || '').trim()
  if (!n) return { error: 'Введите название' }
  if (!directionId) return { error: 'Сначала выберите направление' }

  const { data: same } = await supabase.from('product_types').select('*')
    .eq('direction_id', Number(directionId)).ilike('name', n).maybeSingle()
  if (same) return { data: same, existed: true }

  const { data, error } = await supabase.from('product_types')
    .insert({ name: n, direction_id: Number(directionId) }).select().single()
  return error ? { error: error.message } : { data }
}

export async function createCampaign(name, productTypeId) {
  const n = (name || '').trim()
  if (!n) return { error: 'Введите название' }
  if (!productTypeId) return { error: 'Сначала выберите продукт банка' }

  const { data: same } = await supabase.from('campaigns').select('*')
    .eq('product_type_id', Number(productTypeId)).ilike('name', n).maybeSingle()
  if (same) return { data: same, existed: true }

  const { data, error } = await supabase.from('campaigns')
    .insert({ name: n, product_type_id: Number(productTypeId) }).select().single()
  return error ? { error: error.message } : { data }
}
