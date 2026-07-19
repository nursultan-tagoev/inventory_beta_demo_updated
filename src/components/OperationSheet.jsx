import { useState, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { Btn, Field, Input, Select, Confirm, useToast } from './ui'
import { som } from '../lib/format'
import { saveMovement, stockAt } from '../lib/ops'
import { chainOf } from '../lib/data'
import { norm, parseQty, matchName, askLucy } from '../lib/lucy'
import ActModal from './ActModal'

const TL = { in: 'Приход', out: 'Выдача', return: 'Возврат', writeoff: 'Списание', transfer: 'Перемещение' }
const TC = { in: 'var(--gr)', out: 'var(--ink)', return: 'var(--pu)', writeoff: 'var(--rd)', transfer: 'var(--am-m)' }
const ICO = { in: '📥', out: '📤', return: '🔄', writeoff: '🗑', transfer: '⇄' }

export default function OperationSheet({ type, data, profile, can, onDone }) {
  const toast = useToast()
  const { products, recipients, suppliers, branches, directions, productTypes, campaigns, locations, warehouses, stockByWh } = data
  const steps = type === 'in' ? 2 : type === 'writeoff' || type === 'transfer' ? 1 : 3
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [showNewProd, setShowNewProd] = useState(false)
  const [newProd, setNewProd] = useState({ name: '', sku: '', price: '', direction_id: '', product_type_id: '', campaign_id: '' })
  const [createdProd, setCreatedProd] = useState(null)
  const [showNewRec, setShowNewRec] = useState(false)
  const [newRec, setNewRec] = useState({ name: '', branch_id: '' })
  const [dictating, setDictating] = useState(false)
  const [act, setAct] = useState(null)
  const [f, setF] = useState({
    product_id: '', qty: 1, recipient_id: '', branch_id: '',
    warehouse_id: warehouses[0]?.id || '', warehouse_to_id: '', location_id: '',
    supplier_id: suppliers[0]?.id || '', purpose: '', due_date: '', sz: '', condition: 'хорошее', direction_id: '', notes: '',
    on_time: true, has_defects: false, defects: 0, delivery_comment: '',
  })
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const selProd = useMemo(() => products.find((p) => p.id == f.product_id) || createdProd, [f.product_id, products, createdProd])
  const selRec = recipients.find((r) => r.id == f.recipient_id)
  const whLocations = locations.filter((l) => !f.warehouse_id || l.warehouse_id == f.warehouse_id)
  const availHere = selProd && f.warehouse_id ? stockAt(stockByWh, selProd.id, f.warehouse_id) : 0
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

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
    rec.onresult = (e) => fillFrom(e.results[0][0].transcript)
    rec.onerror = () => setDictating(false); rec.onend = () => setDictating(false)
    try { rec.start() } catch (e) { setDictating(false) }
  }

  const createProduct = async () => {
    if (!newProd.name.trim()) return toast('Введите название', 'error')
    const { data: d, error } = await supabase.from('products').insert({ name: newProd.name.trim(), sku: newProd.sku || null, price: Number(newProd.price) || 0, campaign_id: newProd.campaign_id ? Number(newProd.campaign_id) : null, direction_id: newProd.direction_id ? Number(newProd.direction_id) : null, archived: false }).select().single()
    if (error) return toast('Ошибка: ' + error.message, 'error')
    up('product_id', d.id); setCreatedProd(d); setShowNewProd(false); setNewProd({ name: '', sku: '', price: '', direction_id: '', product_type_id: '', campaign_id: '' }); toast('Товар создан')
  }
  const createRecipient = async () => {
    if (!newRec.name.trim()) return toast('Введите имя', 'error')
    const { data: d, error } = await supabase.from('recipients').insert({ name: newRec.name.trim(), branch_id: Number(newRec.branch_id) || null }).select().single()
    if (error) return toast('Ошибка: ' + error.message, 'error')
    up('recipient_id', d.id); if (d.branch_id) up('branch_id', d.branch_id); setShowNewRec(false); setNewRec({ name: '', branch_id: '' }); toast('Получатель добавлен')
  }

  const doSave = async () => {
    setLoading(true)
    // Приход с браком — оприходуем только годное
    const defects = type === 'in' && f.has_defects ? (Number(f.defects) || 0) : 0
    const goodQty = type === 'in' ? Math.max(0, (Number(f.qty) || 0) - defects) : f.qty
    if (type === 'in' && goodQty <= 0) { setLoading(false); toast('Нечего приходовать — весь товар бракованный', 'error'); return }

    const { error } = await saveMovement({ ...f, qty: goodQty, type, issuer_id: profile.id, branch_id: f.branch_id || selRec?.branch_id }, stockByWh)

    // Оценка поставки
    if (!error && type === 'in' && f.supplier_id) {
      try {
        await supabase.from('deliveries').insert({
          supplier_id: Number(f.supplier_id), on_time: f.on_time,
          defects, comment: f.delivery_comment || null,
        })
      } catch (e) {}
    }
    setLoading(false)
    if (error) return toast(error, 'error')
    toast(TL[type] + ' сохранена')
    if ((type === 'out' || type === 'return') && selProd) {
      setAct({ type, items: [{ name: selProd.name, sku: selProd.sku, price: selProd.price, qty: Number(f.qty), product_id: selProd.id, warehouse_id: Number(f.warehouse_id) }], recipient: selRec?.name || '', recipient_id: selRec?.id || null, purpose: f.purpose, branch_id: f.branch_id || selRec?.branch_id || null, branchName: branches.find((b) => b.id === (f.branch_id || selRec?.branch_id))?.name })
    } else { onDone() }
  }
  const next = () => { if (step < steps) setStep(step + 1); else setConfirm(true) }

  if (act) return (<div>
    <div style={{ textAlign: 'center', padding: '10px 0 18px' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
      <div className="ff" style={{ fontSize: 19, fontWeight: 600 }}>{TL[act.type]} сохранена</div>
      <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 4 }}>Сформировать акт приёма-передачи?</div>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <Btn v="secondary" onClick={onDone} style={{ flex: 1 }}>Позже</Btn>
      <Btn onClick={() => setAct({ ...act, open: true })} style={{ flex: 1 }}>🧾 Сформировать акт</Btn>
    </div>
    {act.open && <ActModal init={act} profile={profile} onClose={() => { setAct(null); onDone() }} onSaved={() => {}} />}
  </div>)

  const whName = (id) => warehouses.find((w) => w.id == id)?.name || '—'
  const canNext = f.product_id && f.warehouse_id && (type !== 'transfer' || (f.warehouse_to_id && f.warehouse_to_id != f.warehouse_id))

  return (
    <div>
      {confirm && <Confirm title={`Подтвердить: ${TL[type]}?`} danger={type === 'writeoff'}
        message={type === 'transfer'
          ? `Переместить ${f.qty} шт «${selProd?.name || '—'}»: ${whName(f.warehouse_id)} → ${whName(f.warehouse_to_id)}`
          : `${TL[type]} ${f.qty} шт «${selProd?.name || '—'}»${selRec ? (type === 'return' ? ' от ' : ' для ') + selRec.name : ''} · склад ${whName(f.warehouse_id)}`}
        onOk={() => { setConfirm(false); doSave() }} onCancel={() => setConfirm(false)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 22 }}>{ICO[type]}</span>
        <span className="ff" style={{ fontSize: 19, fontWeight: 600, color: TC[type] }}>{TL[type]}</span>
        {steps > 1 && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx3)' }}>Шаг {step} из {steps}</span>}
      </div>

      {step === 1 && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {type === 'transfer' && <div style={{ display: 'flex', gap: 9, padding: '10px 13px', background: 'var(--am-l)', borderRadius: 10, fontSize: 12.5, color: 'var(--am-m)' }}>
          <span>ℹ️</span><span>Перемещение между складами: спишется с одного, придёт на другой.</span>
        </div>}

        {type !== 'transfer' && <button onClick={dictate} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, border: `1px solid ${dictating ? 'var(--gr)' : 'var(--brd2)'}`, background: dictating ? 'var(--gr-l)' : 'var(--ink-l)', color: dictating ? 'var(--gr-m)' : 'var(--ink)', fontWeight: 600, fontSize: 13 }}>
          <span style={{ fontSize: 17 }}>🎙</span>{dictating ? 'Слушаю… говорите' : 'Надиктовать Люси — «10 футболок UFC для Айгерим»'}
        </button>}

        <Field label="Товар">
          <Select value={f.product_id} onChange={(e) => { if (e.target.value === 'new') setShowNewProd(true); else { up('product_id', e.target.value); setCreatedProd(null) } }}>
            <option value="">— выбрать товар —</option>
            {createdProd && <option value={createdProd.id}>{createdProd.name} (новый)</option>}
            {products.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
            <option value="new">➕ Добавить новый товар</option>
          </Select>
        </Field>
        {showNewProd && <div className="card" style={{ padding: 14, background: 'var(--bg)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>Новый товар</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <Field label="Название"><Input value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} autoFocus /></Field>
            <Field label="Артикул"><Input value={newProd.sku} onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })} /></Field>
            <Field label="Цена"><Input type="number" value={newProd.price} onChange={(e) => setNewProd({ ...newProd, price: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <Field label="Направление">
              <Select value={newProd.direction_id} onChange={(e) => setNewProd({ ...newProd, direction_id: e.target.value, product_type_id: '', campaign_id: '' })}>
                <option value="">—</option>{directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Тип">
              <Select value={newProd.product_type_id} onChange={(e) => setNewProd({ ...newProd, product_type_id: e.target.value, campaign_id: '' })}>
                <option value="">—</option>{productTypes.filter((t) => !newProd.direction_id || t.direction_id == newProd.direction_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Кампания">
              <Select value={newProd.campaign_id} onChange={(e) => setNewProd({ ...newProd, campaign_id: e.target.value })}>
                <option value="">—</option>{campaigns.filter((c) => !newProd.product_type_id || c.product_type_id == newProd.product_type_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 10 }}>Цепочку можно оставить пустой — товар попадёт в «Без категории», заполните позже.</div>
          <div style={{ display: 'flex', gap: 8 }}><Btn size="sm" onClick={createProduct}>Создать и продолжить</Btn><Btn size="sm" v="secondary" onClick={() => setShowNewProd(false)}>Отмена</Btn></div>
        </div>}
        {selProd && chainOf(selProd, { directions, productTypes, campaigns }) && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '9px 12px', background: 'var(--sur)', border: '1px solid var(--brd)', borderRadius: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{selProd.name}</span>
          <span style={{ fontSize: 11.5, color: 'var(--tx3)', marginLeft: 4 }}>{chainOf(selProd, { directions, productTypes, campaigns })}</span>
        </div>}

        {/* Склад-источник / склад прихода — ОБЯЗАТЕЛЕН */}
        <Field label={type === 'in' ? 'Склад (куда принимаем)' : type === 'return' ? 'Склад (куда возвращаем)' : type === 'transfer' ? 'Со склада' : 'Склад-источник'}>
          <Select value={f.warehouse_id} onChange={(e) => { up('warehouse_id', e.target.value); up('location_id', '') }}>
            <option value="">— выбрать склад —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>

        {selProd && f.warehouse_id && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', background: availHere > 0 ? 'var(--ink-l)' : 'var(--rd-l)', borderRadius: 10, fontSize: 12.5, color: availHere > 0 ? 'var(--ink)' : 'var(--rd-m)' }}>
          <span className="mono" style={{ fontWeight: 700, fontSize: 16 }}>{availHere} шт</span>
          <span>на складе {whName(f.warehouse_id)}{selProd.price ? ` · ${som(selProd.price)} за шт.` : ''}</span>
        </div>}

        {type === 'transfer' && <>
          <div style={{ textAlign: 'center', color: 'var(--am-m)', fontSize: 18, margin: '-4px 0' }}>↓</div>
          <Field label="На склад">
            <Select value={f.warehouse_to_id} onChange={(e) => up('warehouse_to_id', e.target.value)}>
              <option value="">— выбрать склад —</option>
              {warehouses.filter((w) => w.id != f.warehouse_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
        </>}

        <Field label="Количество"><Input type="number" value={f.qty} onChange={(e) => up('qty', e.target.value)} /></Field>

        {/* Место хранения — подсказка, только для прихода/возврата */}
        {(type === 'in' || type === 'return') && whLocations.length > 0 && <Field label="Место (полка/комната)">
          <Select value={f.location_id} onChange={(e) => up('location_id', e.target.value)}>
            <option value="">— не указано —</option>
            {whLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>}

        {type === 'in' && suppliers.length > 0 && <Field label="Поставщик"><Select value={f.supplier_id} onChange={(e) => up('supplier_id', e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
        {type === 'transfer' && <Field label="Примечание"><Input value={f.notes} onChange={(e) => up('notes', e.target.value)} placeholder="Необязательно" /></Field>}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Btn onClick={next} disabled={!canNext} loading={loading && steps === 1} style={{ flex: 1 }}>
            {type === 'writeoff' ? 'Списать' : type === 'transfer' ? 'Переместить' : 'Далее →'}
          </Btn>
        </div>
      </div>}

      {step === 2 && type === 'in' && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Оценка поставки */}
        {f.supplier_id && <div className="card" style={{ padding: 14, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
            <span style={{ fontSize: 15 }}>⭐</span>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Как прошла поставка</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>необязательно</span>
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>Срок</div>
          <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
            {[[true, 'В срок', 'var(--gr)', 'var(--gr-l)', 'var(--gr-m)'], [false, 'С опозданием', 'var(--am)', 'var(--am-l)', 'var(--am-m)']].map(([v, l, bc, bg, cl]) => (
              <button key={String(v)} onClick={() => up('on_time', v)} style={{
                flex: 1, minHeight: 44, borderRadius: 11, fontSize: 12, fontWeight: f.on_time === v ? 600 : 500,
                border: `1px solid ${f.on_time === v ? bc : 'var(--brd2)'}`,
                background: f.on_time === v ? bg : 'var(--sur)', color: f.on_time === v ? cl : 'var(--tx2)',
              }}>{l}</button>
            ))}
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>Качество</div>
          <div style={{ display: 'flex', gap: 7, marginBottom: f.has_defects ? 11 : 12 }}>
            {[[false, 'Без замечаний', 'var(--gr)', 'var(--gr-l)', 'var(--gr-m)'], [true, 'Есть брак', 'var(--rd)', 'var(--rd-l)', 'var(--rd-m)']].map(([v, l, bc, bg, cl]) => (
              <button key={String(v)} onClick={() => up('has_defects', v)} style={{
                flex: 1, minHeight: 44, borderRadius: 11, fontSize: 12, fontWeight: f.has_defects === v ? 600 : 500,
                border: `1px solid ${f.has_defects === v ? bc : 'var(--brd2)'}`,
                background: f.has_defects === v ? bg : 'var(--sur)', color: f.has_defects === v ? cl : 'var(--tx2)',
              }}>{l}</button>
            ))}
          </div>

          {f.has_defects && <div style={{ padding: '11px 12px', background: 'var(--rd-l)', borderRadius: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--rd-m)', marginBottom: 6 }}>Сколько бракованных</div>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
              <Input type="number" inputMode="numeric" value={f.defects} onChange={(e) => up('defects', Math.max(0, Number(e.target.value) || 0))} style={{ width: 84 }} />
              <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>
                из {f.qty || 0} · оприходуем <b className="mono">{Math.max(0, (Number(f.qty) || 0) - (Number(f.defects) || 0))}</b>
              </span>
            </div>
          </div>}

          <Field label="Комментарий"><Input value={f.delivery_comment} onChange={(e) => up('delivery_comment', e.target.value)} placeholder="Что отметить по поставке" /></Field>
        </div>}

        <Field label="Примечание"><Input value={f.notes} onChange={(e) => up('notes', e.target.value)} placeholder="Необязательно" /></Field>
        <div style={{ display: 'flex', gap: 8 }}><Btn v="secondary" onClick={() => setStep(1)}>← Назад</Btn><Btn loading={loading} onClick={() => setConfirm(true)} style={{ flex: 1 }}>Сохранить приход</Btn></div>
      </div>}

      {step === 2 && (type === 'out' || type === 'return') && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label={type === 'out' ? 'Получатель' : 'Возврат от'}>
          <Select value={f.recipient_id} onChange={(e) => { if (e.target.value === 'new') setShowNewRec(true); else { up('recipient_id', e.target.value); const r = recipients.find((x) => x.id == e.target.value); if (r?.branch_id) up('branch_id', r.branch_id) } }}>
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
        {/* Филиал-адресат — куда уходит товар */}
        {type === 'out' && branches.length > 0 && <Field label="Филиал-адресат (куда)">
          <Select value={f.branch_id} onChange={(e) => up('branch_id', e.target.value)}>
            <option value="">— выбрать филиал —</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>}
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
        <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, fontSize: 12.5, color: 'var(--tx2)' }}>
          <b style={{ color: 'var(--tx)' }}>{selProd?.name}</b> × {f.qty} шт · склад {whName(f.warehouse_id)}{selRec ? <> · {selRec.name}</> : null}
        </div>
        <div style={{ display: 'flex', gap: 8 }}><Btn v="secondary" onClick={() => setStep(2)}>← Назад</Btn><Btn loading={loading} onClick={() => setConfirm(true)} style={{ flex: 1 }}>Сохранить</Btn></div>
      </div>}
    </div>
  )
}
