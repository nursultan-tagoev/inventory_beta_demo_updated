import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { attrsLine } from '../lib/attrs'

/* Наклейка на товар. Печатается в реальных миллиметрах — и на обычный
   принтер листом, и на термопринтер поштучно.

   В кодах только артикул, без ссылок: при смене адреса приложения
   ссылки бы протухли, а наклейки уже на коробках. */

export const SIZES = [
  // code: высота строки с кодами, qr: сторона квадрата, оба в мм.
  // Считаем от свободного места: высота минус шапка, артикул и поля.
  { id: '30x20', label: '30 × 20 мм', w: 30, h: 20, both: false, code: 7,  qr: 0,  title: 2.0, lines: 1 },
  { id: '40x30', label: '40 × 30 мм', w: 40, h: 30, both: true,  code: 13, qr: 12, title: 2.2, lines: 2 },
  { id: '58x40', label: '58 × 40 мм', w: 58, h: 40, both: true,  code: 18, qr: 16, title: 2.7, lines: 2 },
  { id: '70x50', label: '70 × 50 мм', w: 70, h: 50, both: true,  code: 22, qr: 20, title: 3.0, lines: 2 },
]
export const sizeById = (id) => SIZES.find((s) => s.id === id) || SIZES[1]

function Barcode({ value, width, height }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',        // берёт буквы и дефисы, в отличие от EAN
        displayValue: false,
        margin: 0,
        width: 1.1,
        height: height * 3.8,
      })
    } catch (e) { /* нечитаемый артикул — оставляем пусто */ }
  }, [value, height])
  return <svg ref={ref} style={{ width: `${width}mm`, height: `${height}mm`, display: 'block' }} />
}

function Qr({ value, size }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !value) return
    QRCode.toCanvas(ref.current, value, {
      margin: 0,
      width: 320,                  // с запасом: печать плотнее экрана
      errorCorrectionLevel: 'M',   // наклейка на коробке мнётся и пачкается
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {})
  }, [value])
  return <canvas ref={ref} style={{ width: `${size}mm`, height: `${size}mm`, display: 'block', flexShrink: 0 }} />
}

/* В QR кладём ссылку на товар: голый текст сканер телефона отправляет в поиск.
   Приложение понимает и ссылку, и просто артикул — если адрес когда-то
   сменится, старые наклейки останутся рабочими при ручном вводе. */
export const skuLink = (sku) => {
  if (!sku) return ''
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return base ? `${base}/s/${encodeURIComponent(sku)}` : sku
}

export default function Label({ product, size = '40x30', scale = 1 }) {
  const s = sizeById(size)
  const sku = product?.sku || ''
  const attrs = attrsLine(product)

  // На маленькой наклейке два кода нечитаемы — оставляем штрихкод
  const both = s.both && sku
  const barW = both ? s.w - s.qr - 6.5 : s.w - 5

  return (
    <div className="label-tag" style={{
      width: `${s.w}mm`, height: `${s.h}mm`,
      padding: '1.5mm 2mm',
      boxSizing: 'border-box',
      background: '#fff', color: '#000',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Arial, Helvetica, sans-serif',
      overflow: 'hidden',
      transform: scale !== 1 ? `scale(${scale})` : undefined,
      transformOrigin: 'top left',
    }}>
      <div style={{
        fontSize: `${s.title}mm`, fontWeight: 700, lineHeight: 1.12,
        display: '-webkit-box', WebkitLineClamp: s.lines, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{product?.name}</div>

      {attrs && (
        <div style={{ fontSize: '1.9mm', lineHeight: 1.2, marginTop: '0.5mm', color: '#333',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attrs}</div>
      )}

      {/* Строка кодов фиксированной высоты: иначе QR вылезает за край наклейки */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2mm', marginTop: 'auto', height: `${s.code}mm` }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <Barcode value={sku} width={barW} height={both ? s.code * 0.62 : s.code} />
        </div>
        {both && <Qr value={skuLink(sku)} size={s.qr} />}
      </div>

      <div className="mono" style={{ fontSize: '2mm', letterSpacing: '.02em', textAlign: 'center', marginTop: '0.5mm' }}>
        {sku || '— нет артикула —'}
      </div>
    </div>
  )
}
