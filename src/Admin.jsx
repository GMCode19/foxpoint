import { useState } from 'react'
import { sb, GROUPS, SYNC_URL, err, todayLocal } from './lib'

export function AdminPanel({ d, team, nick, act, part, onPart, active, free, revoke, saveBounty, uploadPhoto, removePhoto }) {
  const [showAllClaims, setShowAllClaims] = useState(false)
  const okClaims = d.claims.filter(c => c.status === 'approved')
  const gi = c => GROUPS.findIndex(g => g[0] === c)
  const byRank = (a, b) => (d.bl[a.target_id]?.pro_rank ?? 999) - (d.bl[b.target_id]?.pro_rank ?? 999)
  const lastSync = Object.values(d.bl).map(b => b.pro_synced_at).filter(Boolean).sort().pop()
  return <>
    <h2>Classifica PBI</h2>
    <div className="row">
      <span>Ultimo aggiornamento<small>{lastSync ? new Date(lastSync).toLocaleString('it-IT') : 'mai'} · automatico ogni mattina. Per farlo subito: apri la pagina, premi "Run workflow" e poi ricarica l'app dopo un minuto.</small></span>
      <a className="btn" href={SYNC_URL} target="_blank" rel="noreferrer">Aggiorna ora</a>
    </div>

    <h2>Punti partecipazione ranked</h2>
    <Participation team={team} value={part} onSaved={onPart} />

    <h2>Registra una vittoria</h2>
    <RegisterWin board={d.board} active={active} nick={nick} act={act} />
    <p className="mut note">Viene approvata subito, senza passare dalla dichiarazione del giocatore.</p>

    <h2>Richieste di ingresso</h2>
    {!d.reqs.length && <p className="mut">Nessuna richiesta.</p>}
    {d.reqs.map(r => <ReqRow key={r.id} r={r} free={free} act={act} />)}

    <h2>Riscossioni da approvare</h2>
    {!d.claims.some(c => c.status === 'pending') && <p className="mut">Nessuna riscossione in attesa.</p>}
    {d.claims.filter(c => c.status === 'pending').map(c => (
      <div className="row" key={c.id}>
        <span>{nick(c.hunter_id)} → {nick(c.target_id)}<small>{c.played_on} · {c.value_snapshot} pt</small></span>
        <button onClick={() => act('decide_claim', { p_claim: c.id, p_approve: true })}>Approva</button>
        <button className="ghost" onClick={() => act('decide_claim', { p_claim: c.id, p_approve: false })}>Rifiuta</button>
      </div>
    ))}

    <h2>Riscossioni approvate</h2>
    {!okClaims.length && <p className="mut">Nessuna riscossione approvata.</p>}
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
        <button className="ghost" onClick={() => confirm('Annullare questa correzione?') && act('delete_adjustment', { p_id: l.id })}>Annulla</button>
      </div>
    ))}

    <h2>Taglie (valori e attivazione)</h2>
    {[...d.bounties].sort((a, b) => gi(a.category) - gi(b.category) || byRank(a, b)).map(b =>
      <BountyRow key={b.id + b.value + b.active} b={b}
        name={`#${d.bl[b.target_id]?.pro_rank ?? '–'} ${nick(b.target_id)}`}
        note={`${GROUPS.find(g => g[0] === b.category)?.[1]}${b.category === 'top10' && (d.bl[b.target_id]?.pro_rank ?? 999) > 10 ? ' · ⚠ fuori top 10' : ''}`}
        photo={d.photos[b.target_id]} onPhoto={f => uploadPhoto(b, f)} onRemovePhoto={() => removePhoto(b)}
        onSave={saveBounty} />)}
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
      <button disabled={!h || !b} onClick={() => act('admin_register_claim', { p_bounty: b, p_hunter: h, p_played_on: day }).then(() => setB(''))}>Registra</button>
    </div>
  )
}

function ReqRow({ r, free, act }) {
  const [b, setB] = useState('')
  return (
    <div className="row">
      <span>{r.nickname}<small>{r.email}</small></span>
      <select value={b} onChange={e => setB(e.target.value)}>
        <option value="">Nuovo blader</option>
        {free.map(f => <option key={f.blader_id} value={f.blader_id}>Collega a {f.nickname}</option>)}
      </select>
      <button onClick={() => act('approve_join', { p_request: r.id, p_blader: b || null })}>Approva</button>
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
    act('adjust_points', { p_blader: b, p_points: +p, p_note: n }).then(() => { setP(''); setN('') })
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
    alert('Salvato. Vale per i risultati inseriti da adesso in poi.')
  }
  return (
    <div className="row">
      <span>Punti a ogni membro che gioca una ranked<small>Si sommano a quelli del piazzamento</small></span>
      <input type="number" min="0" value={v} onChange={e => setV(+e.target.value)} />
      <button onClick={save}>Salva</button>
    </div>
  )
}
