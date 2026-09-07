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
