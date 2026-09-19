/* Хранилище на устройстве. На складе связи нет, поэтому данные лежат
   локально, а операции копятся в очереди и уходят при появлении сети.

   IndexedDB, а не localStorage: последний ограничен пятью мегабайтами
   и работает синхронно — каталог на пятьсот позиций его положит. */

const DB = 'sklad-offline'
const VER = 1
const SNAP = 'snapshots'   // снимки справочников и остатков
const QUEUE = 'queue'      // операции, которые ещё не ушли на сервер

let dbPromise = null

function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SNAP)) db.createObjectStore(SNAP)
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(store, mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    let out
    try { out = fn(s) } catch (e) { reject(e); return }
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out)
    t.onerror = () => reject(t.error)
  })
}

/* ── Снимок данных ──
   Делается раз в два часа и принудительно при возвращении связи.
   Без него внизу не будет ни каталога, ни остатков. */

export async function saveSnapshot(data) {
  const keep = {
    products: data.products, warehouses: data.warehouses, branches: data.branches,
    recipients: data.recipients, departments: data.departments, suppliers: data.suppliers,
    categories: data.categories, directions: data.directions, productTypes: data.productTypes,
    campaigns: data.campaigns, locations: data.locations, profiles: data.profiles,
    stock: data.stock, stockByWh: data.stockByWh, freeByWh: data.freeByWh,
    requests: (data.requests || []).filter((r) => r.status === 'approved' && r.sent_at),
    integrations: data.integrations,
  }
  try {
    await tx(SNAP, 'readwrite', (s) => s.put({ at: Date.now(), data: keep }, 'latest'))
    return true
  } catch (e) { return false }
}

export async function loadSnapshot() {
  try {
    const row = await tx(SNAP, 'readonly', (s) => s.get('latest'))
    return row || null
  } catch (e) { return null }
}

export async function snapshotAge() {
  const s = await loadSnapshot()
  return s?.at ? Date.now() - s.at : null
}

/* ── Очередь операций ──
   Переживает перезагрузку телефона: человек может выключить его
   с несохранёнными операциями и включить через день. */

export async function enqueue(op) {
  return tx(QUEUE, 'readwrite', (s) => s.add({
    ...op,
    at: Date.now(),
    tries: 0,
    error: null,
  }))
}

export async function queueList() {
  try {
    return await tx(QUEUE, 'readonly', (s) => s.getAll()) || []
  } catch (e) { return [] }
}

export async function queueCount() {
  try {
    return await tx(QUEUE, 'readonly', (s) => s.count()) || 0
  } catch (e) { return 0 }
}

export const dequeue = (id) => tx(QUEUE, 'readwrite', (s) => s.delete(id))

export const markFailed = (row, error) =>
  tx(QUEUE, 'readwrite', (s) => s.put({ ...row, tries: (row.tries || 0) + 1, error }))

export const clearQueue = () => tx(QUEUE, 'readwrite', (s) => s.clear())

/* Сколько дней висит самая старая операция — после трёх показываем
   крупное предупреждение: всё это время остатки в системе неверные. */
export async function oldestAgeDays() {
  const list = await queueList()
  if (!list.length) return 0
  const oldest = Math.min(...list.map((r) => r.at || Date.now()))
  return Math.floor((Date.now() - oldest) / 86400000)
}

/* Временные идентификаторы для товаров и получателей, заведённых без связи.
   При синхронизации заменяются на настоящие. */
export const tempId = () => `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
export const isTempId = (id) => typeof id === 'string' && id.startsWith('tmp_')

/* Просим браузер не чистить наши данные при нехватке места.
   Для установленного приложения срабатывает почти всегда. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch (e) {}
  return false
}
