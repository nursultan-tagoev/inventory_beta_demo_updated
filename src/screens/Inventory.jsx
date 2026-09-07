import { useState, useEffect, useRef } from 'react'
import { Btn, Badge, Sheet, useToast, Confirm } from '../components/ui'
import { AFFECTS } from '../lib/data'
import { printDoc } from '../lib/print'
import { fmt } from '../lib/format'
import {
  startInventory, saveFact, compareWithStock, applyAdjustment,
  loadInventory, deleteInventory,
} from '../lib/inventory'
import DefectSheet from '../components/DefectSheet'

const ACC = 'var(--bl, #2F6FB3)'
const ACC_L = 'color-mix(in srgb, var(--bl, #2F6FB3) 12%, transparent)'

const ST = {
  draft: ['Черновик', 'amber'],
  compared: ['Сверено', 'slate'],
  done: ['Проведено', 'green'],
}

export default function Inventory({ data, profile }) {
  const { products, warehouses, stockByWh, inventories, invalidate, bumpStock } = data
  const { toast } = useToast()
  const isAdmin = ['admin', 'warehouse'].includes(profile?.role)

  const list = inventories || []
  const [open, setOpen] = useState(null)      // { inv, items }
  const [fact, setFact] = useState({})        // product_id → введённое число
  const [busy, setBusy] = useState(false)
  const [newWh, setNewWh] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [delInv, setDelInv] = useState(null)
  const [defect, setDefect] = useState(false)
  const printRef = useRef(null)


  const pName = (id) => (products || []).find((p) => p.id === id)?.name || '—'
  const pPrice = (id) => Number((products || []).find((p) => p.id === id)?.price || 0)
  const whName = (id) => (warehouses || []).find((w) => w.id === id)?.name || '—'
  const sysQty = (pid, wid) => Number(stockByWh?.[pid]?.[wid] || 0)

  // Когда последний раз сверяли каждый склад
  const lastCheck = (wid) => {
    const d = list.filter((i) => i.warehouse_id === wid && i.status === 'done')
      .sort((a, b) => (a.finished_at < b.finished_at ? 1 : -1))[0]
    return d?.finished_at || null
  }
  const staleDays = (wid) => {
    const d = lastCheck(wid)
    if (!d) return null
    return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  }

  const create = async () => {
    if (!newWh) return toast('Выберите склад', 'error')
    setBusy(true)
    const { data: inv, error } = await startInventory({ warehouseId: newWh, profile })
    setBusy(false)
    if (error) return toast(error, 'error')
    toast('Сверка начата')
    setNewWh('')
    // Показываем сразу, не дожидаясь перечитывания реестра
    invalidate(AFFECTS.inventory)
    setFact({})
    setOpen({ inv, items: [] })
  }

  const openOne = async (id) => {
    const { inv, items } = await loadInventory(id)
    if (!inv) return toast('Сверка не найдена', 'error')
    const f = {}
    items.forEach((it) => { f[it.product_id] = it.fact_qty })
    setFact(f)
    setOpen({ inv, items })
  }

  const doSaveFact = async () => {
    const rows = Object.entries(fact).map(([pid, q]) => ({ product_id: Number(pid), fact_qty: q }))
    setBusy(true)
    const { error } = await saveFact(open.inv.id, rows)
    setBusy(false)
    if (error) return toast(error, 'error')
    toast('Черновик сохранён')
    openOne(open.inv.id)
  }

  const doCompare = async () => {
    setBusy(true)
    await saveFact(open.inv.id, Object.entries(fact).map(([pid, q]) => ({ product_id: Number(pid), fact_qty: q })))
    const { data: upd, error } = await compareWithStock(open.inv, stockByWh, profile)
    setBusy(false)
    if (error) return toast(error, 'error')
    toast('Сравнено — остатки не изменены')
    const inv = { ...open.inv, status: 'compared' }
    setOpen({ inv, items: upd })
  }

  const doApply = async () => {
    setBusy(true)
    const { data: res, error } = await applyAdjustment(open.inv, open.items, profile)
    setBusy(false)
    setConfirm(null)
    if (error) return toast(error, 'error')
    toast(res.moved ? `Скорректировано позиций: ${res.moved}` : 'Расхождений не было')
    const inv = { ...open.inv, status: 'done', finished_at: new Date().toISOString() }
    setOpen({ inv, items: open.items })
    // Остаток выравниваем в интерфейсе сразу — сервер уже принял операции
    bumpStock(diffs.map((it) => ({
      product_id: it.product_id, warehouse_id: open.inv.warehouse_id,
      delta: Number(it.fact_qty) - Number(it.system_qty),
    })))
    invalidate(AFFECTS.adjust)
  }

  /* ── Позиции склада для ввода факта ── */
  const whProducts = open
    ? (products || []).filter((p) => {
        const q = sysQty(p.id, open.inv.warehouse_id)
        return q > 0 || fact[p.id] !== undefined
      })
    : []

  const rows = open?.inv.status === 'draft'
    ? whProducts.map((p) => ({ product_id: p.id, system_qty: sysQty(p.id, open.inv.warehouse_id), fact_qty: fact[p.id] }))
    : (open?.items || [])

  const diffs = rows.filter((r) => r.fact_qty !== null && r.fact_qty !== undefined && r.fact_qty !== ''
    && Number(r.fact_qty) !== Number(r.system_qty))
  const sumDiff = diffs.reduce((a, r) => a + (Number(r.fact_qty) - Number(r.system_qty)) * pPrice(r.product_id), 0)

  if (!isAdmin) return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '60px 20px', textAlign: 'center', color: 'var(--tx3)' }}>
      Инвентаризацию проводит склад.
    </div>
  )

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 80px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="ff" style={{ fontSize: 21, fontWeight: 600 }}>Инвентаризация</div>
        <Btn size="sm" v="secondary" onClick={() => setDefect(true)} style={{ marginLeft: 'auto', minHeight: 40 }}>Брак по поставке</Btn>
      </div>

      {/* Когда сверяли склады */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10, marginBottom: 16 }}>
        {(warehouses || []).map((w) => {
          const d = staleDays(w.id)
          const bad = d === null || d > 30
          return (
            <div key={w.id} className="card" style={{ padding: 13 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{w.name}</div>
              <div style={{ fontSize: 11, color: bad ? 'var(--am-m)' : 'var(--tx3)' }}>
                {d === null ? 'ни разу не сверяли' : d === 0 ? 'сверено сегодня' : `сверено ${d} дн. назад`}
                {bad && d !== null ? ' · пора' : ''}
              </div>
            </div>
          )
        })}
      </div>

      {/* Новая сверка */}
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={newWh} onChange={(e) => setNewWh(e.target.value)}
          style={{ flex: 1, minWidth: 170, minHeight: 44, padding: '0 12px', borderRadius: 11, border: '1.5px solid var(--brd)', background: 'var(--sur)', fontSize: 13.5, color: 'var(--tx)' }}>
          <option value="">Склад для сверки…</option>
          {(warehouses || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <Btn onClick={create} disabled={busy} style={{ minHeight: 44 }}>{busy ? 'Создаём…' : 'Начать сверку'}</Btn>
      </div>

      {/* Реестр */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--brd)', fontSize: 12.5, fontWeight: 600 }}>Все проверки</div>
        {list.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>Сверок ещё не было</div>}
        {list.map((i, idx) => (
          <div key={i.id} onClick={() => openOne(i.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', borderTop: idx ? '1px solid var(--brd)' : 'none' }}>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--tx3)', width: 34 }}>№{i.id}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{whName(i.warehouse_id)}</div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                {new Date(i.started_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <Badge color={ST[i.status]?.[1] || 'slate'}>{ST[i.status]?.[0] || i.status}</Badge>
            {i.status === 'draft' && (
              <button onClick={(e) => { e.stopPropagation(); setDelInv(i) }} title="Удалить черновик"
                style={{ color: 'var(--rd-m)', fontSize: 15, padding: '4px 6px', minHeight: 36 }}>🗑</button>
            )}
          </div>
        ))}
      </div>

      {/* ── Карточка сверки ── */}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `Сверка №${open.inv.id} · ${whName(open.inv.warehouse_id)}` : ''}>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge color={ST[open.inv.status]?.[1]}>{ST[open.inv.status]?.[0]}</Badge>
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
                начата {new Date(open.inv.started_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              {open.inv.status === 'done' && (
                <Btn size="sm" v="secondary" onClick={() => printDoc(printRef.current)} style={{ marginLeft: 'auto', minHeight: 38 }}>Печать ведомости</Btn>
              )}
              {open.inv.status === 'draft' && (
                <Btn size="sm" v="secondary" onClick={() => setDelInv(open.inv)} style={{ marginLeft: 'auto', minHeight: 38, color: 'var(--rd-m)' }}>Удалить</Btn>
              )}
            </div>

            {open.inv.status === 'draft' && (
              <div style={{ padding: '10px 13px', background: 'var(--am-l)', borderRadius: 11, fontSize: 11.5, color: 'var(--am-m)', lineHeight: 1.55 }}>
                Внесите фактические остатки. Можно сохранить черновиком и продолжить позже — остатки при этом не меняются.
              </div>
            )}

            {/* Таблица позиций */}
            <div style={{ border: '1px solid var(--brd)', borderRadius: 11, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 62px 62px 62px', gap: 6, padding: '9px 11px', background: 'var(--bg)', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--tx3)' }}>
                <span>Товар</span><span style={{ textAlign: 'center' }}>Учёт</span>
                <span style={{ textAlign: 'center' }}>Факт</span><span style={{ textAlign: 'center' }}>Разн.</span>
              </div>
              {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>На складе нет остатков</div>}
              {rows.map((r) => {
                const sys = Number(r.system_qty ?? sysQty(r.product_id, open.inv.warehouse_id))
                const f = open.inv.status === 'draft' ? fact[r.product_id] : r.fact_qty
                const has = f !== '' && f !== null && f !== undefined
                const d = has ? Number(f) - sys : null
                return (
                  <div key={r.product_id} style={{ display: 'grid', gridTemplateColumns: '1fr 62px 62px 62px', gap: 6, alignItems: 'center', padding: '8px 11px', borderTop: '1px solid var(--brd)' }}>
                    <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName(r.product_id)}</span>
                    <span className="mono" style={{ fontSize: 12, textAlign: 'center', color: 'var(--tx3)' }}>{sys}</span>
                    {open.inv.status === 'draft' ? (
                      <input type="number" inputMode="numeric" value={fact[r.product_id] ?? ''}
                        onChange={(e) => setFact({ ...fact, [r.product_id]: e.target.value })}
                        style={{ width: '100%', minHeight: 36, textAlign: 'center', border: '1.5px solid var(--brd)', borderRadius: 8, background: 'var(--sur)', fontSize: 12.5, color: 'var(--tx)' }} />
                    ) : (
                      <span className="mono" style={{ fontSize: 12, textAlign: 'center' }}>{has ? f : '—'}</span>
                    )}
                    <span className="mono" style={{ fontSize: 12, textAlign: 'center', fontWeight: 600, color: d === null || d === 0 ? 'var(--tx3)' : d > 0 ? 'var(--gr-m)' : 'var(--rd-m)' }}>
                      {d === null ? '—' : d === 0 ? '0' : d > 0 ? '+' + d : d}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Итоги расхождений */}
            {open.inv.status !== 'draft' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '9px 11px' }}>
                  <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase' }}>Расхождений</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: diffs.length ? 'var(--am-m)' : 'var(--gr-m)' }}>{diffs.length}</div>
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '9px 11px' }}>
                  <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase' }}>На сумму</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: sumDiff < 0 ? 'var(--rd-m)' : 'var(--tx)' }}>{fmt(Math.round(sumDiff))} с</div>
                </div>
              </div>
            )}

            {/* Действия */}
            {open.inv.status === 'draft' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn v="secondary" onClick={doSaveFact} disabled={busy} style={{ minHeight: 46 }}>{busy ? 'Сохраняем…' : 'Сохранить черновик'}</Btn>
                <Btn onClick={doCompare} disabled={busy} style={{ flex: 1, minWidth: 150, minHeight: 46 }}>{busy ? 'Считаем…' : 'Сравнить с учётом'}</Btn>
              </div>
            )}
            {open.inv.status === 'compared' && (
              <>
                <div style={{ padding: '10px 13px', background: 'var(--bg)', borderRadius: 11, fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.55 }}>
                  Остатки пока не тронуты. Корректировка выровняет учёт по факту и запишет отдельные операции в журнал.
                </div>
                <Btn onClick={() => setConfirm(true)} disabled={busy} style={{ minHeight: 48 }}>{busy ? 'Проводим…' : 'Провести корректировку'}</Btn>
              </>
            )}
            {open.inv.status === 'done' && (
              <div style={{ padding: '10px 13px', background: 'var(--gr-l)', borderRadius: 11, fontSize: 11.5, color: 'var(--gr-m)' }}>
                Проведена {open.inv.finished_at ? new Date(open.inv.finished_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
            )}

            {/* Печатная ведомость */}
            <div style={{ display: 'none' }}>
              <div ref={printRef}>
                <div className="act-tbl" style={{ padding: 20 }}>
                  <h2 style={{ textAlign: 'center', marginBottom: 4 }}>Инвентаризационная ведомость №{open.inv.id}</h2>
                  <p style={{ textAlign: 'center', marginBottom: 14 }}>
                    Склад: {whName(open.inv.warehouse_id)} · Дата: {new Date(open.inv.finished_at || open.inv.started_at).toLocaleDateString('ru-RU')}
                  </p>
                  <table width="100%" border="1" cellPadding="5" style={{ borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th>№</th><th>Наименование</th><th>По учёту</th><th>Фактически</th><th>Разница</th><th>Сумма, сом</th>
                    </tr></thead>
                    <tbody>
                      {rows.map((r, n) => {
                        const sys = Number(r.system_qty || 0), f = Number(r.fact_qty || 0), d = f - sys
                        return (
                          <tr key={r.product_id}>
                            <td>{n + 1}</td><td>{pName(r.product_id)}</td>
                            <td align="center">{sys}</td><td align="center">{f}</td>
                            <td align="center">{d > 0 ? '+' + d : d}</td>
                            <td align="right">{fmt(Math.round(d * pPrice(r.product_id)))}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <p style={{ marginTop: 12 }}>
                    Расхождений: {diffs.length} · на сумму {fmt(Math.round(sumDiff))} сом
                  </p>
                  <p style={{ marginTop: 30 }}>
                    Материально ответственное лицо: {profile?.full_name || profile?.email} ____________________
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Sheet>

      {confirm && (
        <Confirm title="Провести корректировку?" onOk={doApply} onCancel={() => setConfirm(null)}
          message={`Остатки будут выровнены по факту. Позиций с расхождением: ${diffs.length}. Операции появятся в журнале, отменить их можно только новой корректировкой.`} />
      )}

      {delInv && (
        <Confirm title="Удалить черновик?" danger
          message={`Сверка №${delInv.id} по складу «${whName(delInv.warehouse_id)}» будет удалена вместе с внесёнными цифрами. Остатки не изменятся.`}
          onCancel={() => setDelInv(null)}
          onOk={async () => {
            const { error } = await deleteInventory(delInv.id)
            if (error) { setDelInv(null); return toast(error, 'error') }
            invalidate(AFFECTS.inventory)
            if (open?.inv.id === delInv.id) setOpen(null)
            setDelInv(null)
            toast('Черновик удалён')
          }} />
      )}

      {defect && <DefectSheet data={data} profile={profile} onClose={() => setDefect(false)} onDone={() => { setDefect(false); invalidate(AFFECTS.defect) }} />}
    </div>
  )
}
