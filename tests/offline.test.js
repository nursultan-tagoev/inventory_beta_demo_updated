import { describe, it, expect } from 'vitest'
import { tempId, isTempId } from '../src/lib/offline'

describe('временные идентификаторы', () => {
  it('помечаются узнаваемо', () => {
    const id = tempId()
    expect(isTempId(id)).toBe(true)
    expect(id.startsWith('tmp_')).toBe(true)
  })

  it('не повторяются', () => {
    const ids = new Set(Array.from({ length: 200 }, () => tempId()))
    expect(ids.size).toBe(200)
  })

  it('настоящие идентификаторы временными не считаются', () => {
    expect(isTempId(42)).toBe(false)
    expect(isTempId('c0ffee-1234')).toBe(false)
    expect(isTempId(null)).toBe(false)
    expect(isTempId(undefined)).toBe(false)
  })
})
