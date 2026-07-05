import { useState, useMemo, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Field, Input, Select, Confirm, useToast } from './ui'
import { som } from '../lib/format'
import { saveMovement } from '../lib/ops'
import { norm, parseQty, matchName, askLucy } from '../lib/lucy'
import ActModal from './ActModal'

const TL = { in: 'Приход', out: 'Выдача', return: 'Возврат', writeoff: 'Списание' }
const TC = { in: 'var(--gr)', out: 'var(--ink)', return: 'var(--pu)', writeoff: 'var(--rd)' }
const ICO = { in: '📥', out: '📤', return: '🔄', writeoff: '🗑' }

export default function OperationSheet({ type, data, profile, can, onDone }) {
  const toast = useToast()
  const { products, recipients, suppliers, branches, directions, stock } = data
  const steps = type === 'in' ? 2 : type === 'writeoff' ? 1 : 3
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [showNewProd, setShowNewProd] = useState(false)
  const [newProd, setNewProd] = useState({ name: '', sku: '', price: '' })
  const [createdProd, setCreatedProd] = useState(null)
  const [showNewRec, setShowNewRec] = useState(false)
  const [newRec, setNewRec] = useState({ name: '', branch_id: '' })
  const [dictating, setDictating] = useState(false)
  const [act, setAct] = useState(null)   // данные для акта после сохранения
  const [f, setF] = useState({ product_id: '', qty: 1, recipient_id: '', branch_id: '', supplier_id: suppliers[0]?.id || '', purpose: '', due_date: '', sz: '', condition: 'хорошее', direction_id: '', notes: '' })
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const selProd = useMemo(() => products.find((p) => p.id == f.product_id) || createdProd, [f.product_id, products, createdProd])
  const selRec = recipients.find((r) => r.id == f.recipient_id)
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  // ── голосовой ввод: Люси заполняет поля ──
  const fillFrom = async (text) => {
    let productName = null, qty = null, recipientName = null
    try {
      const res = await askLucy(text, profile?.role || 'employee', [])
      if (res?.call?.name === 'create_operation') {
        const a = res.call.args || {}
        const it = (a.items && a.items[0]) || (a.product ? { product: a.product, quantity: a.quantity } : null)
        if (it) { productName = it.product; qty = it.quantity }
        recipientName = a.recipient
      }
    } catch (e) {}
    const low = norm(text)
    if (!productName) productName = matchName(low, products.filter((p) => !p.archived).map((p) => p.name))
    if (qty == null) qty = parseQty(low)
    if (!recipientName) recipientName = matchName(low, recipients.map((r) => r.name))
    const p = products.find((x) => x.name === matchName(norm(productName || ''), products.map((pp) => pp.name)) || x.name === productName)
    if (p) up('product_id', p.id)
    if (qty != null) up('qty', qty)
    const r = recipients.find((x) => x.name === matchName(norm(recipientName || ''), recipients.map((rr) => rr.name)) || x.name === recipientName)
    if (r) { up('recipient_id', r.id); if (r.branch_id) up('branch_id', r.branch_id) }
    if (p || qty != null || r) toast('Люси заполнила — проверьте')
    else toast('Не расслышала, попробуйте ещё раз', 'warn')
  }
  const dictate = () => {
    if (!SR) { toast('Голос доступен в Chrome/Edge', 'warn'); return }
    const rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = false; rec.maxAlternatives = 1
    setDictating(true)
    rec.onresult = (e) => { const t = e.results[0][0].transcript; fillFrom(t) }
    rec.onerror = () => setDictating(false); rec.onend = () => setDictating(false)
    try { rec.start() } catch (e) { setDictating(false) }
  }

  const createProduct = async () => {
    if (!newProd.name.trim()) return toast('Введите название', 'error')
    const { data: d, error } = await supabase.from('products').insert({ name: newProd.name.trim(), sku: newProd.sku || null, price: Number(newProd.price) || 0, archived: false }).select().single()
    if (error) return toast('Ошибка: ' + error.message, 'error')
    up('product_id', d.id); setCreatedProd(d); setShowNewProd(false); setNewProd({ name: '', sku: '', price: '' }); toast('Товар создан')
  }
  const createRecipient = async () => {
    if (!newRec.name.trim()) return toast('Введите имя', 'error')
    const { data: d, error } = await supabase.from('recipients').insert({ name: newRec.name.trim(), branch_id: Number(newRec.branch_id) || null }).select().single()
    if (error) return toast('Ошибка: ' + error.message, 'error')
    up('recipient_id', d.id); if (d.branch_id) up('branch_id', d.branch_id); setShowNewRec(false); setNewRec({ name: '', branch_id: '' }); toast('Получатель добавлен')
  }

  const doSave = async () => {
    setLoading(true)
    const { error } = await saveMovement({ ...f, type, issuer_id: profile.id, branch_id: f.branch_id || selRec?.branch_id, location_id: selProd?.location_id }, stock)
    setLoading(false)
    if (error) return toast(error, 'error')
    toast(TL[type] + ' сохранена')
    if ((type === 'out' || type === 'return') && selProd) {
      setAct({ type, items: [{ name: selProd.name, sku: selProd.sku, price: selProd.price, qty: Number(f.qty), product_id: selProd.id }], recipient: selRec?.name || '', recipient_id: selRec?.id || null, purpose: f.purpose, branch_id: f.branch_id || selRec?.branch_id || null, branchName: branches.find((b) => b.id === (f.branch_id || selRec?.branch_id))?.name })
    } else { onDone() }
  }
  const next = () => { if (step < steps) setStep(step + 1); else setConfirm(true) }

  // экран после сохранения выдачи/возврата — предложить акт
  if (act) return (<div>
    <div style={{ textAlign: 'center', padding: '10px 0 18px' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
      <div className="ff" style={{ fontSize: 19, fontWeight: 600 }}>{TL[act.type]} сохранена</div>
      <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 4 }}>Сформировать акт приёма-передачи?</div>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <Btn v="secondary" onClick={onDone} style={{ flex: 1 }}>Не нужно</Btn>
      <Btn onClick={() => setAct({ ...act, open: true })} style={{ flex: 1 }}>🧾 Сформировать акт</Btn>
    </div>
    {act.open && <ActModal init={act} profile={profile} onClose={() => { setAct(null); onDone() }} onSaved={() => {}} />}
  </div>)

  return (
    <div>
      {confirm && <Confirm title={`Подтвердить: ${TL[type]}?`} danger={type === 'writeoff'}
        message={`${TL[type]} ${f.qty} шт «${selProd?.name || '—'}»${selRec ? (type === 'return' ? ' от ' : ' для ') + selRec.name : ''}`}
        onOk={() => { setConfirm(false); doSave() }} onCancel={() => setConfirm(false)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 22 }}>{ICO[type]}</span>
        <span className="ff" style={{ fontSize: 19, fontWeight: 600, color: TC[type] }}>{TL[type]}</span>
        {steps > 1 && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx3)' }}>Шаг {step} из {steps}</span>}
      </div>

      {step === 1 && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button onClick={dictate} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, border: `1px solid ${dictating ? 'var(--gr)' : 'var(--brd2)'}`, background: dictating ? 'var(--gr-l)' : 'var(--ink-l)', color: dictating ? 'var(--gr-m)' : 'var(--ink)', fontWeight: 600, fontSize: 13 }}>
          <span style={{ fontSize: 17 }}>🎙</span>{dictating ? 'Слушаю… говорите' : 'Надиктовать Люси — например «10 футболок UFC для Айгерим»'}
        </button>
        <Field label="Товар">
          <Select value={f.product_id} onChange={(e) => { if (e.target.value === 'new') setShowNewProd(true); else { up('product_id', e.target.value); setCreatedProd(null) } }}>
            <option value="">— выбрать товар —</option>
            {createdProd && <option value={createdProd.id}>{createdProd.name} (новый)</option>}
            {products.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
            <option value="new">➕ Добавить новый товар</option>
          </Select>
        </Field>
        {showNewProd && <div className="card" style={{ padding: 14, background: 'var(--bg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <Field label="Название"><Input value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} autoFocus /></Field>
            <Field label="Артикул"><Input value={newProd.sku} onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })} /></Field>
            <Field label="Цена"><Input type="number" value={newProd.price} onChange={(e) => setNewProd({ ...newProd, price: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><Btn size="sm" onClick={createProduct}>Сохранить</Btn><Btn size="sm" v="secondary" onClick={() => setShowNewProd(false)}>Отмена</Btn></div>
        </div>}
        {selProd && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', background: 'var(--ink-l)', borderRadius: 10, fontSize: 12.5, color: 'var(--ink)' }}>
          <span className="mono" style={{ fontWeight: 700, fontSize: 16 }}>{stock?.[selProd.id] || 0} шт</span><span>на складе · {som(selProd.price)} за шт.</span>
        </div>}
        <Field label="Количество"><Input type="number" value={f.qty} onChange={(e) => up('qty', e.target.value)} /></Field>
        {type === 'in' && suppliers.length > 0 && <Field label="Поставщик"><Select value={f.supplier_id} onChange={(e) => up('supplier_id', e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}><Btn onClick={next} disabled={!f.product_id} style={{ flex: 1 }}>{type === 'writeoff' ? 'Списать' : 'Далее →'}</Btn></div>
      </div>}

      {step === 2 && type === 'in' && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {directions.length > 0 && <Field label="Направление"><Select value={f.direction_id} onChange={(e) => up('direction_id', e.target.value)}><option value="">— не указано —</option>{directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>}
        <Field label="Примечание"><Input value={f.notes} onChange={(e) => up('notes', e.target.value)} placeholder="Необязательно" /></Field>
        <div style={{ display: 'flex', gap: 8 }}><Btn v="secondary" onClick={() => setStep(1)}>← Назад</Btn><Btn loading={loading} onClick={() => setConfirm(true)} style={{ flex: 1 }}>Сохранить приход</Btn></div>
      </div>}

      {step === 2 && (type === 'out' || type === 'return') && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label={type === 'out' ? 'Получатель' : 'Возврат от'}>
          <Select value={f.recipient_id} onChange={(e) => { if (e.target.value === 'new') setShowNewRec(true); else up('recipient_id', e.target.value) }}>
            <option value="">— выбрать —</option>
            {recipients.map((r) => <option key={r.id} value={r.id}>{r.name}{r.branch_id ? ` (${branches.find((b) => b.id === r.branch_id)?.name || ''})` : ''}</option>)}
            <option value="new">➕ Добавить получателя</option>
          </Select>
        </Field>
        {showNewRec && <div className="card" style={{ padding: 14, background: 'var(--bg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
            <Field label="Имя"><Input value={newRec.name} onChange={(e) => setNewRec({ ...newRec, name: e.target.value })} autoFocus /></Field>
            <Field label="Филиал"><Select value={newRec.branch_id} onChange={(e) => setNewRec({ ...newRec, branch_id: e.target.value })}><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><Btn size="sm" onClick={createRecipient}>Сохранить</Btn><Btn size="sm" v="secondary" onClick={() => setShowNewRec(false)}>Отмена</Btn></div>
        </div>}
        {type === 'return' && <Field label="Состояние"><Select value={f.condition} onChange={(e) => up('condition', e.target.value)}><option value="хорошее">Хорошее</option><option value="б/у">Б/у</option><option value="брак">Брак</option></Select></Field>}
        <div style={{ display: 'flex', gap: 8 }}><Btn v="secondary" onClick={() => setStep(1)}>← Назад</Btn><Btn onClick={next} style={{ flex: 1 }}>Далее →</Btn></div>
      </div>}

      {step === 3 && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {type === 'out' && <>
          <Field label="Цель / мероприятие"><Input value={f.purpose} onChange={(e) => up('purpose', e.target.value)} placeholder="Конференция, акция…" /></Field>
          <Field label="Вернуть до (необязательно)"><Input type="date" value={f.due_date} onChange={(e) => up('due_date', e.target.value)} /></Field>
          <Field label="Номер СЗ"><Input value={f.sz} onChange={(e) => up('sz', e.target.value)} placeholder="СЗ-001" /></Field>
        </>}
        <Field label="Примечание"><Input value={f.notes} onChange={(e) => up('notes', e.target.value)} /></Field>
        <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, fontSize: 12.5, color: 'var(--tx2)' }}>Товар: <b style={{ color: 'var(--tx)' }}>{selProd?.name}</b> × {f.qty} шт{selRec ? <> · {selRec.name}</> : null}</div>
        <div style={{ display: 'flex', gap: 8 }}><Btn v="secondary" onClick={() => setStep(2)}>← Назад</Btn><Btn loading={loading} onClick={() => setConfirm(true)} style={{ flex: 1 }}>Сохранить</Btn></div>
      </div>}
    </div>
  )
}
