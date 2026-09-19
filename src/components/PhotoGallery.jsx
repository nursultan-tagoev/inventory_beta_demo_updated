import { useState, useEffect } from 'react'
import { listPhotos, addPhoto, setMain, removePhoto, photoUrl, MANY } from '../lib/photos'
import { useToast, Btn } from './ui'

/* Галерея снимков товара: полоса миниатюр, загрузка, выбор главного
   и просмотр на весь экран с листанием. */

export default function PhotoGallery({ product, canEdit, onChanged, viewerOnly, onClose }) {
  const toast = useToast()
  const [list, setList] = useState([])
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState(null)   // индекс открытого снимка

  const reload = () => listPhotos(product.id).then(setList)
  useEffect(() => { reload() }, [product.id])

  /* Из витрины открываем просмотр сразу: человек нажал на фото,
     а не на миниатюру в карточке. */
  useEffect(() => {
    if (!viewerOnly) return
    if (list.length) setView(0)
    else if (list !== null) onClose?.()
  }, [viewerOnly, list.length])

  const upload = async (files) => {
    if (!files?.length) return
    setBusy(true)
    let bad = 0
    for (const f of files) {
      const { error } = await addPhoto(product.id, f)
      if (error) { bad++; toast(error, 'error') }
    }
    setBusy(false)
    await reload()
    onChanged?.()
    if (!bad) toast(files.length > 1 ? `Загружено снимков: ${files.length}` : 'Фото загружено')
  }

  const close = () => { setView(null); onClose?.() }

  return (
    <>
      {!viewerOnly && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {list.map((ph, i) => (
          <div key={ph.id} style={{ position: 'relative' }}>
            <button onClick={() => setView(i)}
              style={{ width: 64, height: 64, borderRadius: 11, overflow: 'hidden', padding: 0,
                border: ph.is_main ? '2px solid var(--ink)' : '1px solid var(--brd)', background: 'var(--sur2)' }}>
              <img src={photoUrl(ph.path)} alt="" loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
            {ph.is_main && (
              <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 9, padding: '1px 5px', borderRadius: 20, background: 'var(--ink)', color: '#fff', fontWeight: 600 }}>
                главное
              </span>
            )}
          </div>
        ))}

        {canEdit && (
          <label style={{ width: 64, height: 64, borderRadius: 11, border: '1.5px dashed var(--brd2)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--tx3)' }}>
            <input type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={(e) => { upload([...e.target.files]); e.target.value = '' }} />
            <span style={{ fontSize: 20 }}>{busy ? '…' : '＋'}</span>
          </label>
        )}
      </div>}

      {!viewerOnly && list.length === 0 && !canEdit && (
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Снимков нет</div>
      )}

      {!viewerOnly && canEdit && list.length > MANY && (
        <div style={{ fontSize: 11, color: 'var(--am-m)', marginTop: 6, lineHeight: 1.5 }}>
          Снимков уже {list.length} — каталог станет тяжелее загружаться.
        </div>
      )}

      {/* Просмотр на весь экран */}
      {view !== null && list[view] && (
        <div onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,.92)', display: 'flex', flexDirection: 'column' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
            <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {product.name}
            </span>
            <span style={{ fontSize: 12, opacity: .7 }}>{view + 1} из {list.length}</span>
            <button onClick={close} style={{ color: '#fff', fontSize: 22, padding: '2px 8px', lineHeight: 1 }}>×</button>
          </div>

          <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 12, minHeight: 0 }}>
            <img src={photoUrl(list[view].path)} alt=""
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
          </div>

          {/* Листание: на складе удобнее кнопками, чем жестами в перчатках */}
          {list.length > 1 && (
            <div onClick={(e) => e.stopPropagation()}
              style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '0 16px 10px' }}>
              <button onClick={() => setView((v) => (v - 1 + list.length) % list.length)}
                style={{ minHeight: 44, padding: '0 18px', borderRadius: 11, background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 15 }}>‹</button>
              <button onClick={() => setView((v) => (v + 1) % list.length)}
                style={{ minHeight: 44, padding: '0 18px', borderRadius: 11, background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 15 }}>›</button>
            </div>
          )}

          {canEdit && (
            <div onClick={(e) => e.stopPropagation()}
              style={{ display: 'flex', gap: 8, padding: '0 16px 20px', flexWrap: 'wrap' }}>
              {!list[view].is_main && (
                <Btn size="sm" onClick={async () => {
                  const { error } = await setMain(list[view])
                  if (error) return toast(error, 'error')
                  await reload(); onChanged?.(); toast('Главное фото изменено')
                }} style={{ flex: 1, minHeight: 44 }}>Сделать главным</Btn>
              )}
              <button onClick={async () => {
                const ph = list[view]
                const { error } = await removePhoto(ph)
                if (error) return toast(error, 'error')
                const rest = await listPhotos(product.id)
                setList(rest)
                setView(rest.length ? Math.min(view, rest.length - 1) : null)
                onChanged?.()
                toast('Снимок удалён')
              }} style={{ minHeight: 44, padding: '0 18px', borderRadius: 11, background: 'rgba(255,90,90,.18)', color: '#ff8f8f', fontSize: 13 }}>
                Удалить
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
