import { describe, it, expect } from 'vitest'
import { canCancelMovement, canHardDelete } from '../src/lib/cleanup'

describe('права на отмену и удаление', () => {
  it('отменять движения может склад', () => {
    expect(canCancelMovement('admin')).toBe(true)
    expect(canCancelMovement('warehouse')).toBe(true)
    expect(canCancelMovement('manager')).toBe(false)
    expect(canCancelMovement('employee')).toBe(false)
    expect(canCancelMovement('director')).toBe(false)
  })

  it('удалять насовсем — только суперадмин', () => {
    expect(canHardDelete('admin')).toBe(true)
    expect(canHardDelete('warehouse')).toBe(false)
    expect(canHardDelete('manager')).toBe(false)
    expect(canHardDelete('employee')).toBe(false)
    expect(canHardDelete('director')).toBe(false)
  })

  it('неизвестная роль ничего не может', () => {
    expect(canCancelMovement(undefined)).toBe(false)
    expect(canHardDelete(null)).toBe(false)
  })
})
