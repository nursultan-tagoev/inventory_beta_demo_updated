import { useState, useMemo, useEffect } from 'react'
import { Btn, Sheet, useToast } from '../components/ui'
import { chainOf, freeAll } from '../lib/data'
import { fmt } from '../lib/format'
import { attrsLine } from '../lib/attrs'
import { issueBasket } from '../lib/issueBasket'
import { listTemplates, saveTemplate, deleteTemplate, expandTemplate } from '../lib/templates'
import Scanner from '../components/Scanner'
import { supabase } from '../supabaseClient'
import { cameraOn } from '../lib/integrations'

const SEC = 'var(--sec-cat)', SEC_L = 'var(--sec-cat-l)'

/* Каталог для заявителей: что можно запросить.
   Точных остатков нет — только метка наличия. */
export default function Catalog({ data, profile, onRequest, scanSku, onScanUsed }) {
  /* Одна витрина на всех, но действие разное: заявитель просит, склад выдаёт */
  const isWh = ['admin', 'warehouse'].includes(profile?.role)
  const [issue, setIssue] = useState(null)   // окно оформления выдачи
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState(false)


  /* Шаблоны: заявители набирают одно и то же на каждую акцию */
  const [tpls, setTpls] = useState([])
  const [tplOpen, setTplOpen] = useState(false)
  const [tplName, setTplName] = useState('')
  useEffect(() => { if (profile?.id) listTemplates(profile.id).then(setTpls) }, [profile?.id])
  const toast = useToast()
  const { products, directions, productTypes, campaigns, freeByWh, stockByWh } = data
  const [q, setQ] = useState('')
  const [hier, setHier] = useState({ direction_id: '', product_type_id: '', campaign_id: '' })
  const [draft, setDraft] = useState([])       // корзина: заявка или выдача
  const [pick, setPick] = useState(null)       // выбранный товар

  // Пришли по наклейке — показываем товар в поиске
  useEffect(() => {
    if (!scanSku || !products?.length) return
    const p = products.find((x) => (x.sku || '').toUpperCase() === scanSku.toUpperCase())
    setQ(p ? p.name : scanSku)
    onScanUsed?.()
  }, [scanSku, products])


  /* Корзина: количество правится и на карточке, и в списке внизу */
  const inDraft = (id) => {
    const d = draft.find((x) => x.product_id === id)
    return d ? d.qty : null
  }
  const putInDraft = (p, n) => setDraft((s) => [...s, { product_id: p.id, name: p.name, qty: n }])
  const setQtyFor = (p, v) => {
    const n = Math.max(0, Number(String(v).replace(/[^0-9]/g, '')) || 0)
    setDraft((s) => (n === 0 ? s.filter((x) => x.product_id !== p.id)
      : s.map((x) => (x.product_id === p.id ? { ...x, qty: n } : x))))
  }
  // Итог заявки: цены позиций специалисту не показываем, общий масштаб — да
  const draftSum = draft.reduce((a, d) => {
    const p = products.find((x) => x.id === d.product_id)
    return a + d.qty * (Number(p?.price) || 0)
  }, 0)

  const bump = (id, d) => setDraft((s) => s
    .map((x) => (x.product_id === id ? { ...x, qty: Math.max(0, x.qty + d) } : x))
    .filter((x) => x.qty > 0))
  const [qty, setQty] = useState(1)

  const types = hier.direction_id ? productTypes.filter((t) => t.direction_id == hier.direction_id) : productTypes
  const camps = hier.product_type_id ? campaigns.filter((c) => c.product_type_id == hier.product_type_id) : campaigns

  const inHier = (p) => {
    if (hier.campaign_id && p.campaign_id != hier.campaign_id) return false
    if (hier.product_type_id) {
      const c = campaigns.find((x) => x.id === p.campaign_id)
      if ((c?.product_type_id || p.product_type_id) != hier.product_type_id) return false
    }
    if (hier.direction_id) {
      const c = campaigns.find((x) => x.id === p.campaign_id)
      const t = productTypes.find((x) => x.id === (c?.product_type_id || p.product_type_id))
      if ((t?.direction_id || p.direction_id) != hier.direction_id) return false
    }
    return true
  }

  const list = products.filter((p) => !p.archived
    && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku || '').toLowerCase().includes(q.toLowerCase()))
    && inHier(p))

  // Метка наличия без цифр
  const avail = (p) => {
    const free = freeAll(freeByWh, stockByWh, p.id)
    // Складу нужны цифры, заявителю — метка: точный остаток его только смущает
    if (free <= 0) return [isWh ? 'нет на складе' : 'нет', 'var(--sur2)', 'var(--tx3)', 'bad']
    if (free <= 10) return [isWh ? `осталось ${free}` : 'мало', 'var(--am-l)', 'var(--am-m)', 'warn']
    return [isWh ? `на складе ${free}` : 'есть', 'var(--gr-l)', 'var(--gr-m)', 'ok']
  }

  const addToDraft = () => {
    if (!pick || qty < 1) return
    const free = freeAll(freeByWh, stockByWh, pick.id)
    if (qty > free) return toast(`Свободно только ${free}`, 'error')
    setDraft((d) => {
      const ex = d.find((x) => x.product_id === pick.id)
      return ex ? d.map((x) => x.product_id === pick.id ? { ...x, qty: x.qty + qty } : x)
                : [...d, { product_id: pick.id, name: pick.name, qty }]
    })
    setPick(null); setQty(1); toast('Добавлено в заявку')
  }

  const selS = { minHeight: 40, padding: '0 12px', borderRadius: 11, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 12.5, color: 'var(--tx)' }
  const hierActive = hier.direction_id || hier.product_type_id || hier.campaign_id

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 18px 90px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 20, fontWeight: 600 }}>{isWh ? 'Выдача' : 'Каталог'}</span>
        {cameraOn(data.integrations) && (
          <button onClick={() => setScan(true)} title="Сканировать код"
            style={{ marginLeft: 'auto', minHeight: 38, width: 44, borderRadius: 9, border: '1px solid var(--brd)', background: 'var(--sur)', fontSize: 16 }}>📷</button>
        )}
        {!isWh && (
          <button onClick={() => setTplOpen(true)}
            style={{ minHeight: 38, padding: '0 13px', borderRadius: 9, border: '1px solid var(--brd)', background: 'var(--sur)', color: 'var(--tx2)', fontSize: 12.5, fontWeight: 600 }}>
            Шаблоны{tpls.length ? ` · ${tpls.length}` : ''}
          </button>
        )}
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>что можно запросить</span>
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск товара…"
          style={{ ...selS, flex: 1, minWidth: 150, padding: '0 13px' }} />
        <select value={hier.direction_id} onChange={(e) => setHier({ direction_id: e.target.value, product_type_id: '', campaign_id: '' })} style={selS}>
          <option value="">Направление</option>
          {directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={hier.product_type_id} onChange={(e) => setHier({ ...hier, product_type_id: e.target.value, campaign_id: '' })} style={selS}>
          <option value="">Тип</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={hier.campaign_id} onChange={(e) => setHier({ ...hier, campaign_id: e.target.value })} style={selS}>
          <option value="">Кампания</option>
          {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {hierActive && <button onClick={() => setHier({ direction_id: '', product_type_id: '', campaign_id: '' })}
          style={{ fontSize: 12, color: SEC, padding: '0 6px' }}>сбросить</button>}
      </div>

      {/* Сетка товаров */}
      {list.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 9 }}>🔍</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Ничего не нашлось</div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Попробуйте изменить фильтры</div>
      </div>}

      <div className="items-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(168px,1fr))', gap: 11 }}>
        {list.map((p) => {
          const [lbl, bg, col, state] = avail(p)
          const chain = chainOf(p, { directions, productTypes, campaigns })
          const disabled = state === 'bad'
          return (
            <div key={p.id} className="card" style={{ padding: 13, opacity: disabled ? 0.55 : 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--sur2)', display: 'grid', placeItems: 'center', fontSize: 17, marginBottom: 8 }}>📦</div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
              {attrsLine(p) && <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>{attrsLine(p)}</div>}
              {chain && <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{chain}</div>}
              <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 20, background: bg, color: col, alignSelf: 'flex-start', marginTop: 9 }}>{lbl}</span>

              {/* Количество меняется прямо здесь — открывать шторку ради одной цифры незачем */}
              {!disabled && (
                <div style={{ marginTop: 10 }}>
                  {inDraft(p.id) === null ? (
                    <button onClick={() => putInDraft(p, 1)}
                      style={{ width: '100%', minHeight: 40, borderRadius: 10, background: SEC_L, color: SEC, fontSize: 12.5, fontWeight: 600 }}>
                      В заявку
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => bump(p.id, -1)}
                        style={{ width: 38, minHeight: 40, borderRadius: 10, background: 'var(--sur2)', color: 'var(--tx2)', fontSize: 17, fontWeight: 600 }}>−</button>
                      <input value={inDraft(p.id)} onChange={(e) => setQtyFor(p, e.target.value)}
                        inputMode="numeric"
                        style={{ flex: 1, minWidth: 0, minHeight: 40, textAlign: 'center', border: `1.5px solid ${SEC}`, borderRadius: 10, background: 'var(--sur)', fontSize: 14, fontWeight: 600, color: 'var(--tx)' }} />
                      <button onClick={() => bump(p.id, +1)}
                        style={{ width: 38, minHeight: 40, borderRadius: 10, background: SEC_L, color: SEC, fontSize: 17, fontWeight: 600 }}>+</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Черновик заявки */}
      {draft.length > 0 && <div style={{ height: 210 }} />}

      {draft.length > 0 && (
        <div className="card" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, borderRadius: '16px 16px 0 0', padding: '14px 18px calc(16px + env(safe-area-inset-bottom))', zIndex: 50, boxShadow: 'var(--sh3)', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Черновик заявки</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, padding: '2px 9px', borderRadius: 20, background: SEC_L, color: SEC }}>{draft.length} поз.</span>
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 10 }}>
            {draft.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--brd)', fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                {/* Количество правится и здесь: вернуться к карточке ради цифры неудобно */}
                <button onClick={() => bump(d.product_id, -1)}
                  style={{ width: 30, minHeight: 32, borderRadius: 8, background: 'var(--sur2)', color: 'var(--tx2)', fontSize: 15 }}>−</button>
                <span className="mono" style={{ minWidth: 30, textAlign: 'center', fontWeight: 600 }}>{d.qty}</span>
                <button onClick={() => bump(d.product_id, +1)}
                  style={{ width: 30, minHeight: 32, borderRadius: 8, background: SEC_L, color: SEC, fontSize: 15 }}>+</button>
                <button onClick={() => setDraft((s) => s.filter((_, j) => j !== i))} style={{ color: 'var(--tx3)', fontSize: 14, padding: '0 4px' }}>×</button>
              </div>
            ))}
          </div>
          {draftSum > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0 10px' }}>
              <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Стоимость заявки</span>
              <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmt(Math.round(draftSum))} сом</span>
            </div>
          )}
          {!isWh && draft.length > 0 && (
            <button onClick={() => { setTplName(''); setTplOpen('save') }}
              style={{ width: '100%', minHeight: 38, marginBottom: 8, borderRadius: 9, border: '1px dashed var(--brd)', background: 'var(--bg)', color: 'var(--tx3)', fontSize: 12 }}>
              Сохранить набор как шаблон
            </button>
          )}
          {isWh ? (
            <Btn onClick={() => setIssue({ recipient_id: '', dept: '', basis: '', warehouse_id: '', is_test: false })}
              style={{ width: '100%', minHeight: 48 }}>
              Выдать · {draft.reduce((a, d) => a + d.qty, 0)} шт →
            </Btn>
          ) : (
            <Btn onClick={() => { onRequest && onRequest(draft); setDraft([]) }} style={{ width: '100%', minHeight: 48 }}>
              Оформить заявку · {draft.reduce((a, d) => a + d.qty, 0)} шт →
            </Btn>
          )}
        </div>
      )}

      {scan && (
        <Scanner title="Наведите на наклейку" onClose={() => setScan(false)}
          onFound={(sku) => {
            const p = products.find((x) => (x.sku || '').toUpperCase() === sku.toUpperCase() && !x.archived)
            if (!p) return toast('Артикул ' + sku + ' не найден', 'error')
            // Каждое сканирование добавляет штуку в корзину
            const has = inDraft(p.id)
            if (has === null) putInDraft(p, 1)
            else bump(p.id, +1)
          }} />
      )}

      {/* Шаблоны заявок */}
      <Sheet open={!!tplOpen} onClose={() => setTplOpen(false)} title={tplOpen === 'save' ? 'Сохранить шаблон' : 'Мои шаблоны'}>
        {tplOpen === 'save' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '10px 13px', background: 'var(--bg)', borderRadius: 11, fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.55 }}>
              Сохранится состав, а не количества — при следующей акции подставите набор и поправите цифры.
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 4 }}>Название</div>
              <input value={tplName} onChange={(e) => setTplName(e.target.value)} autoFocus
                placeholder="Конференция, базовый набор"
                style={{ width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 11, border: '1.5px solid var(--brd)', background: 'var(--sur)', fontSize: 13.5, color: 'var(--tx)' }} />
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 11, padding: 12 }}>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 7 }}>Состав · {draft.length} поз.</div>
              {draft.map((d) => (
                <div key={d.product_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
                  <span>{d.name}</span><span className="mono" style={{ color: 'var(--tx3)' }}>{d.qty}</span>
                </div>
              ))}
            </div>
            <Btn size="lg" loading={busy} onClick={async () => {
              setBusy(true)
              const { error } = await saveTemplate({ name: tplName, items: draft, profile })
              setBusy(false)
              if (error) return toast(error, 'error')
              toast('Шаблон сохранён')
              setTplOpen(false)
              listTemplates(profile.id).then(setTpls)
            }} style={{ minHeight: 50 }}>Сохранить</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tpls.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5, lineHeight: 1.6 }}>
                Шаблонов пока нет.<br />Наберите заявку и сохраните набор — в следующий раз подставите одной кнопкой.
              </div>
            )}
            {tpls.map((t) => (
              <div key={t.id} className="card" style={{ padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{(t.items || []).length} поз.</span>
                  <button onClick={async () => {
                    const { error } = await deleteTemplate(t.id)
                    if (error) return toast(error, 'error')
                    setTpls((l) => l.filter((x) => x.id !== t.id))
                    toast('Шаблон удалён')
                  }} style={{ color: 'var(--tx3)', fontSize: 15, padding: '0 4px' }}>×</button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.5, marginBottom: 10 }}>
                  {(t.items || []).map((it) => {
                    const p = products.find((x) => x.id === it.product_id)
                    return `${it.qty} × ${p?.name || 'товар удалён'}`
                  }).join(' · ')}
                </div>
                <Btn size="sm" v="secondary" onClick={() => {
                  const { items, missing } = expandTemplate(t, products)
                  if (!items.length) return toast('Все товары из шаблона недоступны', 'error')
                  setDraft(items)
                  setTplOpen(false)
                  toast(missing.length
                    ? `Подставлено ${items.length} поз., ${missing.length} недоступно`
                    : 'Набор подставлен — поправьте количества')
                }} style={{ width: '100%', minHeight: 42 }}>Подставить в заявку</Btn>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {/* Оформление выдачи: получателя и основание указываем один раз на весь набор */}
      <Sheet open={!!issue} onClose={() => setIssue(null)} title="Кому выдаём">
        {issue && (() => {
          const rec = (data.recipients || []).find((r) => r.id == issue.recipient_id)
          const total = draftSum
          const set = (k, v) => setIssue((s) => ({ ...s, [k]: v }))
          const inp = { width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 11, border: '1.5px solid var(--brd)', background: 'var(--sur)', fontSize: 13.5, color: 'var(--tx)' }
          const lbl = (t) => <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 4 }}>{t}</div>

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>{lbl('Получатель')}
                <select value={issue.recipient_id} onChange={(e) => {
                  if (e.target.value === 'new') { set('newRec', { name: '', dept: '' }); return }
                  set('recipient_id', e.target.value)
                  const r = (data.recipients || []).find((x) => x.id == e.target.value)
                  set('dept', r?.dept || '')
                }} style={inp}>
                  <option value="">— выбрать —</option>
                  {(data.recipients || []).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}{r.dept ? ' · ' + r.dept : ''}</option>
                  ))}
                  <option value="new">➕ Добавить получателя</option>
                </select>

                {/* Новый получатель прямо здесь: бежать в справочник посреди выдачи неудобно */}
                {issue.newRec && (
                  <div className="card" style={{ padding: 12, marginTop: 9, background: 'var(--bg)' }}>
                    <input value={issue.newRec.name} autoFocus placeholder="Ф.И.О."
                      onChange={(e) => set('newRec', { ...issue.newRec, name: e.target.value })}
                      style={{ ...inp, marginBottom: 8 }} />
                    <select value={issue.newRec.dept} onChange={(e) => set('newRec', { ...issue.newRec, dept: e.target.value })}
                      style={{ ...inp, marginBottom: 8 }}>
                      <option value="">— департамент / управление —</option>
                      {(data.departments || []).map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn size="sm" onClick={async () => {
                        const name = issue.newRec.name.trim()
                        if (!name) return toast('Введите имя', 'error')
                        const { data: d, error } = await supabase.from('recipients')
                          .insert({ name, dept: issue.newRec.dept || null }).select().single()
                        if (error) return toast(error.message, 'error')
                        data.invalidate('refs')
                        setIssue((s) => ({ ...s, recipient_id: d.id, dept: d.dept || '', newRec: null }))
                        toast('Получатель добавлен')
                      }} style={{ flex: 1, minHeight: 42 }}>Сохранить</Btn>
                      <Btn size="sm" v="secondary" onClick={() => set('newRec', null)} style={{ minHeight: 42 }}>Отмена</Btn>
                    </div>
                  </div>
                )}
              </div>

              <div>{lbl('Департамент / управление')}
                <select value={issue.dept} onChange={(e) => set('dept', e.target.value)} style={inp}>
                  <option value="">—</option>
                  {(data.departments || []).map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>

              <div>{lbl('Основание')}
                <input value={issue.basis} onChange={(e) => set('basis', e.target.value)} placeholder="Служебная записка № ___" style={inp} />
              </div>

              <div>{lbl('Склад')}
                <select value={issue.warehouse_id} onChange={(e) => set('warehouse_id', e.target.value)} style={inp}>
                  <option value="">— выбрать —</option>
                  {(data.warehouses || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: 11, padding: 12 }}>
                <div style={{ fontSize: 10.5, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 7 }}>Будет выдано</div>
                {draft.map((d) => (
                  <div key={d.product_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
                    <span>{d.name}</span><span className="mono" style={{ fontWeight: 500 }}>{d.qty}</span>
                  </div>
                ))}
                {total > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 7, marginTop: 5, borderTop: '1px dashed var(--brd)' }}>
                    <span style={{ fontWeight: 500 }}>Итого</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{fmt(Math.round(total))} сом</span>
                  </div>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderRadius: 11, background: issue.is_test ? 'var(--am-l)' : 'var(--bg)', cursor: 'pointer' }}>
                <input type="checkbox" checked={issue.is_test} onChange={(e) => set('is_test', e.target.checked)}
                  style={{ width: 18, height: 18, minHeight: 18, accentColor: 'var(--am)' }} />
                <span style={{ fontSize: 12.5, color: issue.is_test ? 'var(--am-m)' : 'var(--tx2)' }}>Тестовая операция</span>
              </label>

              <Btn size="lg" loading={busy} onClick={async () => {
                if (!rec) return toast('Выберите получателя', 'error')
                if (!issue.warehouse_id) return toast('Выберите склад', 'error')
                setBusy(true)
                const { data: res, error } = await issueBasket({
                  basket: draft, warehouseId: issue.warehouse_id,
                  recipient: { id: rec.id, name: rec.name, branch_id: rec.branch_id, profile_id: rec.profile_id },
                  dept: issue.dept, basis: issue.basis, profile, products, isTest: issue.is_test,
                })
                setBusy(false)
                if (error) return toast(error, 'error')
                toast('Выдано · акт ' + res.act.number)
                setDraft([]); setIssue(null)
                data.invalidate(['movements', 'stock', 'acts'])
              }} style={{ minHeight: 50 }}>Выдать и оформить акт</Btn>
            </div>
          )
        })()}
      </Sheet>

      {/* Выбор количества */}
      <Sheet open={!!pick} onClose={() => { setPick(null); setQty(1) }} title={pick?.name || ''}>
        {pick && (() => {
          const [lbl, bg, col] = avail(pick)
          const chain = chainOf(pick, { directions, productTypes, campaigns })
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--sur2)', display: 'grid', placeItems: 'center', fontSize: 20 }}>📦</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{pick.name}</div>
                  {chain && <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{chain}</div>}
                </div>
                <span style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 20, background: bg, color: col }}>{lbl}</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>Сколько нужно</div>
              <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 14 }}>
                <button onClick={() => setQty((n) => Math.max(1, n - 1))} style={{ width: 46, minHeight: 46, borderRadius: 12, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 19 }}>−</button>
                <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                  style={{ flex: 1, minHeight: 46, textAlign: 'center', border: '1px solid var(--brd2)', borderRadius: 12, background: 'var(--sur)', fontFamily: 'var(--mono)', fontSize: 17, color: 'var(--tx)' }} />
                <button onClick={() => setQty((n) => n + 1)} style={{ width: 46, minHeight: 46, borderRadius: 12, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 19 }}>+</button>
              </div>
              <Btn onClick={addToDraft} style={{ width: '100%', minHeight: 48 }}>В заявку</Btn>
            </div>
          )
        })()}
      </Sheet>
    </div>
  )
}
