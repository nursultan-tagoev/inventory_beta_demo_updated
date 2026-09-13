/* Права в одном месте. Раньше проверки role === 'admin' были разбросаны
   по экранам — с появлением склада как отдельной роли это стало опасно. */

export const ROLES = {
  admin:     'Суперадминистратор',
  warehouse: 'Администратор склада',
  manager:   'Руководитель филиала',
  employee:  'Специалист',
  director:  'Директор',
}

// Суперадмина через форму не заводят — он один и уже есть
export const ASSIGNABLE = ['warehouse', 'manager', 'employee', 'director']

// Склад — это суперадмин и админ склада вместе
export const isWarehouse = (role) => role === 'admin' || role === 'warehouse'
// Видят всё, но директор ничего не меняет
export const seesAll = (role) => isWarehouse(role) || role === 'director'
export const isReadOnly = (role) => role === 'director'
export const isSuper = (role) => role === 'admin'

/* Права по действиям. Раньше это жило в App.jsx и дублировалось по экранам —
   вынесено сюда, чтобы покрыть тестами и иметь один источник правды. */
export function can(role, action) {
  if (role === 'director') return false            // наблюдатель: видит всё, не меняет ничего
  if (role === 'admin') return true                // суперадмин
  if (role === 'warehouse') return action !== 'users'  // всё, кроме учёток и ролей
  if (role === 'manager') return action === 'move' || action === 'edit'
  return false
}

/* Область видимости: что человеку вообще положено */
export function scopeOf(profile) {
  const r = profile?.role
  if (seesAll(r)) return { kind: 'all' }
  if (r === 'manager') return { kind: 'branch', branchId: profile?.branch_id }
  return { kind: 'self', userId: profile?.id }
}

/* Виден ли документ этой роли. Те же правила, что в RLS —
   расхождение между интерфейсом и базой здесь и ловится. */
export function canSee(profile, doc) {
  const s = scopeOf(profile)
  if (s.kind === 'all') return true
  if (s.kind === 'branch') return doc?.branch_id === s.branchId
  return doc?.author_id === s.userId || doc?.recipient_profile_id === s.userId
}

/* Знак операции считается ОТ РОЛИ, а не от типа:
   склад отдал — минус, получатель принял — плюс. */
export function signOf(role, type) {
  if (type === 'transfer') return 0
  const plus = seesAll(role)
    ? ['in', 'return', 'adjust_up'].includes(type)
    : type === 'out'
  return plus ? 1 : -1
}

/* Влияние операции на остаток склада. Повторяет представление
   stock_by_warehouse: любой новый тип без правки обоих мест = тихая ошибка. */
export function stockDelta(type, qty) {
  const n = Number(qty) || 0
  switch (type) {
    case 'in': case 'return': case 'adjust_up': return n
    case 'out': case 'writeoff': case 'transfer':
    case 'defect': case 'adjust_down': return -n
    default: return 0
  }
}
