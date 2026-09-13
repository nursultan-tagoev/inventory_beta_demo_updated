import { fmt } from '../lib/format'

/* Печатный бланк акта. Один компонент на все случаи: создание, просмотр, печать.
   Раньше разметка дублировалась в ActModal и Acts.jsx, из-за чего сохранённый
   акт расходился с тем, что видели при оформлении. */

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export const longDate = (d) => {
  const x = d ? new Date(d) : new Date()
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()} года`
}

/* Сумма прописью. Нужна в акте как обязательный реквизит. */
const ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
  'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот',
  'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

function trio(n, female) {
  const out = []
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10
  if (h) out.push(HUNDREDS[h])
  if (t === 1) out.push(TEENS[o])
  else {
    if (t) out.push(TENS[t])
    if (o) out.push((female ? ONES_F : ONES)[o])
  }
  return out.join(' ')
}

// Правильное окончание: 1 позиция, 2 позиции, 5 позиций
export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

export function amountInWords(value) {
  const total = Math.round((Number(value) || 0) * 100)
  const som = Math.floor(total / 100)
  const tyi = total % 100
  if (som === 0) return `ноль сом ${String(tyi).padStart(2, '0')} тыйын`

  const parts = []
  const mil = Math.floor(som / 1000000)
  const thou = Math.floor((som % 1000000) / 1000)
  const rest = som % 1000

  if (mil) parts.push(trio(mil, false) + ' ' + plural(mil, 'миллион', 'миллиона', 'миллионов'))
  if (thou) parts.push(trio(thou, true) + ' ' + plural(thou, 'тысяча', 'тысячи', 'тысяч'))
  if (rest) parts.push(trio(rest, false))

  const words = parts.join(' ').replace(/\s+/g, ' ').trim()
  return `${words} ${plural(som, 'сом', 'сома', 'сомов')} ${String(tyi).padStart(2, '0')} тыйын`
}

/* Блок подписи: должность, линия, фамилия справа. Подсказок нет — это бумага. */
function Sign({ position, name }) {
  if (!name && !position) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10.5, color: '#5A5A5A', marginBottom: 22, minHeight: 14 }}>{position || ''}</div>
      <div style={{ borderBottom: '1px solid #1A1A1A' }} />
      <div style={{ textAlign: 'right', fontSize: 11, marginTop: 4 }}>{name || ''}</div>
    </div>
  )
}

export default function ActSheet({ act, items = [], innerRef }) {
  const isRet = act.type === 'return'
  const total = items.reduce((a, it) => a + (Number(it.sum) || 0), 0) || Number(act.total_sum) || 0
  const kind = act.act_kind || (isRet
    ? 'возврата товарно-материальных ценностей'
    : 'приёма-передачи товарно-материальных ценностей')

  const cell = { border: '1px solid #A8A8A8', padding: '7px 5px' }
  const th = { ...cell, fontWeight: 600, background: '#F0F0F0' }

  return (
    <div ref={innerRef} className="act-sheet-print" style={{
      background: '#fff', color: '#1A1A1A', padding: '38px 42px',
      fontFamily: "Georgia, 'Times New Roman', serif",
    }}>
      {/* Утверждающий */}
      <div className="approve-row" style={{ textAlign: 'right', marginBottom: 34 }}>
        <div style={{ display: 'inline-block', textAlign: 'left', fontSize: 12, lineHeight: 1.85 }}>
          <div style={{ fontWeight: 700, letterSpacing: '.02em' }}>УТВЕРЖДАЮ</div>
          <div>{act.approver_position || 'Главный бухгалтер'}</div>
          <div>ОАО «Бакай Банк»</div>
          <div style={{ marginTop: 26, display: 'flex', gap: 14, alignItems: 'flex-end' }}>
            <span style={{ borderBottom: '1px solid #1A1A1A', width: 92, height: 1 }} />
            <span style={{ borderBottom: '1px solid #1A1A1A', width: 142, height: 1 }} />
          </div>
          {act.approver_name && (
            <div style={{ display: 'flex', gap: 14, marginTop: 3 }}>
              <span style={{ width: 92 }} />
              <span style={{ width: 142, textAlign: 'center', fontSize: 11 }}>{act.approver_name}</span>
            </div>
          )}
          <div style={{ marginTop: 16, fontSize: 11 }}>«____» ______________ {new Date(act.act_date || Date.now()).getFullYear()} г.</div>
        </div>
      </div>

      {/* Заголовок */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '.04em', lineHeight: 1.4 }}>АКТ</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>{kind}</div>
        <div style={{ fontSize: 11, color: '#5A5A5A', marginTop: 7 }}>№ {act.number}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '26px 0 22px' }}>
        <span>{act.city || 'г. Бишкек'}</span>
        <span>{longDate(act.act_date)}</span>
      </div>

      {/* Отдающая сторона всегда одна — склад маркетинга */}
      <div style={{ fontSize: 12, lineHeight: 1.9, marginBottom: 20, textAlign: 'justify' }}>
        {isRet
          ? 'Нижеуказанные подразделения вернули, а Отдел маркетинга ОАО «Бакай Банк» принял следующие товарно-материальные ценности:'
          : 'Отдел маркетинга ОАО «Бакай Банк» передал, а нижеуказанные подразделения приняли следующие товарно-материальные ценности:'}
      </div>

      <table className="act-tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5, marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 24 }}>№</th>
            <th style={{ ...th, width: 62 }}>Артикул</th>
            <th style={{ ...th, width: 94 }}>Подразделение</th>
            <th style={{ ...th, textAlign: 'left', padding: '7px 7px' }}>Наименование</th>
            <th style={{ ...th, width: 42 }}>Кол-во</th>
            <th style={{ ...th, width: 64 }}>Цена, сом</th>
            <th style={{ ...th, width: 68 }}>Сумма, сом</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id || i}>
              <td data-label="№" style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
              <td data-label="Артикул" style={{ ...cell, textAlign: 'center' }}>{it.sku || '—'}</td>
              <td data-label="Подразделение" style={cell}>{it.dept || '—'}</td>
              <td data-label="Наименование" style={{ ...cell, padding: '7px 7px' }}>{it.name}</td>
              <td data-label="Количество" style={{ ...cell, textAlign: 'center' }}>{it.qty}</td>
              <td data-label="За единицу" style={{ ...cell, textAlign: 'right' }}>{fmt(it.price)}</td>
              <td data-label="Итого (сом)" style={{ ...cell, textAlign: 'right' }}>{fmt(it.sum)}</td>
            </tr>
          ))}
          <tr style={{ background: '#FAFAFA' }}>
            <td colSpan={6} style={{ ...cell, textAlign: 'right', fontWeight: 600, padding: '7px 7px' }}>Итого</td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{fmt(total)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 11, lineHeight: 1.8, marginBottom: 26 }}>
        Всего {isRet ? 'возвращено' : 'передано'} <b>{items.length}</b>{' '}
        {plural(items.length, 'позиция', 'позиции', 'позиций')} на сумму{' '}
        <b>{fmt(total)}</b> ({amountInWords(total)}).
      </div>

      <div style={{ fontSize: 12, lineHeight: 1.85, marginBottom: 32 }}>
        Основание: {act.basis || '—'}
      </div>

      {/* Подписи: до двух с каждой стороны */}
      <div className="sign-row" style={{ display: 'flex', gap: 40, fontSize: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 16, letterSpacing: '.02em' }}>
            {isRet ? 'ВЕРНУЛИ' : 'ПЕРЕДАЛИ'}
          </div>
          <Sign position={act.giver_position} name={act.giver_name} />
          <Sign position={act.giver2_position} name={act.giver2_name} />
          <div style={{ fontSize: 10.5, marginTop: 4 }}>«____» __________ {new Date(act.act_date || Date.now()).getFullYear()} г.</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 16, letterSpacing: '.02em' }}>ПРИНЯЛИ</div>
          <Sign position={act.recipient_position} name={act.recipient_name} />
          <Sign position={act.recipient2_position} name={act.recipient2_name} />
          <div style={{ fontSize: 10.5, marginTop: 4 }}>«____» __________ {new Date(act.act_date || Date.now()).getFullYear()} г.</div>
        </div>
      </div>
    </div>
  )
}
