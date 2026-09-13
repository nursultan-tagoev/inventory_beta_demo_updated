import { describe, it, expect } from 'vitest'
import {
  can, scopeOf, canSee, signOf, stockDelta,
  isWarehouse, seesAll, isReadOnly, isSuper, ASSIGNABLE, ROLES,
} from '../src/lib/permissions'

const ALL_ROLES = ['admin', 'warehouse', 'manager', 'employee', 'director']

describe('роли', () => {
  it('их ровно пять', () => {
    expect(Object.keys(ROLES).sort()).toEqual([...ALL_ROLES].sort())
  })

  it('суперадмина нельзя назначить через форму', () => {
    expect(ASSIGNABLE).not.toContain('admin')
  })

  it('складом считаются суперадмин и админ склада', () => {
    expect(isWarehouse('admin')).toBe(true)
    expect(isWarehouse('warehouse')).toBe(true)
    expect(isWarehouse('manager')).toBe(false)
    expect(isWarehouse('employee')).toBe(false)
  })

  it('всё видят склад и директор, но меняет только склад', () => {
    expect(seesAll('director')).toBe(true)
    expect(isReadOnly('director')).toBe(true)
    expect(seesAll('manager')).toBe(false)
  })

  it('суперадмин только один', () => {
    expect(isSuper('admin')).toBe(true)
    expect(isSuper('warehouse')).toBe(false)
  })
})

describe('права на действия', () => {
  it('директор не может ничего — он наблюдатель', () => {
    for (const a of ['users', 'move', 'edit', 'issue', 'что-угодно']) {
      expect(can('director', a)).toBe(false)
    }
  })

  it('суперадмин может всё', () => {
    for (const a of ['users', 'move', 'edit', 'issue']) {
      expect(can('admin', a)).toBe(true)
    }
  })

  it('склад может всё, кроме учёток', () => {
    expect(can('warehouse', 'users')).toBe(false)
    expect(can('warehouse', 'move')).toBe(true)
    expect(can('warehouse', 'edit')).toBe(true)
    expect(can('warehouse', 'issue')).toBe(true)
  })

  it('специалист не управляет ничем', () => {
    expect(can('employee', 'move')).toBe(false)
    expect(can('employee', 'users')).toBe(false)
  })

  it('учётки заводит только суперадмин', () => {
    const allowed = ALL_ROLES.filter((r) => can(r, 'users'))
    expect(allowed).toEqual(['admin'])
  })
})

describe('область видимости', () => {
  it('склад и директор видят всё', () => {
    expect(scopeOf({ role: 'admin' }).kind).toBe('all')
    expect(scopeOf({ role: 'warehouse' }).kind).toBe('all')
    expect(scopeOf({ role: 'director' }).kind).toBe('all')
  })

  it('руководитель — только свой филиал', () => {
    const s = scopeOf({ role: 'manager', branch_id: 3 })
    expect(s).toEqual({ kind: 'branch', branchId: 3 })
  })

  it('специалист — только себя', () => {
    const s = scopeOf({ role: 'employee', id: 'u1' })
    expect(s).toEqual({ kind: 'self', userId: 'u1' })
  })
})

describe('видимость документа', () => {
  const doc = { branch_id: 1, author_id: 'u1', recipient_profile_id: 'u2' }

  it('склад видит чужой документ', () => {
    expect(canSee({ role: 'warehouse' }, doc)).toBe(true)
  })

  it('руководитель чужого филиала не видит', () => {
    expect(canSee({ role: 'manager', branch_id: 1 }, doc)).toBe(true)
    expect(canSee({ role: 'manager', branch_id: 3 }, doc)).toBe(false)
  })

  it('специалист видит своё как автор и как получатель', () => {
    expect(canSee({ role: 'employee', id: 'u1' }, doc)).toBe(true)
    expect(canSee({ role: 'employee', id: 'u2' }, doc)).toBe(true)
    expect(canSee({ role: 'employee', id: 'u9' }, doc)).toBe(false)
  })
})

describe('знак операции', () => {
  it('склад видит выдачу как минус', () => {
    expect(signOf('warehouse', 'out')).toBe(-1)
    expect(signOf('admin', 'out')).toBe(-1)
  })

  it('получатель видит ту же выдачу как плюс', () => {
    expect(signOf('employee', 'out')).toBe(1)
    expect(signOf('manager', 'out')).toBe(1)
  })

  it('возврат зеркален', () => {
    expect(signOf('warehouse', 'return')).toBe(1)
    expect(signOf('employee', 'return')).toBe(-1)
  })

  it('корректировка вверх у склада в плюс', () => {
    expect(signOf('warehouse', 'adjust_up')).toBe(1)
    expect(signOf('warehouse', 'adjust_down')).toBe(-1)
  })
})

describe('влияние на остаток', () => {
  it('приход, возврат и корректировка вверх увеличивают', () => {
    expect(stockDelta('in', 10)).toBe(10)
    expect(stockDelta('return', 3)).toBe(3)
    expect(stockDelta('adjust_up', 2)).toBe(2)
  })

  it('выдача, списание, брак, перемещение и корректировка вниз уменьшают', () => {
    expect(stockDelta('out', 5)).toBe(-5)
    expect(stockDelta('writeoff', 1)).toBe(-1)
    expect(stockDelta('defect', 4)).toBe(-4)
    expect(stockDelta('transfer', 7)).toBe(-7)
    expect(stockDelta('adjust_down', 2)).toBe(-2)
  })

  it('все восемь типов учтены — иначе новый тип молча не тронет остаток', () => {
    const TYPES = ['in', 'out', 'return', 'writeoff', 'transfer', 'defect', 'adjust_up', 'adjust_down']
    for (const t of TYPES) {
      expect(stockDelta(t, 1), `тип ${t} не влияет на остаток`).not.toBe(0)
    }
  })

  it('неизвестный тип не меняет остаток', () => {
    expect(stockDelta('выдумка', 5)).toBe(0)
  })

  it('нечисловое количество не ломает расчёт', () => {
    expect(stockDelta('in', undefined)).toBe(0)
    expect(stockDelta('in', 'пять')).toBe(0)
  })
})
