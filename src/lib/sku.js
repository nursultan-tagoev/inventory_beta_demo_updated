/* Артикул собирается из иерархии и признаков: RTL-TSH-BLU-M.
   Присваивается ОДИН раз и дальше не меняется — он напечатан на наклейках,
   и молчаливая смена сделала бы все наклейки на складе неверными. */

const MAP = {
  а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ё: 'E', ж: 'ZH', з: 'Z', и: 'I', й: 'I',
  к: 'K', л: 'L', м: 'M', н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F',
  х: 'H', ц: 'C', ч: 'CH', ш: 'SH', щ: 'SCH', ъ: '', ы: 'Y', ь: '', э: 'E', ю: 'YU', я: 'YA',
  ү: 'U', ұ: 'U', ө: 'O', ң: 'N',
}

export const translit = (s) => String(s || '').toLowerCase().split('')
  .map((c) => (MAP[c] !== undefined ? MAP[c] : c))
  .join('')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '')

/* Короткий код из слова. Гласные выбрасываем — так «Сувенирная» даёт SVN,
   а не SUV, и коды разных слов реже совпадают. */
export function shortCode(word, len = 3) {
  const t = translit(word)
  if (!t) return ''
  if (t.length <= len) return t.padEnd(len, 'X')
  const noVowels = t[0] + t.slice(1).replace(/[AEIOUY]/g, '')
  return (noVowels.length >= len ? noVowels : t).slice(0, len)
}

// Цвета встречаются часто — для них фиксированный словарь, иначе «синий» и «синяя» дадут разное
const COLORS = {
  синий: 'BLU', синяя: 'BLU', синее: 'BLU', голубой: 'BLU',
  красный: 'RED', красная: 'RED', бордовый: 'BRD',
  зелёный: 'GRN', зеленый: 'GRN', зелёная: 'GRN', зеленая: 'GRN',
  чёрный: 'BLK', черный: 'BLK', чёрная: 'BLK', черная: 'BLK',
  белый: 'WHT', белая: 'WHT', белое: 'WHT',
  серый: 'GRY', серая: 'GRY', серебристый: 'SLV',
  жёлтый: 'YLW', желтый: 'YLW', оранжевый: 'ORG',
  фиолетовый: 'PRP', розовый: 'PNK', коричневый: 'BRN',
  бежевый: 'BEI', золотой: 'GLD', прозрачный: 'CLR',
}
export const colorCode = (c) => {
  const k = String(c || '').trim().toLowerCase()
  if (!k) return ''
  return COLORS[k] || shortCode(k, 3)
}

// Размер идёт как есть: M, XL, A5, 330
export const sizeCode = (p) => translit(p?.size).slice(0, 5)

/* Собираем артикул. Иерархия: направление → тип → цвет → размер. */
export function buildSku(product, { directions, productTypes, campaigns }) {
  const camp = campaigns?.find((c) => c.id === product.campaign_id)
  const type = productTypes?.find((t) => t.id === (camp?.product_type_id || product.product_type_id))
  const dir = directions?.find((d) => d.id === (type?.direction_id || product.direction_id))

  const parts = [
    shortCode(dir?.name) || 'GEN',            // без направления — общий
    shortCode(type?.name) || shortCode(product.name),
    colorCode(product.color),
    sizeCode(product),
  ].filter(Boolean)

  return parts.join('-')
}

/* Разводим совпадения: второй такой же получает -2, третий -3.
   Учитываем и уже занятые коды, и те, что назначаем в этом же проходе. */
export function assignSkus(products, refs, { onlyEmpty = false } = {}) {
  const taken = new Set()
  if (onlyEmpty) {
    for (const p of products) if (p.sku) taken.add(p.sku.toUpperCase())
  }

  const rows = []
  for (const p of products) {
    if (onlyEmpty && p.sku) { rows.push({ id: p.id, name: p.name, old: p.sku, sku: p.sku, changed: false }); continue }

    const base = buildSku(p, refs)
    let sku = base, n = 1
    while (taken.has(sku.toUpperCase())) { n += 1; sku = `${base}-${n}` }
    taken.add(sku.toUpperCase())

    rows.push({ id: p.id, name: p.name, old: p.sku || '', sku, changed: (p.sku || '') !== sku })
  }
  return rows
}
