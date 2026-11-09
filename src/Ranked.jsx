import { Fragment, useState } from 'react'
import { sb, PHASES, err, fmtDate, phaseName } from './lib'

export function Ranked({ d, team, me, admin, part, nick, act, reload }) {
  const now = Date.now(), DAY = 864e5
  const tier = t => d.tiers[t.tier]
  const phasesFor = t => PHASES.filter(([k]) => k === 'groups' || d.tp[t.tier + ':' + k] !== undefined)
  const calc = (t, ph) => ph === 'groups' ? part : part + (tier(t)?.qualified_bonus || 0) + (d.tp[t.tier + ':' + ph] || 0)
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
  const pending = d.entries.filter(e => e.status === 'pending')
  const tname = id => d.tourById[id]?.name || '?'
  const [showAll, setShowAll] = useState(false), [showLater, setShowLater] = useState(false)
  const st = { registered: 'iscritto', pending: '⏳ in attesa di conferma', approved: '✅ confermato', rejected: '❌ rifiutato: puoi reinserirlo', revoked: '↩️ revocato: puoi reinserirlo' }

  async function revokeEntry(e) {
    const why = prompt(`Revocare il risultato di ${nick(e.blader_id)} (${tname(e.tournament_id)}, ${e.total_pts} pt)?\nI punti verranno tolti dalla classifica.\n\nMotivo (facoltativo):`)
    if (why === null) return
    act('ranked_revoke', { p_entry: e.id, p_note: why })
  }

  return <>
    <p className="mut note">Ogni ranked giocata vale <b>+{part}</b> di partecipazione, più i punti ufficiali PBI del piazzamento (bonus qualified compreso).</p>

    {admin && pending.length > 0 && <>
      <h2>Risultati da confermare</h2>
      {pending.map(e => (
        <div className="row" key={e.id}>
          <span><b>{nick(e.blader_id)}</b> · {tname(e.tournament_id)}<small>{phaseName(e.phase)} · {e.total_pts} pt ({e.participation_pts} + {e.qualified_pts} + {e.placement_pts})</small></span>
          <button onClick={() => act('ranked_decide', { p_entry: e.id, p_approve: true, p_phase: e.phase })}>Conferma</button>
          <button className="ghost" onClick={() => act('ranked_decide', { p_entry: e.id, p_approve: false, p_phase: e.phase })}>Rifiuta</button>
        </div>
      ))}
    </>}

    <h2>Prossime ranked</h2>
    {!upcoming.length && <p className="mut">Nessuna ranked in programma.{admin ? ' Aggiungila qui sotto.' : ''}</p>}
    {(showLater ? upcoming : soon).map((t, i, list) => {
      const my = mine(t), going = entriesOf(t).map(e => nick(e.blader_id))
      const day = dayName(t.starts_at)
      return (<Fragment key={t.id}>
        {(i === 0 || dayName(list[i - 1].starts_at) !== day) && <h3 className="day">{day}</h3>}
        <div className="row tour">
          <span className="tier">{t.tier === 'slam' ? 'Slam' : tier(t)?.label.replace('PBI ', '')}</span>
          <span><b>{t.name}</b>
            <small>{fmtDate(t.starts_at)}{t.club ? ` · ${t.club}` : ''}{t.city ? `, ${t.city}` : ''}</small>
            <small>{going.length ? `🦊 ${going.join(', ')}` : 'Nessun Lake Fox iscritto'}{t.url && <> · <a href={t.url} target="_blank" rel="noreferrer">pagina PBI</a></>}</small>
          </span>
          {my
            ? <button className="ghost" onClick={() => act('ranked_leave', { p_team: team, p_tournament: t.id })}>Non partecipo</button>
            : <button onClick={() => act('ranked_join', { p_team: team, p_tournament: t.id })}>Partecipo</button>}
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
    {!done.length && <p className="mut">Ancora nessun risultato confermato.</p>}
    {(showAll ? done : done.slice(0, 20)).map(({ e, t }) => (
      <div className="row" key={e.id}>
        <span><b>{nick(e.blader_id)}</b> · {t.name}<small>{t.starts_at.slice(0, 10)} · {phaseName(e.phase)}</small></span>
        <span className="pts">+{e.total_pts}</span>
        {admin && <button className="ghost" onClick={() => revokeEntry(e)}>Revoca</button>}
      </div>
    ))}
    {done.length > 20 && <button className="ghost more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostra meno' : `Mostra tutti (${done.length})`}</button>}

    {admin && <>
      <h2>Registra un risultato</h2>
      <AdminResult d={d} phasesFor={phasesFor} calc={calc} act={act} />
      <p className="mut note">Confermato subito, per chi non lo inserisce da solo.</p>
      <h2>Aggiungi una ranked</h2>
      <AddTournament team={team} tiers={Object.values(d.tiers)} reload={reload} />
    </>}
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
      <button disabled={!t || !ph} onClick={() => send(t.id, ph).then(() => { setOpen(false); setTid(''); setPh('') })}>Invia</button>
      <button className="ghost" onClick={() => setOpen(false)}>Annulla</button>
    </div>
  )
}

function Report({ t, my, st, tierLabel, phases, calc, send }) {
  const [ph, setPh] = useState(my?.phase || '')
  const locked = my && (my.status === 'approved')
  return (
    <div className="row tour">
      <span><b>{t.name}</b>
        <small>{tierLabel} · {fmtDate(t.starts_at)}</small>
        {my && my.status !== 'registered' && <small>Il tuo risultato: {phaseName(my.phase)} · {my.total_pts} pt · {st[my.status]}</small>}
      </span>
      {!locked && <>
        <select value={ph} onChange={e => setPh(e.target.value)}>
          <option value="">Il tuo piazzamento…</option>
          {phases.map(([k, l]) => <option key={k} value={k}>{l} (+{calc(k)})</option>)}
        </select>
        <button disabled={!ph} onClick={() => send(ph)}>{my?.status === 'pending' ? 'Aggiorna' : 'Invia'}</button>
      </>}
    </div>
  )
}

function AdminResult({ d, phasesFor, calc, act }) {
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
      <button disabled={!tid || !b || !ph} onClick={() => act('ranked_admin_register', { p_tournament: tid, p_blader: b, p_phase: ph }).then(() => setPh(''))}>Registra</button>
    </div>
  )
}

function AddTournament({ team, tiers, reload }) {
  const empty = { name: '', tier: '', date: '', time: '14:00', club: '', city: '', url: '' }
  const [f, setF] = useState(empty)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  async function save() {
    const { error } = await sb.from('tournaments').insert({
      name: f.name.trim(), tier: f.tier, starts_at: new Date(`${f.date}T${f.time}`).toISOString(),
      club: f.club.trim() || null, city: f.city.trim() || null, url: f.url.trim() || null, created_by_team: team,
    })
    if (error) return err(error)
    setF(empty); reload()
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
