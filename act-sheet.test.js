import { describe, it, expect } from 'vitest'
import { amountInWords, plural, longDate } from '../src/components/ActSheet'

describe('сумма прописью', () => {
  it('ноль', () => {
    expect(amountInWords(0)).toBe('ноль сом 00 тыйын')
  })

  it('простые суммы', () => {
    expect(amountInWords(1)).toBe('один сом 00 тыйын')
    expect(amountInWords(2)).toBe('два сома 00 тыйын')
    expect(amountInWords(5)).toBe('пять сомов 00 тыйын')
  })

  it('сумма из макета', () => {
    expect(amountInWords(7150)).toBe('семь тысяч сто пятьдесят сомов 00 тыйын')
  })

  it('тысячи в женском роде', () => {
    expect(amountInWords(1000)).toBe('одна тысяча сомов 00 тыйын')
    expect(amountInWords(2000)).toBe('две тысячи сомов 00 тыйын')
    expect(amountInWords(5000)).toBe('пять тысяч сомов 00 тыйын')
  })

  it('подростковые числа не путаются с десятками', () => {
    expect(amountInWords(11)).toBe('одиннадцать сомов 00 тыйын')
    expect(amountInWords(15)).toBe('пятнадцать сомов 00 тыйын')
    expect(amountInWords(111)).toBe('сто одиннадцать сомов 00 тыйын')
  })

  it('копейки', () => {
    expect(amountInWords(450.5)).toBe('четыреста пятьдесят сомов 50 тыйын')
    expect(amountInWords(1.01)).toBe('один сом 01 тыйын')
  })

  it('миллионы', () => {
    expect(amountInWords(1000000)).toBe('один миллион сомов 00 тыйын')
    expect(amountInWords(2500000)).toContain('два миллиона пятьсот тысяч')
  })

  it('нечисловое не ломает', () => {
    expect(amountInWords(undefined)).toBe('ноль сом 00 тыйын')
    expect(amountInWords(null)).toBe('ноль сом 00 тыйын')
  })
})

describe('склонения', () => {
  it('позиции', () => {
    expect(plural(1, 'позиция', 'позиции', 'позиций')).toBe('позиция')
    expect(plural(2, 'позиция', 'позиции', 'позиций')).toBe('позиции')
    expect(plural(5, 'позиция', 'позиции', 'позиций')).toBe('позиций')
    expect(plural(11, 'позиция', 'позиции', 'позиций')).toBe('позиций')
    expect(plural(21, 'позиция', 'позиции', 'позиций')).toBe('позиция')
    expect(plural(112, 'позиция', 'позиции', 'позиций')).toBe('позиций')
  })
})

describe('дата в документе', () => {
  it('пишется словом, как в бланке', () => {
    expect(longDate('2026-09-13')).toBe('13 сентября 2026 года')
    expect(longDate('2026-01-01')).toBe('1 января 2026 года')
  })
})
