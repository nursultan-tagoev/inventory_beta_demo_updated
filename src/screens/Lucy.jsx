import { useState, useRef, useEffect } from 'react'
import { Btn, Input, useToast } from '../components/ui'
import { supabase } from '../supabaseClient'
import { saveMovement } from '../lib/ops'
import { norm, parseQty, matchName, localBrain, askLucy, runAnalytics } from '../lib/lucy'

const TL = { in: 'Приход', out: 'Выдача', return: 'Возврат', writeoff: 'Списание' }

export default function Lucy({ data, profile, can, setView, autostart, onAutostart }) {
  const toast = useToast()
  const role = profile?.role || 'employee'
  const [messages, setMessages] = useState([{ id: 0, from: 'a', text: 'Здравствуйте! Я Люси. Скажите или напишите: «выдай Айгерим 5 футболок», «сколько ручек», «покажи отчёты». Микрофон — кнопка справа. Скажете «Люси, спасибо» — попрощаюсь.' }])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(null)   // редактируемая карточка подтверждения
  const [vstate, setVstate] = useState('off')
  const [hf, setHf] = useState(false)
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null); const idRef = useRef(1); const histRef = useRef([])
  const recRef = useRef(null); const modeRef = useRef('off'); const hfRef = useRef(false)
  const speakingRef = useRef(false); const voiceRef = useRef(null); const startingRef = useRef(false)
  const opRef = useRef(null); const sendRef = useRef(null); const micRef = useRef(null)
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth' }) }, [messages, pending])
  useEffect(() => {
    if (!window.speechSynthesis) return
    const pick = () => { const v = window.speechSynthesis.getVoices(); voiceRef.current = v.find((x) => /ru/i.test(x.lang) && /tatyana|татьяна|alena|милена|milena|female|женск/i.test(x.name)) || v.find((x) => /ru/i.test(x.lang) && /google/i.test(x.name)) || v.find((x) => /ru/i.test(x.lang)) || null }
    pick(); window.speechSynthesis.onvoiceschanged = pick
  }, [])
  useEffect(() => () => { hfRef.current = false; try { recRef.current?.stop() } catch (e) {}; try { micRef.current?.getTracks().forEach((t) => t.stop()) } catch (e) {}; window.speechSynthesis?.cancel() }, [])
  useEffect(() => { if (autostart) { setTimeout(() => { try { tapMic() } catch (e) {} }, 350); onAutostart?.() } }, [])

  const push = (from, text) => setMessages((m) => [...m, { id: idRef.current++, from, text }])
  const speak = (t, listenAfter) => {
    const after = () => { speakingRef.current = false; if (listenAfter) { modeRef.current = 'wake'; setVstate('listening') } else { setVstate(hfRef.current ? 'listening' : 'off') } }
    if (!window.speechSynthesis) return after()
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance((t || '').replace(/\bшт\b\.?/g, 'штук').replace(/[×]/g, ' по '))
    u.lang = 'ru-RU'; if (voiceRef.current) u.voice = voiceRef.current; u.rate = 0.96; u.pitch = 1.06
    speakingRef.current = true; setVstate('speaking'); u.onend = u.onerror = after; window.speechSynthesis.speak(u)
  }
  const reply = (t, listenAfter) => { push('a', t); histRef.current.push({ role: 'assistant', text: t }); speak(t, listenAfter !== false) }

  const resolveItems = (items) => items.map((it) => { const nm = matchName(it.product || '', data.products.filter((p) => !p.archived).map((p) => p.name)); const p = data.products.find((x) => x.name === nm); return { ...it, product_id: p?.id, product_name: p?.name || it.product } })

  const continueOp = (op) => {
    const items = op.items || []
    if (!items.length) { opRef.current = { ...op, await: 'product' }; return reply('Какой товар?', true) }
    const qi = items.findIndex((it) => !it.quantity)
    if (qi >= 0) { opRef.current = { ...op, await: 'qty', qi }; return reply(`Сколько «${items[qi].product}»?`, true) }
    if ((op.type === 'out' || op.type === 'return') && !op.recipient) { opRef.current = { ...op, await: 'recipient' }; return reply(op.type === 'return' ? 'От кого возврат?' : 'Кому выдать?', true) }
    opRef.current = null
    setPending({ type: op.type, items: resolveItems(items), recipient: op.recipient || '', purpose: op.purpose || '' })
    const sum = items.map((it) => `${it.quantity} штук ${it.product}`).join(', ')
    speak(`Проверьте: ${TL[op.type]}, ${sum}${op.recipient ? ' для ' + op.recipient : ''}. Всё верно — нажмите подтвердить.`, false)
  }

  const dispatch = async (call) => {
    const { name, args = {} } = call
    if (name === 'create_operation') {
      if (!can('move')) return reply('Оформлять операции может только администратор или менеджер. Но я покажу остатки или аналитику — что нужно?')
      let items = Array.isArray(args.items) ? args.items.filter((i) => i && i.product).map((i) => ({ product: i.product, quantity: i.quantity || null })) : []
      if (!items.length && args.product) items = [{ product: args.product, quantity: args.quantity || null }]
      return continueOp({ type: args.type || 'out', items, recipient: args.recipient || '', purpose: args.purpose || '' })
    }
    if (name === 'open_screen') { setView(args.screen || 'home'); return reply('Открываю раздел.') }
    const ans = runAnalytics(name, args, data)
    if (ans != null) return reply(ans)
    reply('Готово.')
  }

  const send = async (raw) => {
    const text = (raw || '').trim(); if (!text || busy) return
    const n = norm(text)
    // стоп-команда
    if (/^(люси\s+)?(спасибо|благодарю|отбой|до свидания|отдыхай|пока люси|стоп люси)$/.test(n.replace(/\s+люси$/, '').trim()) || /^(спасибо|отбой|отдыхай)$/.test(n)) {
      push('u', text); setInput('')
      const bye = ['Всегда пожалуйста! Убегаю к полкам. Понадоблюсь — просто позовите.', 'Рада была помочь! Отключаюсь. Что нужно — зовите, я мигом.']
      const b = bye[Math.floor(Math.random() * bye.length)]; push('a', b); speak(b, false)
      hfRef.current = false; setHf(false); modeRef.current = 'off'; setVstate('off'); try { recRef.current?.stop() } catch (e) {}; setPending(null); opRef.current = null; return
    }
    // ответ на пошаговый вопрос операции
    if (opRef.current) {
      const op = { ...opRef.current }; const aw = op.await; const qi = op.qi; delete op.await; delete op.qi
      if (/^(отмена|отмени|стоп|нет)/.test(n)) { opRef.current = null; push('u', text); setInput(''); return reply('Отменила. Что-нибудь ещё?') }
      push('u', text); setInput('')
      if (aw === 'product') op.items = [{ product: text.trim(), quantity: null }]
      else if (aw === 'qty') { const q = parseQty(n); if (q == null) { opRef.current = { ...op, await: 'qty', qi }; return reply('Не расслышала число. Сколько штук?', true) } op.items = op.items.map((it, i) => i === (qi || 0) ? { ...it, quantity: q } : it) }
      else if (aw === 'recipient') op.recipient = text.trim()
      return continueOp(op)
    }
    push('u', text); setInput('')
    histRef.current.push({ role: 'user', text }); histRef.current = histRef.current.slice(-14)
    setBusy(true)
    try {
      // локально-первым: дешёвые интенты без ИИ
      const loc = localBrain(text, role, data.products, data.recipients)
      if (loc && loc.call && loc._cheap) { await dispatch(loc.call) }
      else {
        const res = await askLucy(text, role, histRef.current)
        if (res.error && !res.call && !res.text) reply('ИИ пока не подключён (нужны ключи в настройках сервера) — но по складу я помогу: остатки, просрочки, операции. ' )
        else if (res.call) await dispatch(res.call)
        else if (res.text) reply(res.text)
        else reply('Не совсем поняла, повторите?', true)
      }
    } catch (e) { reply('Связь прервалась. По складу отвечаю и так — спросите остаток или назовите операцию.') }
    setBusy(false)
  }
  sendRef.current = send

  const confirmSave = async () => {
    const p = pending; if (!p) return
    const bad = p.items.filter((it) => !it.product_id)
    if (bad.length) { toast('Не найдены товары: ' + bad.map((b) => b.product_name).join(', '), 'error'); return }
    let recipient_id = null, branch_id = null
    if (p.type === 'out' || p.type === 'return') {
      const nm = matchName(p.recipient || '', data.recipients.map((r) => r.name))
      let rec = data.recipients.find((r) => r.name === nm)
      if (!rec && p.recipient) { const { data: nr } = await supabase.from('recipients').insert({ name: p.recipient.trim() }).select().single(); rec = nr }
      recipient_id = rec?.id || null; branch_id = rec?.branch_id || null
    }
    let ok = 0
    for (const it of p.items) {
      const { error } = await saveMovement({ type: p.type, product_id: it.product_id, qty: it.quantity, recipient_id, branch_id, purpose: p.purpose, issuer_id: profile.id }, data.stock)
      if (error) { toast(it.product_name + ': ' + error, 'error') } else ok++
    }
    setPending(null); data.reload()
    if (ok) { const msg = `Готово! ${TL[p.type]} оформлена (${ok} поз.).`; push('a', msg); speak('Готово, операция сохранена.', false); toast('Операция сохранена') }
  }

  /* ── голос ── */
  const primeMic = async () => { if (micRef.current || !navigator.mediaDevices?.getUserMedia) return; try { micRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) } catch (e) {} }
  const detectWake = (low) => { const m = low.match(/(?:эй|окей|ок|привет|слушай)?[,\s]*(?:люси|склад[а-я]*)[,.!?\s]*(.*)$/i); if (m && (/(?:эй|окей|ок|привет|слушай)/.test(low) || /^(?:люси|склад)/.test(low.trim()))) return { hit: true, rest: (m[1] || '').trim() }; return { hit: false, rest: '' } }
  const routeVoice = (tr, conf) => {
    if (speakingRef.current) return
    const low = norm(tr); const weak = typeof conf === 'number' && conf > 0 && conf < 0.5
    if (modeRef.current === 'wake') { if (weak && low.length < 4) return; modeRef.current = 'idle'; sendRef.current(tr); return }
    if (weak) return
    const w = detectWake(low); if (w.hit) { if (w.rest && w.rest.length > 2) sendRef.current(w.rest); else { modeRef.current = 'wake'; setVstate('listening'); speak('Слушаю', true) } }
  }
  const startRec = () => {
    if (!SR || startingRef.current) return; startingRef.current = true; try { recRef.current?.stop() } catch (e) {}
    const r = new SR(); r.lang = 'ru-RU'; r.continuous = true; r.interimResults = false; r.maxAlternatives = 1
    r.onresult = (e) => { const res = e.results[e.results.length - 1]; if (res?.isFinal) routeVoice(res[0].transcript, res[0].confidence) }
    r.onerror = (e) => { startingRef.current = false; if (e.error === 'not-allowed') { hfRef.current = false; setHf(false); setVstate('off'); push('a', 'Нет доступа к микрофону — разрешите его в браузере.') } }
    r.onend = () => { startingRef.current = false; if (hfRef.current) setTimeout(() => { if (hfRef.current) startRec() }, 130) }
    recRef.current = r; try { r.start() } catch (e) { startingRef.current = false }
  }
  const toggleHF = () => {
    if (hf) { hfRef.current = false; setHf(false); modeRef.current = 'off'; setVstate('off'); try { recRef.current?.stop() } catch (e) {}; window.speechSynthesis?.cancel(); return }
    if (!SR) { push('a', 'Голос доступен в Chrome/Edge при интернете. Пишите текстом.'); return }
    hfRef.current = true; setHf(true); primeMic(); startRec(); speak('Готова! Скажите «Эй, Люси» или называйте команду.', false)
  }
  const tapMic = () => { if (!SR) { push('a', 'Голос доступен в Chrome/Edge. Наберите команду ниже.'); return } primeMic(); if (!hfRef.current) { hfRef.current = true; setHf(true); startRec() } speak('Слушаю. Что нужно?', true) }

  const ring = vstate === 'listening' ? 'var(--gr)' : vstate === 'speaking' ? 'var(--pu)' : 'var(--ink)'
  const label = busy ? 'Думаю…' : vstate === 'listening' ? (modeRef.current === 'wake' ? 'Слушаю команду…' : 'Жду «Эй, Люси»…') : vstate === 'speaking' ? 'Отвечаю…' : (hf ? 'Жду «Эй, Люси»' : 'Нажмите микрофон или скажите «Эй, Люси»')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--brd)', background: 'var(--sur)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(150deg,var(--ink),var(--pu))', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700 }}>Л</div>
        <div style={{ flex: 1 }}><div className="ff" style={{ fontSize: 18, fontWeight: 600 }}>Люси</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>операции · аналитика · навигация</div></div>
        <button className={'chip'} onClick={toggleHF} style={{ height: 34, padding: '0 13px', borderRadius: 9, border: `1px solid ${hf ? 'var(--gr)' : 'var(--brd2)'}`, background: hf ? 'var(--gr-l)' : 'var(--sur)', color: hf ? 'var(--gr-m)' : 'var(--tx2)', fontSize: 12.5, fontWeight: 600 }}>{hf ? '🟢 Руки свободны' : '🎧 Руки свободны'}</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0 18px' }}>
            <button onClick={tapMic} style={{ position: 'relative', width: 88, height: 88, borderRadius: '50%', background: `color-mix(in srgb,${ring} 12%,var(--sur))`, border: `1px solid color-mix(in srgb,${ring} 35%,transparent)`, color: ring, display: 'grid', placeItems: 'center', marginBottom: 10 }}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3ZM6 11a6 6 0 0 0 12 0M12 19v3" /></svg>
            </button>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
          </div>

          {messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 11, display: 'flex', justifyContent: m.from === 'u' ? 'flex-end' : 'flex-start' }}>
              <div className="card" style={{ maxWidth: '82%', padding: '11px 15px', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-line', boxShadow: 'none', background: m.from === 'u' ? 'var(--ink)' : 'var(--sur)', color: m.from === 'u' ? '#fff' : 'var(--tx)', border: m.from === 'u' ? 'none' : '1px solid var(--brd)' }}>{m.text}</div>
            </div>
          ))}

          {pending && <div className="card" style={{ padding: 16, marginBottom: 12, border: '1.5px solid var(--ink)' }}>
            <div className="ff" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>Проверьте и подтвердите · {TL[pending.type]}</div>
            {pending.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 13.5, color: it.product_id ? 'var(--tx)' : 'var(--rd)' }}>{it.product_name}{!it.product_id && ' (не найден)'}</span>
                <input type="number" value={it.quantity} onChange={(e) => setPending((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x) }))} style={{ width: 72, height: 36, padding: '0 10px', borderRadius: 9, border: '1px solid var(--brd2)', background: 'var(--sur)', fontSize: 13, textAlign: 'right' }} />
                <span style={{ fontSize: 12, color: 'var(--tx3)' }}>шт</span>
              </div>
            ))}
            {(pending.type === 'out' || pending.type === 'return') && <div style={{ marginTop: 6 }}><span style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>{pending.type === 'return' ? 'От кого' : 'Кому'}</span><Input value={pending.recipient} onChange={(e) => setPending((p) => ({ ...p, recipient: e.target.value }))} placeholder="Имя получателя" /></div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Btn onClick={confirmSave}>✓ Подтвердить</Btn><Btn v="secondary" onClick={() => { setPending(null); push('a', 'Отменила.') }}>Отмена</Btn></div>
          </div>}
          <div ref={endRef} />
        </div>
      </div>

      <div style={{ padding: '12px 22px', background: 'var(--sur)', borderTop: '1px solid var(--brd)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) send(input) }} placeholder="Напишите Люси…" style={{ flex: 1, height: 44, padding: '0 15px', borderRadius: 12, border: '1px solid var(--brd2)', background: 'var(--bg)', fontSize: 14 }} />
          <Btn onClick={() => input.trim() && send(input)} disabled={busy} style={{ width: 48 }}>→</Btn>
        </div>
      </div>
    </div>
  )
}
