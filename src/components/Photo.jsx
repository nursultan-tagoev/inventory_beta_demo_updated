import { useState } from 'react'
import { photoUrl } from '../lib/photos'

/* Фото товара. Без снимка — иконка, чтобы карточки не разъезжались
   по высоте и список выглядел ровным. */

export default function Photo({ product, photos, size = 36, radius = 11, style }) {
  const [failed, setFailed] = useState(false)
  // Путь берём из общей карты главных снимков: она грузится одним запросом
  const url = photoUrl(photos?.[product?.id])

  const box = {
    width: size, height: size, borderRadius: radius,
    background: 'var(--sur2)', display: 'grid', placeItems: 'center',
    flexShrink: 0, overflow: 'hidden', ...style,
  }

  if (!url || failed) {
    return <div style={box}><span style={{ fontSize: size * 0.45 }}>📦</span></div>
  }

  return (
    <div style={box}>
      <img src={url} alt="" loading="lazy" onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  )
}
