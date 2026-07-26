import * as XLSX from 'xlsx'

/* Выгрузка в XLSX. sheets: [{ name, rows }], где rows — массив объектов.
   Ширина колонок считается по содержимому, иначе всё слипается. */
export function exportXlsx(sheets, filename) {
  const wb = XLSX.utils.book_new()

  for (const { name, rows } of sheets) {
    if (!rows?.length) continue
    const ws = XLSX.utils.json_to_sheet(rows)
    const keys = Object.keys(rows[0])
    ws['!cols'] = keys.map((k) => {
      const len = Math.max(String(k).length, ...rows.map((r) => String(r[k] ?? '').length))
      return { wch: Math.min(42, Math.max(10, len + 2)) }
    })
    XLSX.utils.book_append_sheet(wb, ws, String(name).slice(0, 31))
  }

  if (!wb.SheetNames.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Данных: 'нет' }]), 'Пусто')
  }
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${filename}_${stamp}.xlsx`)
}
