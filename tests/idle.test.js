import { describe, it, expect, beforeEach } from 'vitest'
import { idleLeft, resetIdle } from '../src/lib/idle'

// Простая замена хранилища: тесты не должны зависеть от браузера
beforeEach(() => {
  const store = {}
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
  }
})

describe('выход по бездействию', () => {
  it('после отметки активности запас полный', () => {
    resetIdle()
    const left = idleLeft()
    expect(left).toBeGreaterThan(7.9 * 60 * 60 * 1000)
    expect(left).toBeLessThanOrEqual(8 * 60 * 60 * 1000)
  })

  it('без отметки считаем, что время не шло', () => {
    expect(idleLeft()).toBe(8 * 60 * 60 * 1000)
  })

  it('через восемь часов запас кончается', () => {
    localStorage.setItem('sklad-last-seen', String(Date.now() - 9 * 60 * 60 * 1000))
    expect(idleLeft()).toBe(0)
  })
})
