import { useState, useMemo, useRef } from 'react'
import { fmt, som } from '../lib/format'
import { printDoc } from '../lib/print'
import { exportXlsx } from '../lib/xlsx'
import {
  periodOf, prevPeriod, money, growth, purchases, spending,
  stockHealth, processStats, myApprovalSpeed, monthly, byCity, overdue, sparkline,
} from '../lib/analytics'

const PERIODS = [['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год'], ['custom', 'Период']]

/* Спарклайн: тонкая линия динамики рядом с цифрой */
function Spark({ points, color = 'var(--ink)', w = 92, h = 26 }) {
  if (!points?.length) return null
  const max = Math.max(...points, 1)
  const step = w / Math.max(1, points.length - 1)
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(h - (v / max) * (h - 3) - 1.5).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity=".75" />
    </svg>
  )
}

function Kpi({ label, value, sub, spark, tone }) {
  return (
    <div className="card" style={{ padding: 15, minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>{label}</div>
      <div className="mono ff" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, marginTop: 4, color: tone === 'up' ? 'var(--gr-m)' : tone === 'down' ? 'var(--rd-m)' : 'var(--tx3)' }}>{sub}</div>}
      {spark && <div style={{ marginTop: 8 }}><Spark points={spark} /></div>}
    </div>
  )
}

/* Строка-полоска: доля от максимума видна без графика */
function Bar({ name, val, qty, max, onClick, active, showMoney = true }) {
  const pct = max > 0 ? Math.round((val / max) * 100) : 0
  return (
    <div onClick={onClick} style={{ padding: '9px 13px', borderTop: '1px solid var(--brd)', cursor: onClick ? 'pointer' : 'default', background: active ? 'var(--ink-l)' : 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {qty != null && <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)' }}>{fmt(qty)} шт</span>}
        {showMoney && <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmt(Math.round(val))}</span>}
      </div>
      <div style={{ height: 4, borderRadius: 3, background: 'var(--sur2)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: 'var(--ink)', opacity: active ? 1 : .55, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

const Card = ({ title, extra, children }) => (
  <div className="card" style={{ overflow: 'hidden', marginBottom: 14 }}>
    <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</span>
      {extra && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>{extra}</span>}
    </div>
    {children}
  </div>
)

export default function Reports({ data, profile }) {
  const role = profile?.role
  const isManager = role === 'manager'
  const branchId = isManager ? profile?.branch_id : null

  const [pk, setPk] = useState('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [tab, setTab] = useState('buy')
  const [focus, setFocus] = useState(null)      // cross-filter: {kind, id, name}
  const printRef = useRef(null)

  const period = useMemo(() => periodOf(pk, custom), [pk, custom])
  const prev = useMemo(() => prevPeriod(period), [period])

  /* Cross-filter: выбранное направление сужает всё остальное */
  const scoped = useMemo(() => {
    if (!focus) return data
    if (focus.kind === 'branch') return { ...data, movements: data.movements.filter((m) => m.branch_id === focus.id) }
    if (focus.kind === 'supplier') return { ...data, movements: data.movements.filter((m) => m.supplier_id === focus.id) }
    if (focus.kind === 'dir') {
      const ids = new Set(data.products.filter((p) => {
        const camp = data.campaigns.find((c) => c.id === p.campaign_id)
        const type = data.productTypes.find((t) => t.id === (camp?.product_type_id || p.product_type_id))
        return (type?.direction_id || p.direction_id) === focus.id
      }).map((p) => p.id))
      return { ...data, movements: data.movements.filter((m) => ids.has(m.product_id)) }
    }
    return data
  }, [data, focus])

  const opts = { branchId }
  const now = money(scoped, period, opts)
  const was = money(scoped, prev, opts)
  const buy = useMemo(() => purchases(scoped, period), [scoped, period])
  const spend = useMemo(() => spending(scoped, period, opts), [scoped, period, branchId])
  const health = useMemo(() => stockHealth(scoped), [scoped])
  const proc = useMemo(() => processStats(scoped, period, opts), [scoped, period, branchId])
  const cities = useMemo(() => byCity(scoped, period, opts), [scoped, period, branchId])
  const late = useMemo(() => overdue(scoped, opts), [scoped, branchId])
  const dyn = useMemo(() => monthly(scoped, 6), [scoped])
  const mine = isManager ? myApprovalSpeed(data, profile.id) : null

  const gBuy = growth(now.buyVal, was.buyVal)
  const gOut = growth(now.outVal, was.outVal)

  const TABS = isManager
    ? [['spend', 'Расход филиала'], ['stock', 'Запасы'], ['proc', 'Процесс']]
    : [['buy', 'Закупки'], ['spend', 'Расход'], ['stock', 'Запасы'], ['proc', 'Процесс']]
  const activeTab = TABS.some(([t]) => t === tab) ? tab : TABS[0][0]

  const periodLabel = `${period.from.toLocaleDateString('ru-RU')} — ${period.to.toLocaleDateString('ru-RU')}`

  const toXlsx = () => {
    const sheets = [
      { name: 'Сводка', rows: [{
        Период: periodLabel,
        'Закупки, сом': Math.round(now.buyVal), 'Закуплено, шт': now.buyQty,
        'Выдано, сом': Math.round(now.outVal), 'Выдано, шт': now.outQty,
        'Потери, сом': Math.round(now.lossVal), Операций: now.ops,
      }] },
      { name: 'Поставщики', rows: buy.bySupplier.map((s) => ({
        Поставщик: s.name, 'Сумма, сом': Math.round(s.val), 'Количество, шт': s.qty,
        Поставок: s.dlvCount || 0, 'С опозданием': s.late || 0, 'Брак, шт': s.defects || 0, 'Доля брака, %': s.defectRate || 0,
      })) },
      { name: 'Направления', rows: buy.byDir.flatMap((d) => d.types.map((t) => ({
        Направление: d.name, Тип: t.name, 'Сумма, сом': Math.round(t.val), 'Количество, шт': t.qty,
      }))) },
      { name: 'Филиалы', rows: spend.byBranch.map((b) => ({ Филиал: b.name, 'Сумма, сом': Math.round(b.val), 'Количество, шт': b.qty })) },
      { name: 'Города', rows: cities.flatMap((c) => c.branches.map((b) => ({ Город: c.city, Филиал: b.name, 'Сумма, сом': Math.round(b.val), 'Количество, шт': b.qty }))) },
      { name: 'Сотрудники', rows: spend.byPerson.map((p) => ({ Сотрудник: p.name, 'Сумма, сом': Math.round(p.val), 'Количество, шт': p.qty })) },
      { name: 'Товары', rows: spend.byProduct.map((p) => ({ Товар: p.name, 'Сумма, сом': Math.round(p.val), 'Количество, шт': p.qty })) },
      { name: 'Заканчивается', rows: health.ending.map((r) => ({ Товар: r.name, Остаток: r.qty, 'Расход в день': r.rate, 'Хватит на дней': r.days ?? '—' })) },
      { name: 'Залежалось', rows: health.dead.map((r) => ({ Товар: r.name, Остаток: r.qty, 'Сумма, сом': Math.round(r.val), 'Последняя выдача': r.last ? new Date(r.last).toLocaleDateString('ru-RU') : 'не выдавался' })) },
      { name: 'Просрочки', rows: late.map((r) => ({ Товар: r.product, Получатель: r.person, Филиал: r.branch, 'Срок до': r.due_date, 'Дней просрочки': r.days, Количество: r.remaining })) },
      { name: 'Процесс', rows: [{
        'Заявок за период': proc.total,
        'Согласование, дней': proc.avgApprove ?? '—',
        'До склада, дней': proc.avgSend ?? '—',
        'Выдача, дней': proc.avgIssue ?? '—',
        'Весь путь, дней': proc.avgTotal ?? '—',
      }] },
      { name: 'Застряло', rows: proc.stuck.map((r) => ({ Заявка: '№' + r.id, Стадия: r.stage, 'На ком': r.who, Дней: r.days, Назначение: r.purpose || '' })) },
    ]
    exportXlsx(sheets, isManager ? 'analytics_branch' : 'analytics')
  }

  const inp = { minHeight: 38, padding: '0 10px', borderRadius: 9, border: '1.5px solid var(--brd)', background: 'var(--sur)', fontSize: 12.5, color: 'var(--tx)' }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 20px 80px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 21, fontWeight: 600 }}>Аналитика</span>
        {isManager && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'var(--gr-l)', color: 'var(--gr-m)' }}>ваш филиал</span>}
        {role === 'director' && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'var(--sur2)', color: 'var(--tx3)' }}>только чтение</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <button onClick={toXlsx} style={{ height: 38, padding: '0 13px', borderRadius: 9, background: 'var(--gr)', color: '#fff', fontSize: 12.5, fontWeight: 600 }}>↓ XLSX</button>
          <button onClick={() => printDoc(printRef.current)} style={{ height: 38, padding: '0 13px', borderRadius: 9, background: 'var(--sur2)', color: 'var(--tx2)', fontSize: 12.5, fontWeight: 600 }}>↓ PDF</button>
        </div>
      </div>

      {/* Период */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODS.map(([k, l]) => (
          <button key={k} onClick={() => setPk(k)} style={{ padding: '7px 14px', minHeight: 38, borderRadius: 9, border: `1px solid ${pk === k ? 'var(--ink)' : 'var(--brd)'}`, fontSize: 12.5, fontWeight: pk === k ? 600 : 400, background: pk === k ? 'var(--ink-l)' : 'var(--sur)', color: pk === k ? 'var(--ink)' : 'var(--tx2)' }}>{l}</button>
        ))}
        {pk === 'custom' && (
          <>
            <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} style={inp} />
            <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} style={inp} />
          </>
        )}
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{periodLabel}</span>
      </div>

      {/* Cross-filter */}
      {focus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'var(--ink-l)', borderRadius: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 12 }}>Фильтр: <b>{focus.name}</b></span>
          <button onClick={() => setFocus(null)} style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink)', fontWeight: 600, minHeight: 32 }}>Сбросить ×</button>
        </div>
      )}

      <div ref={printRef}>
        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 14 }}>
          {!isManager && (
            <Kpi label="Закупки за период" value={som(Math.round(now.buyVal))}
              sub={`${gBuy >= 0 ? '+' : ''}${gBuy}% к прошлому`} tone={gBuy > 0 ? 'down' : 'up'}
              spark={sparkline(scoped, 12, 'in')} />
          )}
          <Kpi label="Выдано филиалам" value={som(Math.round(now.outVal))}
            sub={`${gOut >= 0 ? '+' : ''}${gOut}% · ${fmt(now.outQty)} шт`} tone={gOut > 0 ? 'down' : 'up'}
            spark={sparkline(scoped, 12, 'out', opts)} />
          <Kpi label="Потери" value={som(Math.round(now.lossVal))} sub={`${fmt(now.lossQty)} шт · брак и списания`} tone={now.lossVal ? 'down' : null} />
          <Kpi label="Залежалось" value={som(Math.round(health.deadVal))} sub={`${health.dead.length} позиций без движения`} tone={health.deadVal ? 'down' : null} />
        </div>

        {/* Вкладки */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {TABS.map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 15px', minHeight: 38, borderRadius: 9, border: `1px solid ${activeTab === t ? 'var(--ink)' : 'var(--brd)'}`, fontSize: 13, fontWeight: activeTab === t ? 600 : 400, background: activeTab === t ? 'var(--ink-l)' : 'var(--sur)', color: activeTab === t ? 'var(--ink)' : 'var(--tx2)' }}>{l}</button>
          ))}
        </div>

        {/* ── Закупки ── */}
        {activeTab === 'buy' && (
          <>
            <Card title="Поставщики" extra={`${buy.bySupplier.length} за период`}>
              {buy.bySupplier.length === 0 && <div style={{ padding: 26, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>Закупок за период не было</div>}
              {buy.bySupplier.map((s) => (
                <div key={s.id}>
                  <Bar name={s.name} val={s.val} qty={s.qty} max={buy.bySupplier[0]?.val || 1}
                    active={focus?.kind === 'supplier' && focus.id === s.id}
                    onClick={() => setFocus(focus?.id === s.id && focus.kind === 'supplier' ? null : { kind: 'supplier', id: s.id, name: s.name })} />
                  {(s.late > 0 || s.defects > 0) && (
                    <div style={{ padding: '0 13px 8px 13px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {s.late > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--am-l)', color: 'var(--am-m)' }}>опозданий {s.late}</span>}
                      {s.defects > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--rd-l)', color: 'var(--rd-m)' }}>брак {s.defects} · {s.defectRate}%</span>}
                    </div>
                  )}
                </div>
              ))}
            </Card>

            <Card title="Направления" extra="нажмите, чтобы отфильтровать">
              {buy.byDir.map((d) => (
                <div key={d.id}>
                  <Bar name={d.name} val={d.val} qty={d.qty} max={buy.byDir[0]?.val || 1}
                    active={focus?.kind === 'dir' && focus.id === d.id}
                    onClick={() => setFocus(focus?.id === d.id && focus.kind === 'dir' ? null : { kind: 'dir', id: d.id, name: d.name })} />
                  {focus?.kind === 'dir' && focus.id === d.id && d.types.map((t) => (
                    <div key={t.name} style={{ padding: '6px 13px 6px 30px', display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--tx2)', borderTop: '1px solid var(--brd)' }}>
                      <span style={{ flex: 1 }}>{t.name}</span>
                      <span className="mono">{fmt(t.qty)} шт</span>
                      <span className="mono" style={{ fontWeight: 600 }}>{fmt(Math.round(t.val))}</span>
                    </div>
                  ))}
                </div>
              ))}
            </Card>

            <Card title="Динамика по месяцам">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '14px 14px 12px', height: 130 }}>
                {dyn.map((m) => {
                  const max = Math.max(...dyn.map((x) => Math.max(x.buy, x.spend)), 1)
                  return (
                    <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 80 }}>
                        <div title={`закупки ${fmt(Math.round(m.buy))}`} style={{ width: 11, height: `${(m.buy / max) * 100}%`, minHeight: 2, background: 'var(--gr)', borderRadius: '3px 3px 0 0' }} />
                        <div title={`расход ${fmt(Math.round(m.spend))}`} style={{ width: 11, height: `${(m.spend / max) * 100}%`, minHeight: 2, background: 'var(--ink)', borderRadius: '3px 3px 0 0' }} />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{m.label}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 14, padding: '0 14px 12px', fontSize: 10.5, color: 'var(--tx3)' }}>
                <span><b style={{ color: 'var(--gr-m)' }}>▮</b> закупки</span>
                <span><b style={{ color: 'var(--ink)' }}>▮</b> расход</span>
              </div>
            </Card>
          </>
        )}

        {/* ── Расход ── */}
        {activeTab === 'spend' && (
          <>
            {!isManager && (
              <Card title="Города и филиалы">
                {cities.length === 0 && <div style={{ padding: 26, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>Выдач за период не было</div>}
                {cities.map((c) => (
                  <div key={c.city}>
                    <Bar name={c.city} val={c.val} qty={c.qty} max={cities[0]?.val || 1} />
                    {c.branches.map((b) => (
                      <div key={b.name} style={{ padding: '6px 13px 6px 30px', display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--tx2)', borderTop: '1px solid var(--brd)' }}>
                        <span style={{ flex: 1 }}>{b.name}</span>
                        <span className="mono">{fmt(b.qty)} шт</span>
                        <span className="mono" style={{ fontWeight: 600 }}>{fmt(Math.round(b.val))}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </Card>
            )}

            <Card title={isManager ? 'Кто берёт в филиале' : 'Кто берёт'}>
              {spend.byPerson.length === 0 && <div style={{ padding: 26, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>Нет данных</div>}
              {spend.byPerson.slice(0, 15).map((p) => (
                <Bar key={p.id} name={p.name} val={p.val} qty={p.qty} max={spend.byPerson[0]?.val || 1} />
              ))}
            </Card>

            <Card title="Топ товаров">
              {spend.byProduct.slice(0, 15).map((p) => (
                <Bar key={p.id} name={p.name} val={p.val} qty={p.qty} max={spend.byProduct[0]?.val || 1} />
              ))}
            </Card>

            {late.length > 0 && (
              <Card title="Просрочки" extra={`${late.length} позиций`}>
                {late.slice(0, 12).map((r, i) => (
                  <div key={i} style={{ padding: '9px 13px', borderTop: '1px solid var(--brd)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.product}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{r.person} · {r.branch} · срок был {new Date(r.due_date).toLocaleDateString('ru-RU')}</div>
                    </div>
                    <span style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 20, background: 'var(--rd-l)', color: 'var(--rd-m)', whiteSpace: 'nowrap' }}>+{r.days} дн</span>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* ── Запасы ── */}
        {activeTab === 'stock' && (
          <>
            <Card title="Заканчивается" extra="прогноз по темпу расхода">
              {health.ending.length === 0 && <div style={{ padding: 26, textAlign: 'center', color: 'var(--gr-m)', fontSize: 12.5 }}>Всё в достатке</div>}
              {health.ending.slice(0, 20).map((r) => (
                <div key={r.id} style={{ padding: '9px 13px', borderTop: '1px solid var(--brd)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>остаток {r.qty} · расход {r.rate} шт/день</div>
                  </div>
                  <span style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                    background: r.days === null ? 'var(--sur2)' : r.days <= 7 ? 'var(--rd-l)' : 'var(--am-l)',
                    color: r.days === null ? 'var(--tx3)' : r.days <= 7 ? 'var(--rd-m)' : 'var(--am-m)' }}>
                    {r.days === null ? 'не расходуется' : `хватит на ${r.days} дн`}
                  </span>
                </div>
              ))}
            </Card>

            <Card title="Залежалось" extra={`без движения 90+ дней · ${som(Math.round(health.deadVal))}`}>
              {health.dead.length === 0 && <div style={{ padding: 26, textAlign: 'center', color: 'var(--gr-m)', fontSize: 12.5 }}>Всё двигается</div>}
              {health.dead.slice(0, 20).map((r) => (
                <div key={r.id} style={{ padding: '9px 13px', borderTop: '1px solid var(--brd)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                      {r.qty} шт · {r.last ? 'последняя выдача ' + new Date(r.last).toLocaleDateString('ru-RU') : 'ни разу не выдавался'}
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmt(Math.round(r.val))}</span>
                </div>
              ))}
            </Card>
          </>
        )}

        {/* ── Процесс ── */}
        {activeTab === 'proc' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
              <Kpi label="Согласование" value={proc.avgApprove != null ? proc.avgApprove + ' дн' : '—'} sub="от подачи до визы" />
              <Kpi label="До склада" value={proc.avgSend != null ? proc.avgSend + ' дн' : '—'} sub="от визы до отправки" />
              <Kpi label="Выдача" value={proc.avgIssue != null ? proc.avgIssue + ' дн' : '—'} sub="от склада до рук" />
              <Kpi label="Весь путь" value={proc.avgTotal != null ? proc.avgTotal + ' дн' : '—'} sub={`${proc.total} заявок за период`} />
            </div>

            {isManager && mine && (
              <Card title="Вы как согласующий">
                <div style={{ display: 'flex', gap: 20, padding: '12px 14px', borderTop: '1px solid var(--brd)', flexWrap: 'wrap' }}>
                  <div><div className="mono ff" style={{ fontSize: 20, fontWeight: 600 }}>{mine.avg != null ? mine.avg + ' дн' : '—'}</div><div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>в среднем на согласование</div></div>
                  <div><div className="mono ff" style={{ fontSize: 20, fontWeight: 600 }}>{mine.done}</div><div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>согласовано всего</div></div>
                  <div><div className="mono ff" style={{ fontSize: 20, fontWeight: 600, color: mine.waiting ? 'var(--am-m)' : 'var(--gr-m)' }}>{mine.waiting}</div><div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>ждёт вас сейчас</div></div>
                </div>
              </Card>
            )}

            <Card title="Где стоит сейчас" extra={`${proc.stuck.length} заявок`}>
              {proc.stuck.length === 0 && <div style={{ padding: 26, textAlign: 'center', color: 'var(--gr-m)', fontSize: 12.5 }}>Ничего не залежалось</div>}
              {proc.stuck.slice(0, 15).map((r) => (
                <div key={r.id} style={{ padding: '9px 13px', borderTop: '1px solid var(--brd)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)', width: 36 }}>№{r.id}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.stage}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.who}{r.purpose ? ' · ' + r.purpose : ''}</div>
                  </div>
                  <span style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                    background: r.days >= 3 ? 'var(--rd-l)' : 'var(--am-l)', color: r.days >= 3 ? 'var(--rd-m)' : 'var(--am-m)' }}>{r.days} дн</span>
                </div>
              ))}
            </Card>

            {!isManager && proc.load.length > 0 && (
              <Card title="Нагрузка на согласующих">
                {proc.load.map((l) => (
                  <Bar key={l.id} name={l.name} val={l.count} max={proc.load[0]?.count || 1} showMoney={false} qty={l.count} />
                ))}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
