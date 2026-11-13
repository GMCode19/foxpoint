import { Fragment, useState } from 'react'
import { sb, PHASES, err, fmtDate, phaseName } from './lib'
import { ask, toast } from './ui'
import { Icon } from './icons'
import { Avatar } from './Avatar'

// nomi brevi per i bottoni del piazzamento
const SHORT = { winner: 'Vittoria', final: 'Finale', sf: 'Semifinale', qf: 'Quarti', r16: 'Ottavi', r32: 'Top 32', r64: 'Top 64', r128: 'Top 128', groups: 'Gironi' }

// piazzamenti possibili per il tier del torneo e punti di ciascuno (partecipazione + qualified + piazzamento)
export function makeCalc(d, part) {
  const phasesFor = t => PHASES.filter(([k]) => k === 'groups' || d.tp[t.tier + ':' + k] !== undefined)
  const calc = (t, ph) => ph === 'groups' ? part : part + (d.tiers[t.tier]?.qualified_bonus || 0) + (d.tp[t.tier + ':' + ph] || 0)
  return { phasesFor, calc }
}

export function Ranked({ d, team, me, admin, part, nick, act }) {
  const now = Date.now(), DAY = 864e5
  const tier = t => d.tiers[t.tier]
  const { phasesFor, calc } = makeCalc(d, part)
  const byTour = {}
  d.entries.forEach(e => { (byTour[e.tournament_id] ||= []).push(e) })
  const entriesOf = t => byTour[t.id] || []
  const mine = t => entriesOf(t).find(e => e.blader_id === me)
  const upcoming = d.tours.filter(t => new Date(t.starts_at) > now)
  // prossime ranked: i prossimi due weekend (fino alla seconda domenica) + quelle con almeno un Lake Fox iscritto
  const sunday = new Date(now); sunday.setHours(23, 59, 59, 999); sunday.setDate(sunday.getDate() + (7 - sunday.getDay()) % 7 + 7)
  const soon = upcoming.filter(t => new Date(t.starts_at) <= sunday || entriesOf(t).length)
  const later = upcoming.length - soon.length
  const ago = t => now - new Date(t.starts_at)
  const past30 = d.tours.filter(t => ago(t) >= 0 && ago(t) < 30 * DAY).reverse()
  // "Com'è andata?": solo le MIE ranked dell'ultima settimana; quelle che aspettano qualcosa (in attesa, rifiutate) per 30 giorni
  const recent = past30.filter(t => { const m = mine(t); return m && (ago(t) < 7 * DAY || ['pending', 'rejected', 'revoked'].includes(m.status)) })
  const others = past30.filter(t => !mine(t) || (mine(t).status === 'registered' && ago(t) >= 7 * DAY))
  const done = d.entries.filter(e => e.status === 'approved')
    .map(e => ({ e, t: d.tourById[e.tournament_id] })).filter(x => x.t)
    .sort((a, z) => z.t.starts_at.localeCompare(a.t.starts_at))
  const tname = id => d.tourById[id]?.name || '?'
  const [showAll, setShowAll] = useState(false), [showLater, setShowLater] = useState(false)
  // "Partecipo" immediato: il tasto cambia subito, il server si aggiorna dietro (se fallisce si torna indietro)
  const [over, setOver] = useState({})
  const going = t => over[t.id] ?? !!mine(t)
  async function toggle(t, on, undoable = true) {
    setOver(o => ({ ...o, [t.id]: on }))
    const ok = await act(on ? 'ranked_join' : 'ranked_leave', { p_team: team, p_tournament: t.id })
    setOver(o => { const n = { ...o }; delete n[t.id]; return n })
    if (ok && undoable) toast(on ? `Sei iscritto alla ${t.name}` : `Non partecipi più alla ${t.name}`, { kind: on ? 'ok' : '', undo: () => toggle(t, !on, false) })
  }
  const st = { registered: 'iscritto', pending: 'in attesa di conferma', approved: 'confermato', rejected: 'rifiutato: puoi reinserirlo', revoked: 'revocato: puoi reinserirlo' }

  async function revokeEntry(e) {
    const why = await ask({ title: `Revocare il risultato di ${nick(e.blader_id)}?`, text: `${tname(e.tournament_id)}: i ${e.total_pts} punti verranno tolti dalla classifica.`,
      input: { placeholder: 'Motivo (facoltativo)' }, ok: 'Revoca', danger: true })
    if (why !== null && await act('ranked_revoke', { p_entry: e.id, p_note: why })) toast('Risultato revocato')
  }

  return <>
    <p className="mut note">Ogni ranked giocata vale <b>+{part}</b> di partecipazione, più i punti ufficiali PBI del piazzamento.</p>

    <h2>Prossime ranked</h2>
    {!upcoming.length && <p className="empty">Nessuna ranked in programma. Le nuove ranked del calendario PBI arrivano da sole ogni mattina.</p>}
    {(showLater ? upcoming : soon).map((t, i, list) => {
      const on = going(t)
      const ids = entriesOf(t).filter(e => e.blader_id !== me).map(e => e.blader_id)
      if (on) ids.push(me)
      const who = ids.map(nick)
      const day = dayName(t.starts_at)
      return (<Fragment key={t.id}>
        {(i === 0 || dayName(list[i - 1].starts_at) !== day) && <h3 className="day">{day}</h3>}
        <div className={'tour-card' + (on ? ' on' : '')}>
          <span className="tier num">{t.tier === 'slam' ? 'Slam' : t.tier === 'masters' ? 'MS' : t.tier}</span>
          <span className="tour-main">
            <b>{t.name}</b>
            <small>{new Date(t.starts_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}{t.city ? ` · ${t.city}` : t.club ? ` · ${t.club}` : ''}{t.url && <> · <a href={t.url} target="_blank" rel="noreferrer">pagina PBI</a></>}</small>
            <span className="going">
              {ids.slice(0, 5).map(x => <Avatar key={x} className={'mini-av' + (x === me ? ' me' : '')} url={d.avatars?.[x]} name={nick(x)} title={nick(x)} />)}
              <small>{who.length ? (who.length === 1 ? who[0] : `${who.length} Lake Fox`) : 'Nessun Lake Fox'}</small>
            </span>
          </span>
          <button type="button" className={'join' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(t, !on)}>
            {on && <Icon.check width="15" height="15" />}{on ? 'Ci sono' : 'Partecipo'}
          </button>
        </div>
      </Fragment>)
    })}
    {later > 0 && <button className="ghost more" onClick={() => setShowLater(!showLater)}>{showLater ? 'Mostra solo i prossimi due weekend' : `Mostra tutto il calendario (+${later})`}</button>}

    {(recent.length > 0 || others.length > 0) && <h2>Com'è andata?</h2>}
    {recent.map(t => <Report key={t.id} t={t} my={mine(t)} st={st} tierLabel={tier(t)?.label} phases={phasesFor(t)} calc={ph => calc(t, ph)}
      send={ph => act('ranked_report', { p_team: team, p_tournament: t.id, p_phase: ph })} />)}
    {others.length > 0 && <OtherReport tours={others} phasesFor={phasesFor} calc={calc} empty={!recent.length}
      send={(t, ph) => act('ranked_report', { p_team: team, p_tournament: t, p_phase: ph })} />}

    <h2>Risultati del team</h2>
    {!done.length && <p className="empty">Ancora nessun risultato confermato. Dopo una ranked inserisci il piazzamento in "Com'è andata?".</p>}
    {(showAll ? done : done.slice(0, 20)).map(({ e, t }) => (
      <div className="row" key={e.id}>
        <span><b>{nick(e.blader_id)}</b> · {t.name}<small>{t.starts_at.slice(0, 10)} · {phaseName(e.phase)}</small></span>
        <span className="pts num">+{e.total_pts}</span>
        {admin && <button className="ghost" onClick={() => revokeEntry(e)}>Revoca</button>}
      </div>
    ))}
    {done.length > 20 && <button className="ghost more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostra meno' : `Mostra tutti (${done.length})`}</button>}

  </>
}

const dayName = t => { const s = new Date(t).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1) }

// ranked giocata senza aver premuto "Partecipo": si sceglie dal menu delle ultime settimane
function OtherReport({ tours, phasesFor, calc, empty, send }) {
  const [open, setOpen] = useState(false), [tid, setTid] = useState(''), [ph, setPh] = useState('')
  const t = tours.find(x => x.id === tid)
  if (!open) return <button className="ghost more" onClick={() => setOpen(true)}>{empty ? 'Hai giocato una ranked? Inserisci il risultato' : 'Hai giocato un\'altra ranked?'}</button>
  return (
    <div className="row form">
      <select value={tid} onChange={e => { setTid(e.target.value); setPh('') }} aria-label="Ranked giocata">
        <option value="">Quale ranked?</option>
        {tours.map(x => <option key={x.id} value={x.id}>{x.name} · {new Date(x.starts_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</option>)}
      </select>
      <select value={ph} onChange={e => setPh(e.target.value)} disabled={!t} aria-label="Piazzamento">
        <option value="">Il tuo piazzamento…</option>
        {t && phasesFor(t).map(([k, l]) => <option key={k} value={k}>{l} (+{calc(t, k)})</option>)}
      </select>
      <button disabled={!t || !ph} onClick={() => send(t.id, ph).then(ok => { if (ok) { setOpen(false); setTid(''); setPh(''); toast('Risultato inviato · in attesa di un admin', { kind: 'ok' }) } })}>Invia</button>
      <button className="ghost" onClick={() => setOpen(false)}>Annulla</button>
    </div>
  )
}

function Report({ t, my, st, tierLabel, phases, calc, send }) {
  const [ph, setPh] = useState(my?.phase || '')
  const locked = my && (my.status === 'approved')
  const [edit, setEdit] = useState(!my || my.status === 'registered' || ['rejected', 'revoked'].includes(my.status))
  async function go() { if (await send(ph)) { setEdit(false); toast('Risultato inviato · in attesa di un admin', { kind: 'ok' }) } }
  return (
    <div className="report">
      <span className="report-head"><b>{t.name}</b><small>{tierLabel} · {fmtDate(t.starts_at)}</small></span>
      {my && my.status !== 'registered' && !edit && (
        <p className={'report-state ' + my.status}>{my.status === 'approved' && <Icon.check width="16" height="16" />}{phaseName(my.phase)} · {my.total_pts} pt · {st[my.status]}
          {!locked && <button type="button" className="link mini" onClick={() => setEdit(true)}>cambia</button>}</p>
      )}
      {!locked && edit && <>
        {my && ['rejected', 'revoked'].includes(my.status) && <p className="report-state bad">{st[my.status]}</p>}
        <div className="phase-chips" role="group" aria-label="Il tuo piazzamento">
          {phases.map(([k]) => <button key={k} type="button" className={'chip' + (ph === k ? ' on' : '')} aria-pressed={ph === k} onClick={() => setPh(k)}>{SHORT[k] || phaseName(k)}</button>)}
        </div>
        <button type="button" disabled={!ph} onClick={go}>{ph ? `Invia · ${SHORT[ph] || phaseName(ph)} (+${calc(ph)} pt)` : 'Scegli il tuo piazzamento'}</button>
      </>}
    </div>
  )
}

export function AdminResult({ d, phasesFor, calc, act }) {
  const [tid, setTid] = useState(''), [b, setB] = useState(''), [ph, setPh] = useState('')
  const past = d.tours.filter(t => new Date(t.starts_at) <= Date.now()).reverse()
  const t = d.tours.find(x => x.id === tid)
  return (
    <div className="row">
      <select value={tid} onChange={e => { setTid(e.target.value); setPh('') }}>
        <option value="">Ranked…</option>
        {past.map(x => <option key={x.id} value={x.id}>{x.name} ({x.starts_at.slice(0, 10)})</option>)}
      </select>
      <select value={b} onChange={e => setB(e.target.value)}>
        <option value="">Blader…</option>
        {d.board.map(r => <option key={r.blader_id} value={r.blader_id}>{r.nickname}</option>)}
      </select>
      <select value={ph} onChange={e => setPh(e.target.value)} disabled={!t}>
        <option value="">Piazzamento…</option>
        {t && phasesFor(t).map(([k, l]) => <option key={k} value={k}>{l} (+{calc(t, k)})</option>)}
      </select>
      <button disabled={!tid || !b || !ph} onClick={() => act('ranked_admin_register', { p_tournament: tid, p_blader: b, p_phase: ph }).then(ok => { if (ok) { setPh(''); toast('Risultato registrato', { kind: 'ok' }) } })}>Registra</button>
    </div>
  )
}

export function AddTournament({ team, tiers, reload }) {
  const empty = { name: '', tier: '', date: '', time: '14:00', club: '', city: '', url: '' }
  const [f, setF] = useState(empty)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  async function save() {
    const { error } = await sb.from('tournaments').insert({
      name: f.name.trim(), tier: f.tier, starts_at: new Date(`${f.date}T${f.time}`).toISOString(),
      club: f.club.trim() || null, city: f.city.trim() || null, url: f.url.trim() || null, created_by_team: team,
    })
    if (error) return err(error)
    setF(empty); toast('Ranked aggiunta', { kind: 'ok' }); reload()
  }
  return (
    <div className="row form">
      <input placeholder="Nome (es. PBI 640 - Grilled Shark)" value={f.name} onChange={set('name')} />
      <select value={f.tier} onChange={set('tier')}>
        <option value="">Tier…</option>
        {tiers.map(t => <option key={t.tier} value={t.tier}>{t.label}</option>)}
      </select>
      <input type="date" value={f.date} onChange={set('date')} />
      <input type="time" value={f.time} onChange={set('time')} />
      <input placeholder="Club" value={f.club} onChange={set('club')} />
      <input placeholder="Città" value={f.city} onChange={set('city')} />
      <input placeholder="Link pagina PBI (facoltativo)" value={f.url} onChange={set('url')} />
      <button disabled={!f.name.trim() || !f.tier || !f.date} onClick={save}>Aggiungi</button>
    </div>
  )
}
