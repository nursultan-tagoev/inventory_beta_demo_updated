/* Признаки товара. Тип размерности выбирается у самого товара —
   у футболки это S/M/L, у бокала миллилитры, у визиток тираж. */

export const SIZE_TYPES = [
  ['', 'Без размерности'],
  ['clothes', 'Одежда — S, M, L'],
  ['volume', 'Объём — мл'],
  ['format', 'Формат — А4, А5'],
  ['dims', 'Габариты — см'],
  ['run', 'Тираж — шт'],
  ['weight', 'Вес — г'],
]

// Готовые значения там, где список короткий и закрытый
export const SIZE_OPTIONS = {
  clothes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
  format: ['А3', 'А4', 'А5', 'А6', 'DL', '90×50'],
}

export const SIZE_HINT = {
  clothes: 'выберите размер',
  volume: 'например 330',
  format: 'выберите формат',
  dims: 'например 40×30×10',
  run: 'например 1000',
  weight: 'например 250',
}

export const SIZE_UNIT = { volume: 'мл', dims: 'см', run: 'шт', weight: 'г' }

export const GENDERS = [['', '—'], ['male', 'Мужской'], ['female', 'Женский'], ['unisex', 'Унисекс'], ['kids', 'Детский']]
export const SEASONS = [['', '—'], ['winter', 'Зима'], ['summer', 'Лето'], ['demi', 'Демисезон'], ['all', 'Всесезонный']]

const LBL = (list, v) => list.find(([k]) => k === v)?.[1] || ''
export const genderLabel = (v) => LBL(GENDERS, v)
export const seasonLabel = (v) => LBL(SEASONS, v)

// Размер по-человечески: «M», «330 мл», «А5»
export function sizeLabel(p) {
  if (!p?.size) return ''
  const unit = SIZE_UNIT[p.size_type]
  return unit ? `${p.size} ${unit}` : String(p.size)
}

// Все признаки строкой — для названия позиции в акте и в списках
export function attrsLine(p) {
  return [sizeLabel(p), p?.color, genderLabel(p?.gender)].filter(Boolean).join(' · ')
}

// Название с признаками: «Футболка · M · синяя»
export const fullName = (p) => {
  const a = attrsLine(p)
  return a ? `${p.name} · ${a}` : p?.name || ''
}
