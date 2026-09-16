import { useState, useEffect } from 'react'
import { Btn, useToast, Confirm } from '../components/ui'
import { SIZES } from '../components/Label'
import {
  listIntegrations, saveIntegration, deleteIntegration, setActive,
  testPrinter, pingPrinter,
} from '../lib/integrations'

/* Устройства и сервисы. Сейчас принтеры и камера, но тип — поле,
   поэтому весы или обмен с бухгалтерией добавятся без перестройки. */

const BLANK = { kind: 'printer', name: '', host: '', port: 9100, warehouse_id: '', label_size: '40x30', is_active: true }

export default function Integrations({ data, profile }) {
  const { warehouses } = data
  const toast = useToast()
  const isSuper = profile?.role === 'admin'

  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const reload = () => listIntegrations().then(setList)
  useEffect(() => { reload() }, [])

  const printers = (list || []).filter((x) => x.kind === 'printer')
  const camera = (list || []).find((x) => x.kind === 'camera')

  const check = async (p, kind) => {
    setChecking(p.id)
    const { error } = kind === 'test' ? await testPrinter(p.id) : await pingPrinter(p.id)
    setChecking(null)
    reload()
    if (error) return toast(error, 'error')
    toast(kind === 'test' ? 'Пробная наклейка отправлена' : 'Принтер отвечает')
  }

  const whName = (id) => warehouses?.find((w) => w.id === id)?.name || 'все склады'

  const inp = {
    width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 11,
    border: '1.5px solid var(--brd)', background: 'var(--sur)', fontSize: 13.5, color: 'var(--tx)',
  }
  const lbl = (t) => <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 4 }}>{t}</div>

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 80px', animation: 'fadeUp .3s ease' }}>
      <div className="head-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="ff" style={{ fontSize: 21, fontWeight: 600 }}>Интеграции</span>
        {isSuper && (
          <Btn size="sm" onClick={() => setEdit({ ...BLANK })} style={{ marginLeft: 'auto', minHeight: 40 }}>
            ＋ Принтер
          </Btn>
        )}
      </div>

      {/* ── Сканирование ── */}
      <div className="card" style={{ padding: 15, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--ink-l)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>📷</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Сканирование камерой</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
              Кнопка камеры в приёмке, выдаче, сверке и поиске. Подключать ничего не нужно.
            </div>
          </div>
          {isSuper && camera && (
            <button onClick={async () => {
              const { error } = await setActive(camera.id, !camera.is_active)
              if (error) return toast(error, 'error')
              reload()
            }} style={{ minHeight: 38, padding: '0 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
              background: camera.is_active ? 'var(--gr-l)' : 'var(--sur2)',
              color: camera.is_active ? 'var(--gr-m)' : 'var(--tx3)' }}>
              {camera.is_active ? 'Включено' : 'Выключено'}
            </button>
          )}
        </div>
      </div>

      {/* ── Принтеры ── */}
      <div style={{ fontSize: 11, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 8px 2px' }}>
        Принтеры наклеек
      </div>

      {list === null && <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>Загрузка…</div>}

      {list !== null && printers.length === 0 && (
        <div className="card" style={{ padding: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 9 }}>🖨</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Принтеров нет</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
            Пока их нет, наклейки печатаются через окно браузера.<br />
            Нужен принтер с Ethernet или Wi-Fi: к USB браузер подключиться не может.
          </div>
        </div>
      )}

      {printers.map((p) => (
        <div key={p.id} className="card" style={{ padding: 15, marginBottom: 10, opacity: p.is_active ? 1 : 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--sur2)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>🖨</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                {p.last_error
                  ? <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 20, background: 'var(--rd-l)', color: 'var(--rd-m)' }}>нет связи</span>
                  : p.last_ok_at
                    ? <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 20, background: 'var(--gr-l)', color: 'var(--gr-m)' }}>отвечал</span>
                    : <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 20, background: 'var(--sur2)', color: 'var(--tx3)' }}>не проверялся</span>}
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 3 }}>
                {p.host}:{p.port} · {p.label_size} мм · {whName(p.warehouse_id)}
              </div>
              {p.last_error && (
                <div style={{ fontSize: 11, color: 'var(--rd-m)', marginTop: 4, lineHeight: 1.5 }}>{p.last_error}</div>
              )}
              {p.last_ok_at && !p.last_error && (
                <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3 }}>
                  последний раз отвечал {new Date(p.last_ok_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>

          <div className="btn-row" style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
            <Btn size="sm" v="secondary" loading={checking === p.id} onClick={() => check(p, 'ping')} style={{ minHeight: 40 }}>Проверить связь</Btn>
            <Btn size="sm" v="secondary" onClick={() => check(p, 'test')} style={{ minHeight: 40 }}>Пробная наклейка</Btn>
            {isSuper && <>
              <Btn size="sm" v="secondary" onClick={() => setEdit({ ...p })} style={{ minHeight: 40 }}>Изменить</Btn>
              <button onClick={async () => { await setActive(p.id, !p.is_active); reload() }}
                style={{ minHeight: 40, padding: '0 12px', borderRadius: 9, fontSize: 12.5, color: 'var(--tx3)', background: 'var(--sur2)' }}>
                {p.is_active ? 'Отключить' : 'Включить'}
              </button>
              <button onClick={() => setConfirm(p)}
                style={{ minHeight: 40, padding: '0 12px', borderRadius: 9, fontSize: 12.5, color: 'var(--rd-m)' }}>Удалить</button>
            </>}
          </div>
        </div>
      ))}

      {/* ── Карточка принтера ── */}
      {edit && (
        <div onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(8,10,14,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 16, overflow: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 430, padding: 20 }}>
            <div className="ff" style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>
              {edit.id ? 'Изменить принтер' : 'Новый принтер'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div>{lbl('Название')}
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  placeholder="Принтер на складе" style={inp} />
              </div>

              <div style={{ display: 'flex', gap: 9 }}>
                <div style={{ flex: 2 }}>{lbl('Адрес в сети')}
                  <input value={edit.host} onChange={(e) => setEdit({ ...edit, host: e.target.value })}
                    placeholder="192.168.1.50" style={inp} />
                </div>
                <div style={{ flex: 1 }}>{lbl('Порт')}
                  <input value={edit.port} onChange={(e) => setEdit({ ...edit, port: e.target.value.replace(/[^0-9]/g, '') })}
                    style={inp} />
                </div>
              </div>

              <div>{lbl('Склад — принтер подставится при печати на нём')}
                <select value={edit.warehouse_id || ''} onChange={(e) => setEdit({ ...edit, warehouse_id: e.target.value })} style={inp}>
                  <option value="">Все склады</option>
                  {(warehouses || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div>{lbl('Размер наклейки')}
                <select value={edit.label_size} onChange={(e) => setEdit({ ...edit, label_size: e.target.value })} style={inp}>
                  {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 11, fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.6 }}>
                Порт 9100 — стандартный для сетевой печати. Адрес смотрите в настройках
                принтера или на распечатке его конфигурации.
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Btn loading={busy} onClick={async () => {
                  setBusy(true)
                  const { error } = await saveIntegration(edit)
                  setBusy(false)
                  if (error) return toast(error, 'error')
                  toast('Сохранено'); setEdit(null); reload()
                }} style={{ flex: 1, minHeight: 46 }}>Сохранить</Btn>
                <Btn v="secondary" onClick={() => setEdit(null)} style={{ minHeight: 46 }}>Отмена</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <Confirm danger title="Удалить принтер?" message={`${confirm.name} будет удалён из списка подключений.`}
          onCancel={() => setConfirm(null)}
          onOk={async () => { await deleteIntegration(confirm.id); setConfirm(null); reload(); toast('Удалён') }} />
      )}
    </div>
  )
}
