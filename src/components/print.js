/* Печать документа: выносим его в корень страницы, чтобы никакие
   модальные обёртки не добавляли пустых отступов и лишних страниц. */
export function printDoc(elementOrId) {
  const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId
  if (!el) { window.print(); return }

  const host = document.createElement('div')
  host.className = 'print-root'
  host.innerHTML = el.innerHTML
  document.body.appendChild(host)

  const cleanup = () => {
    try { document.body.removeChild(host) } catch (e) {}
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  setTimeout(() => { window.print(); setTimeout(cleanup, 1000) }, 60)
}
