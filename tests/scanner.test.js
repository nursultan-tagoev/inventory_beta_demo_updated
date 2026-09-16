import { describe, it, expect } from 'vitest'
import { extractSku } from '../src/components/Scanner'

describe('чтение кода с наклейки', () => {
  it('достаёт артикул из ссылки', () => {
    expect(extractSku('https://sklad.example.com/s/RZN-FTB-BLU-M')).toBe('RZN-FTB-BLU-M')
  })

  it('понимает голый артикул — старые наклейки остаются рабочими', () => {
    expect(extractSku('RZN-FTB-BLU-M')).toBe('RZN-FTB-BLU-M')
  })

  it('раскодирует кириллицу и пробелы', () => {
    expect(extractSku('https://a.b/s/%D0%A2%D0%95%D0%A1%D0%A2-1')).toBe('ТЕСТ-1')
  })

  it('отбрасывает хвост адреса', () => {
    expect(extractSku('https://a.b/s/ABC-1?utm=qr')).toBe('ABC-1')
    expect(extractSku('https://a.b/s/ABC-1#top')).toBe('ABC-1')
  })

  it('обрезает пробелы по краям', () => {
    expect(extractSku('  ABC-1  ')).toBe('ABC-1')
  })

  it('пустое не ломает', () => {
    expect(extractSku('')).toBe('')
    expect(extractSku(null)).toBe('')
    expect(extractSku(undefined)).toBe('')
  })
})
