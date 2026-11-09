import { useState } from 'react'
import { sb, GROUPS, SYNC_URL, err, todayLocal, phaseName } from './lib'
import { ask, toast } from './ui'
import { Icon } from './icons'
import { makeCalc, AdminResult, AddTournament } from './Ranked'

export function AdminPanel({ d, team, nick, act, part, onPart, active, free, revoke, saveBounty, uploadPhoto, removePhoto, back, reload }) {
  const [showAllClaims, setShowAllClaims] = useState(false)
  const okClaims = d.claims.filter(c => c.status === 'approved')
  const gi = c => GROUPS.findIndex(g => g[0] === c)
  const byRank = (a, b) => (d.bl[a.target_id]?.pro_rank ?? 999) - (d.bl[b.target_id]?.pro_rank ?? 999)
  const lastSync = Object.values(d.bl).map(b => b.pro_synced_at).filter(Boolean).sort().pop()
  const pendClaims = d.claims.filter(c => c.status === 'pending'), pendRanked = d.entries.filter(e => e.status === 'pending')
  const tname = id => d.tourById[id]?.name || '?'
  const { phasesFor, calc } = makeCalc(d, part)
  const decide = async (fn, args, ok) => { if (await act(fn, args)) toast(ok, { kind: 'ok' }) }
  const todo = pendClaims.length + pendRanked.length + d.reqs.length
  return <>
    <button type="button" className="back" onClick={back}><Icon.back width="18" height="18" /> Profilo</button>

    <h2>Da approvare{todo ? ` (${todo})` : ''}</h2>
    {!todo && <p className="empty">Tutto in ordine: nessuna richiesta in attesa.</p>}
    {pendClaims.map(c => (
      <div className="row" key={c.id}>
        <span><b>{nick(c.hunter_id)}</b> ha battuto <b>{nick(c.target_id)}</b><small>Taglia · {c.played_on} · {c.value_snapshot} pt</small></span>
        <button onClick={() => decide('decide_claim', { p_claim: c.id, p_approve: true }, 'Vittoria approvata')}>Approva</button>
        <button className="ghost" onClick={() => decide('decide_claim', { p_claim: c.id, p_approve: false }, 'Vittoria rifiutata')}>Rifiuta</button>
      </div>
    ))}
    {pendRanked.map(e => (
      <div className="row" key={e.id}>
        <span><b>{nick(e.blader_id)}</b> · {tname(e.tournament_id)}<small>Ranked · {phaseName(e.phase)} · {e.total_pts} pt ({e.participation_pts} + {e.qualified_pts} + {e.placement_pts})</small></span>
        <button onClick={() => decide('ranked_decide', { p_entry: e.id, p_approve: true, p_phase: e.phase }, 'Risultato confermato')}>Conferma</button>
        <button className="ghost" onClick={() => decide('ranked_decide', { p_entry: e.id, p_approve: false, p_phase: e.phase }, 'Risultato rifiutato')}>Rifiuta</button>
      </div>
    ))}
    {d.reqs.map(r => <ReqRow key={r.id} r={r} free={free} act={act} />)}

    <h2>Registra una vittoria</h2>
    <RegisterWin board={d.board} active={active} nick={nick} act={act} />
    <p className="mut note">Viene approvata subito, senza passare dalla dichiarazione del giocatore.</p>

    <h2>Registra un risultato ranked</h2>
    <AdminResult d={d} phasesFor={phasesFor} calc={calc} act={act} />
    <p className="mut note">Confermato subito, per chi non lo inserisce da solo.</p>

    <h2>Aggiungi una ranked</h2>
    <AddTournament team={team} tiers={Object.values(d.tiers)} reload={reload} />
    <p className="mut note">Le ranked del calendario PBI arrivano da sole: aggiungi qui solo quelle che mancano.</p>

    <h2>Riscossioni approvate</h2>
    {!okClaims.length && <p className="empty">Nessuna riscossione approvata.</p>}
    {(showAllClaims ? okClaims : okClaims.slice(0, 20)).map(c => (
      <div className="row" key={c.id}>
        <span>{nick(c.hunter_id)} → {nick(c.target_id)}<small>{c.played_on} · {c.value_snapshot} pt{c.note ? ` · ${c.note}` : ''}</small></span>
        <button className="ghost" onClick={() => revoke(c)}>Revoca</button>
      </div>
    ))}
    {okClaims.length > 20 && <button className="ghost more" onClick={() => setShowAllClaims(!showAllClaims)}>{showAllClaims ? 'Mostra meno' : `Mostra tutte (${okClaims.length})`}</button>}

    <h2>Correzione punti</h2>
    <Adjust board={d.board} act={act} />
    <p className="mut note">Punti negativi per togliere, positivi per aggiungere. Restano registrati come correzione manuale.</p>
    {d.led.filter(l => l.source === 'manual').map(l => (
      <div className="row" key={l.id}>
        <span>{nick(l.blader_id)}<small>{l.created_at.slice(0, 10)}{l.note ? ` · ${l.note}` : ''}</small></span>
        <span className="pts">{l.points > 0 ? '+' : ''}{l.points}</span>
        <button className="ghost" onClick={async () => { if (await ask({ title: 'Annullare questa correzione?', text: `${nick(l.blader_id)}: ${l.points > 0 ? '+' : ''}${l.points} punti`, ok: 'Annulla correzione', cancel: 'Indietro', danger: true })) decide('delete_adjustment', { p_id: l.id }, 'Correzione annullata') }}>Annulla</button>
      </div>
    ))}

    <h2>Taglie (valori e attivazione)</h2>
    <p className="mut note">Top 10: il valore è legato alla <b>posizione</b>. Se cambi quello del 2°, cambi il valore del 2° posto: quando la classifica PBI cambia, ogni mattina le taglie slittano da sole (chi entra in top 10 si attiva, chi esce si disattiva).</p>
    {[...d.bounties].sort((a, b) => gi(a.category) - gi(b.category) || byRank(a, b)).map(b =>
      <BountyRow key={b.id + b.value + b.active} b={b}
        name={`#${d.bl[b.target_id]?.pro_rank ?? '–'} ${nick(b.target_id)}`}
        note={`${GROUPS.find(g => g[0] === b.category)?.[1]}${b.category === 'top10' && (d.bl[b.target_id]?.pro_rank ?? 999) > 10 ? ' · ⚠ fuori top 10' : ''}`}
        photo={d.photos[b.target_id]} onPhoto={f => uploadPhoto(b, f)} onRemovePhoto={() => removePhoto(b)}
        onSave={saveBounty} />)}

    <h2>Punti partecipazione ranked</h2>
    <Participation team={team} value={part} onSaved={onPart} />

    <h2>Classifica PBI</h2>
    <div className="row">
      <span>Ultimo aggiornamento<small>{lastSync ? new Date(lastSync).toLocaleString('it-IT') : 'mai'} · automatico ogni mattina. Per farlo subito: apri la pagina, premi "Run workflow" e poi riapri l'app dopo un minuto.</small></span>
      <a className="btn" href={SYNC_URL} target="_blank" rel="noreferrer">Aggiorna ora</a>
    </div>
  </>
}

function RegisterWin({ board, active, nick, act }) {
  const [h, setH] = useState(''), [b, setB] = useState(''), [day, setDay] = useState(todayLocal())
  return (
    <div className="row">
      <select value={h} onChange={e => setH(e.target.value)}>
        <option value="">Chi ha vinto…</option>
        {board.map(r => <option key={r.blader_id} value={r.blader_id}>{r.nickname}</option>)}
      </select>
      <select value={b} onChange={e => setB(e.target.value)}>
        <option value="">Taglia battuta…</option>
        {active.map(x => <option key={x.id} value={x.id}>{nick(x.target_id)} ({x.value} pt)</option>)}
      </select>
      <input type="date" value={day} max={todayLocal()} onChange={e => setDay(e.target.value)} />
      <button disabled={!h || !b} onClick={() => act('admin_register_claim', { p_bounty: b, p_hunter: h, p_played_on: day }).then(ok => { if (ok) { setB(''); toast('Vittoria registrata', { kind: 'ok' }) } })}>Registra</button>
    </div>
  )
}

function ReqRow({ r, free, act }) {
  const [b, setB] = useState('')
  return (
    <div className="row">
      <span><b>{r.nickname}</b> vuole entrare<small>{r.email}</small></span>
      <select value={b} onChange={e => setB(e.target.value)}>
        <option value="">Nuovo blader</option>
        {free.map(f => <option key={f.blader_id} value={f.blader_id}>Collega a {f.nickname}</option>)}
      </select>
      <button onClick={() => act('approve_join', { p_request: r.id, p_blader: b || null }).then(ok => ok && toast(`${r.nickname} è entrato nel team`, { kind: 'ok' }))}>Approva</button>
      <button className="ghost" onClick={() => act('reject_join', { p_request: r.id })}>Rifiuta</button>
    </div>
  )
}

function BountyRow({ b, name, note, onSave, photo, onPhoto, onRemovePhoto }) {
  const [v, setV] = useState(b.value), [a, setA] = useState(b.active)
  return (
    <div className="row">
      <label className="thumb" title={photo ? 'Cambia foto' : 'Aggiungi foto'}>
        {photo ? <img src={photo} alt="" /> : <span>📷</span>}
        <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }} />
      </label>
      <span>{name}<small>{note}{photo && <> · <button type="button" className="link mini" onClick={onRemovePhoto}>togli foto</button></>}</small></span>
      <input type="number" min="0" value={v} onChange={e => setV(+e.target.value)} />
      <label className="chk"><input type="checkbox" checked={a} onChange={e => setA(e.target.checked)} /> attiva</label>
      <button onClick={() => onSave(b.id, v, a)}>Salva</button>
    </div>
  )
}

function Adjust({ board, act }) {
  const [b, setB] = useState(''), [p, setP] = useState(''), [n, setN] = useState('')
  function go() {
    act('adjust_points', { p_blader: b, p_points: +p, p_note: n }).then(ok => { if (ok) { setP(''); setN(''); toast('Correzione applicata', { kind: 'ok' }) } })
  }
  return (
    <div className="row">
      <select value={b} onChange={e => setB(e.target.value)}>
        <option value="">Blader…</option>
        {board.map(r => <option key={r.blader_id} value={r.blader_id}>{r.nickname}</option>)}
      </select>
      <input type="number" placeholder="± punti" value={p} onChange={e => setP(e.target.value)} />
      <input placeholder="Motivo (facoltativo)" value={n} onChange={e => setN(e.target.value)} />
      <button disabled={!b || !p || +p === 0} onClick={go}>Applica</button>
    </div>
  )
}

function Participation({ team, value, onSaved }) {
  const [v, setV] = useState(value)
  async function save() {
    const { error } = await sb.from('teams').update({ participation_points: v }).eq('id', team)
    if (error) return err(error)
    onSaved(v)
    toast('Salvato: vale per i risultati inseriti da adesso in poi', { kind: 'ok' })
  }
  return (
    <div className="row">
      <span>Punti a ogni membro che gioca una ranked<small>Si sommano a quelli del piazzamento</small></span>
      <input type="number" min="0" value={v} onChange={e => setV(+e.target.value)} />
      <button onClick={save}>Salva</button>
    </div>
  )
}
