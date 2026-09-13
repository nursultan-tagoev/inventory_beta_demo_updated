/* Печать документа: выносим его в корень страницы, чтобы никакие
   модальные обёртки не добавляли пустых отступов и лишних страниц. */
export function printDoc(elementOrId) {
  const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId
  if (!el) { window.print(); return }

  const host = document.createElement('div')
  host.className = 'print-root'

  /* Клонируем сам элемент, а не его внутренности: у корневого блока
     свои стили — поля, шрифт, фон. При копировании innerHTML они терялись,
     и на печать уходил голый текст. */
  host.appendChild(el.cloneNode(true))
  document.body.appendChild(host)

  const cleanup = () => {
    try { document.body.removeChild(host) } catch (e) {}
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  setTimeout(() => { window.print(); setTimeout(cleanup, 1000) }, 60)
}
