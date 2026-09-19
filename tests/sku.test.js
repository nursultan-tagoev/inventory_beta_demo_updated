import { describe, it, expect } from 'vitest'
import { translit, shortCode, colorCode, buildSku, assignSkus, uniqueSku } from '../src/lib/sku'

const refs = {
  directions: [{ id: 1, name: 'Розница' }, { id: 2, name: 'Бизнес' }],
  productTypes: [
    { id: 10, name: 'Футболки', direction_id: 1 },
    { id: 11, name: 'Ежедневники', direction_id: 2 },
  ],
  campaigns: [],
}

describe('транслитерация', () => {
  it('кириллица в латиницу', () => {
    expect(translit('Розница')).toBe('ROZNICA')
    expect(translit('Футболка')).toBe('FUTBOLKA')
  })
  it('убирает пробелы и знаки', () => {
    expect(translit('А5, формат')).toBe('A5FORMAT')
  })
})

describe('короткий код', () => {
  it('выбрасывает гласные, кроме первой буквы', () => {
    expect(shortCode('Розница')).toBe('RZN')
    expect(shortCode('Футболки')).toBe('FTB')
  })
  it('короткое слово дополняет', () => {
    expect(shortCode('Оф')).toBe('OFX')
  })
  it('пустое не ломает', () => {
    expect(shortCode('')).toBe('')
    expect(shortCode(undefined)).toBe('')
  })
})

describe('цвет', () => {
  it('словарь сводит формы к одному коду', () => {
    expect(colorCode('синий')).toBe('BLU')
    expect(colorCode('Синяя')).toBe('BLU')
    expect(colorCode('чёрный')).toBe('BLK')
    expect(colorCode('черный')).toBe('BLK')
  })
  it('незнакомый цвет транслитерирует', () => {
    expect(colorCode('лазурный')).toHaveLength(3)
  })
  it('пустой цвет не даёт части', () => {
    expect(colorCode('')).toBe('')
  })
})

describe('сборка артикула', () => {
  it('иерархия, цвет и размер', () => {
    const p = { id: 1, name: 'Футболка', product_type_id: 10, color: 'синий', size: 'M' }
    expect(buildSku(p, refs)).toBe('RZN-FTB-BLU-M')
  })
  it('без признаков — только иерархия', () => {
    const p = { id: 2, name: 'Ручка', product_type_id: 10 }
    expect(buildSku(p, refs)).toBe('RZN-FTB')
  })
  it('без направления — общий префикс', () => {
    const p = { id: 3, name: 'Прочее' }
    expect(buildSku(p, refs)).toMatch(/^GEN-/)
  })
})

describe('присвоение', () => {
  it('одинаковые товары получают разные коды', () => {
    const list = [
      { id: 1, name: 'Футболка', product_type_id: 10, color: 'синий', size: 'M' },
      { id: 2, name: 'Футболка', product_type_id: 10, color: 'синий', size: 'M' },
      { id: 3, name: 'Футболка', product_type_id: 10, color: 'синий', size: 'M' },
    ]
    const rows = assignSkus(list, refs)
    const skus = rows.map((r) => r.sku)
    expect(new Set(skus).size).toBe(3)
    expect(skus[0]).toBe('RZN-FTB-BLU-M')
    expect(skus[1]).toBe('RZN-FTB-BLU-M-2')
  })

  it('режим «только пустые» не трогает заполненные', () => {
    const list = [
      { id: 1, name: 'А', product_type_id: 10, sku: 'СВОЙ-КОД' },
      { id: 2, name: 'Б', product_type_id: 10 },
    ]
    const rows = assignSkus(list, refs, { onlyEmpty: true })
    expect(rows[0].changed).toBe(false)
    expect(rows[0].sku).toBe('СВОЙ-КОД')
    expect(rows[1].changed).toBe(true)
  })

  it('отмечает, что именно меняется', () => {
    const list = [{ id: 1, name: 'А', product_type_id: 10, sku: 'RZN-FTB' }]
    const rows = assignSkus(list, refs)
    expect(rows[0].changed).toBe(false)
  })
})

describe('уникальный артикул для нового товара', () => {
  const list = [{ id: 1, sku: 'RZN-FTB' }, { id: 2, sku: 'RZN-FTB-2' }]

  it('свободный отдаёт как есть', () => {
    const p = { name: 'Ручка', product_type_id: 11 }
    expect(uniqueSku(p, refs, [])).toBe('BZN-EZH')
  })

  it('занятый получает номер', () => {
    const p = { name: 'Футболка', product_type_id: 10 }
    expect(uniqueSku(p, refs, list)).toBe('RZN-FTB-3')
  })

  it('регистр не обманывает проверку', () => {
    const p = { name: 'Футболка', product_type_id: 10 }
    expect(uniqueSku(p, refs, [{ sku: 'rzn-ftb' }])).toBe('RZN-FTB-2')
  })
})
