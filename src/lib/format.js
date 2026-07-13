export const fmt = (n) => new Intl.NumberFormat('ru-RU').format(Math.round((n || 0) * 100) / 100)
export const som = (n) => fmt(n) + ' сом'
export const TL = { in: 'Приход', out: 'Выдача', return: 'Возврат', writeoff: 'Списание', transfer: 'Перемещение' }
export const TC = { in: 'var(--gr)', out: 'var(--ink)', return: 'var(--pu)', writeoff: 'var(--rd)', transfer: 'var(--am-m)' }
