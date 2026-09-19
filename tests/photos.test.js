import { describe, it, expect } from 'vitest'
import { photoUrl } from '../src/lib/photos'

describe('ссылка на снимок', () => {
  it('без пути ссылки нет — покажем иконку', () => {
    expect(photoUrl(null)).toBe(null)
    expect(photoUrl(undefined)).toBe(null)
    expect(photoUrl('')).toBe(null)
  })
})
