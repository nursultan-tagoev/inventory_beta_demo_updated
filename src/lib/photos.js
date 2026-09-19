import { supabase } from '../supabaseClient'

/* Фото товаров. Мерч бывает похожим — «ручка брендированная» может быть
   пяти видов, и на словах их не различить. Снимков несколько:
   вид спереди и сзади, в упаковке и без. */

const BUCKET = 'products'
export const MANY = 10   // мягкий предел: дальше предупреждаем, но не запрещаем

/* Уменьшаем перед отправкой: с телефона снимок весит до десяти мегабайт,
   а для карточки хватает восьмисот точек по длинной стороне. */
export function shrink(file, max = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось обработать снимок'))), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Это не похоже на изображение')) }
    img.src = url
  })
}

export function photoUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl || null
}

export async function listPhotos(productId) {
  const { data } = await supabase.from('product_photos').select('*')
    .eq('product_id', productId).order('is_main', { ascending: false }).order('sort')
  return data || []
}

/* Снимки сразу для многих товаров — витрина показывает главный
   у каждой карточки, по одному запросу на товар её бы положило. */
export async function mainPhotos() {
  const { data } = await supabase.from('product_photos').select('product_id,path,is_main,sort')
    .order('is_main', { ascending: false }).order('sort')
  const map = {}
  for (const r of data || []) if (!map[r.product_id]) map[r.product_id] = r.path
  return map
}

export async function addPhoto(productId, file) {
  if (!file) return { error: 'Файл не выбран' }
  if (!/^image\//.test(file.type)) return { error: 'Нужен снимок, а не файл другого типа' }

  let blob
  try { blob = await shrink(file) } catch (e) { return { error: e.message } }

  /* Случайное имя, а не номер товара: корзина публичная, и по номеру
     ссылки можно было бы подобрать. Со случайным именем — нельзя.
     Плюс время в имени: иначе браузер показывает старый снимок из кеша. */
  const rnd = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '')
  const path = `p/${rnd}${Date.now().toString(36)}.jpg`
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) return { error: 'Загрузка: ' + error.message }

  const existing = await listPhotos(productId)
  const { data, error: e2 } = await supabase.from('product_photos')
    .insert({ product_id: productId, path, is_main: existing.length === 0, sort: existing.length })
    .select().single()
  if (e2) return { error: e2.message }
  return { data }
}

export async function setMain(photo) {
  // Главный ровно один: снимаем признак со всех, потом ставим на выбранный
  await supabase.from('product_photos').update({ is_main: false })
    .eq('product_id', photo.product_id).eq('is_main', true)
  const { error } = await supabase.from('product_photos').update({ is_main: true }).eq('id', photo.id)
  return { error: error ? error.message : null }
}

export async function removePhoto(photo) {
  try { await supabase.storage.from(BUCKET).remove([photo.path]) } catch (e) {}
  const { error } = await supabase.from('product_photos').delete().eq('id', photo.id)
  if (error) return { error: error.message }

  // Удалили главный — главным становится следующий, иначе витрина опустеет
  if (photo.is_main) {
    const rest = await listPhotos(photo.product_id)
    if (rest.length) await setMain(rest[0])
  }
  return { error: null }
}
