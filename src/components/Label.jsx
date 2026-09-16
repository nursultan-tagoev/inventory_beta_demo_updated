import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { attrsLine } from '../lib/attrs'

/* Наклейка на товар. Печатается в реальных миллиметрах — и на обычный
   принтер листом, и на термопринтер поштучно.

   В кодах только артикул, без ссылок: при смене адреса приложения
   ссылки бы протухли, а наклейки уже на коробках. */

export const SIZES = [
  { id: '40x30', label: '40 × 30 мм', w: 40, h: 30, both: true },
  { id: '58x40', label: '58 × 40 мм', w: 58, h: 40, both: true },
  { id: '30x20', label: '30 × 20 мм', w: 30, h: 20, both: false },  // два кода не влезут
  { id: '70x50', label: '70 × 50 мм', w: 70, h: 50, both: true },
]
export const sizeById = (id) => SIZES.find((s) => s.id === id) || SIZES[0]

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
        height: height * 3.2,
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
      width: 220,
      errorCorrectionLevel: 'M',   // наклейка на коробке мнётся и пачкается
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {})
  }, [value])
  return <canvas ref={ref} style={{ width: `${size}mm`, height: `${size}mm`, display: 'block' }} />
}

export default function Label({ product, size = '40x30', scale = 1 }) {
  const s = sizeById(size)
  const sku = product?.sku || ''
  const attrs = attrsLine(product)

  // На маленькой наклейке два кода нечитаемы — оставляем штрихкод
  const both = s.both
  const qrSize = Math.min(s.h - 12, 16)

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
        fontSize: s.w >= 58 ? '2.6mm' : '2.2mm', fontWeight: 700, lineHeight: 1.15,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{product?.name}</div>

      {attrs && (
        <div style={{ fontSize: '1.9mm', lineHeight: 1.2, marginTop: '0.5mm', color: '#333',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attrs}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5mm', marginTop: 'auto' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Barcode value={sku} width={both ? s.w - qrSize - 7 : s.w - 4} height={s.h * 0.28} />
        </div>
        {both && <Qr value={sku} size={qrSize} />}
      </div>

      <div className="mono" style={{ fontSize: '2mm', letterSpacing: '.02em', textAlign: 'center', marginTop: '0.5mm' }}>
        {sku || '— нет артикула —'}
      </div>
    </div>
  )
}
