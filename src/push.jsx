// Notifiche sul telefono: attivazione, scelta degli avvisi, prova.
// iPhone: funzionano solo con l'app aggiunta alla schermata Home (iOS 16.4 o successivo).
import { useEffect, useState } from 'react'
import { sb, err } from './lib'
import { Sheet, toast } from './ui'
import { Icon } from './icons'

const FN_URL = 'https://udjviairelbvohdfwhhb.supabase.co/functions/v1/push'
const KINDS = [
  ['mine', 'Le mie taglie e i miei risultati', 'Vittorie e piazzamenti confermati, e chi dichiara di averti battuto'],
  ['overtake', 'Sorpassi in classifica', 'Quando qualcuno del team ti supera'],
  ['ranked', 'Nuove ranked', 'Quando nel calendario PBI compare una nuova ranked'],
  ['admin', 'Richieste da approvare', 'Solo per gli admin: vittorie, risultati e nuovi membri'],
]
const ub64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)) }
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function publicKey() {
  const { data, error } = await sb.rpc('push_public_key')
  if (error) throw new Error('Le notifiche non sono ancora attive: va eseguito lo script foxpoint_09_notifiche.sql su Supabase')
  if (data) return data
  const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"init":true}' }).catch(() => null)
  const j = r?.ok ? await r.json().catch(() => null) : null
  if (!j?.publicKey) throw new Error('Le notifiche non sono ancora attive: manca la funzione "push" su Supabase')
  return j.publicKey
}

export function Notifications({ me, admin }) {
  const [open, setOpen] = useState(false), [sub, setSub] = useState(null), [prefs, setPrefs] = useState(null), [busy, setBusy] = useState(false)
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'))
  const can = supported()

  useEffect(() => {
    if (!can) return
    let live = true
    navigator.serviceWorker.getRegistration().then(reg => reg?.pushManager.getSubscription()).then(async s => {
      if (!live || !s) return
      const { data } = await sb.from('push_subscriptions').select('prefs').eq('endpoint', s.endpoint).maybeSingle()
      if (!live) return
      if (data) { setSub(s); setPrefs(data.prefs) }
    }).catch(() => {})
    return () => { live = false }
  }, [can])

  async function enable() {
    setBusy(true)
    try {
      const p = await Notification.requestPermission()
      setPerm(p)
      if (p !== 'granted') return
      const key = await publicKey()
      const reg = await navigator.serviceWorker.ready
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ub64u(key) })
      const j = s.toJSON()
      const row = { blader_id: me, endpoint: s.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }
      const { data, error } = await sb.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' }).select('prefs').single()
      if (error) throw error
      setSub(s); setPrefs(data.prefs)
      await sb.rpc('push_test')
      toast('Notifiche attive: tra poco ne arriva una di prova', { kind: 'ok' })
    } catch (e) { err(e) } finally { setBusy(false) }
  }
  async function disable() {
    setBusy(true)
    try {
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe().catch(() => {})
      setSub(null); setPrefs(null); toast('Notifiche disattivate')
    } catch (e) { err(e) } finally { setBusy(false) }
  }
  async function setPref(k, v) {
    const next = { ...prefs, [k]: v }
    setPrefs(next)
    const { error } = await sb.from('push_subscriptions').update({ prefs: next }).eq('endpoint', sub.endpoint)
    if (error) { setPrefs(prefs); err(error) }
  }

  const state = sub ? 'attive' : perm === 'denied' ? 'bloccate' : 'spente'
  return <>
    <button type="button" onClick={() => setOpen(true)}><Icon.bell /><span>Notifiche</span><small className="menu-state">{state}</small><Icon.chevron /></button>
    {open && (
      <Sheet onClose={() => setOpen(false)} label="Notifiche">
        <h2 className="sheet-title">Notifiche</h2>
        {!can ? (
          <p className="sheet-note">{ios() && !standalone()
            ? <>Su iPhone le notifiche funzionano solo dall'app sulla schermata Home: in Safari tocca <b>Condividi</b> → <b>Aggiungi alla schermata Home</b>, poi apri Fox Point da lì.</>
            : 'Questo browser non supporta le notifiche. Apri Fox Point dall\'app sulla schermata Home.'}</p>
        ) : perm === 'denied' && !sub ? (
          <p className="sheet-note">Le notifiche sono bloccate per Fox Point. Riattivale dalle impostazioni del telefono ({ios() ? 'Impostazioni → Notifiche → Fox Point' : 'Impostazioni → App → Fox Point → Notifiche'}), poi torna qui.</p>
        ) : !sub ? <>
          <p className="sheet-text">Ricevi un avviso quando una tua vittoria viene confermata, quando qualcuno ti supera o quando arriva una nuova ranked. Potrai scegliere quali avvisi tenere.</p>
          <div className="sheet-actions"><button type="button" disabled={busy} onClick={enable}>{busy ? 'Attivazione…' : 'Attiva le notifiche'}</button></div>
        </> : <>
          <div className="menu">
            {KINDS.filter(([k]) => k !== 'admin' || admin).map(([k, l, d]) => (
              <label key={k} className="switch-row">
                <span>{l}<small>{d}</small></span>
                <input type="checkbox" role="switch" className="switch" checked={prefs?.[k] !== false} onChange={e => setPref(k, e.target.checked)} />
              </label>
            ))}
          </div>
          <div className="sheet-actions">
            <button type="button" className="ghost" disabled={busy} onClick={disable}>Disattiva</button>
            <button type="button" className="ghost" onClick={() => sb.rpc('push_test').then(({ error }) => error ? err(error) : toast('Notifica di prova inviata'))}>Prova</button>
          </div>
        </>}
      </Sheet>
    )}
  </>
}
