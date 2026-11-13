import { useEffect, useRef, useState } from 'react'
import { GROUPS, ini, positions, foxValue, weekStart, fmtDate } from './lib'
import { Sheet, toast } from './ui'
import { Icon } from './icons'
import { shareStory } from './share'
import { ago } from './Leaderboard'

const STATUS = { pending: 'in attesa', disputed: 'contestata', approved: 'riscossa', rejected: 'rifiutata', revoked: 'revocata' }
const WEEK = 7 * 864e5

export function BountyBoard({ d, me, active, nick, claim, incoming, respond, isMember }) {
  const [filter, setFilter] = useState('all'), [open, setOpen] = useState(null)
  // la MIA dichiarazione più recente per ogni taglia (per i timbri IN ATTESA / RISCOSSA)
  const mine = {}
  for (const c of d.claims) if (c.hunter_id === me && ['pending', 'disputed', 'approved'].includes(c.status) && !mine[c.bounty_id]) mine[c.bounty_id] = c.status === 'approved' ? 'approved' : 'pending'
  // timbro che cade solo quando cambia (nuova dichiarazione o approvazione), non a ogni apertura
  const prev = useRef(null), [drop, setDrop] = useState({})
  const sig = JSON.stringify(mine)
  useEffect(() => {
    const now = JSON.parse(sig)
    if (prev.current) {
      const changed = Object.keys(now).filter(k => prev.current[k] !== now[k])
      if (changed.length) setDrop(Object.fromEntries(changed.map(k => [k, Date.now()])))
    }
    prev.current = now
  }, [sig])

  const photo = id => d.photos[id] || d.avatars?.[id]   // manifesto dell'admin, altrimenti la foto profilo
  const groups = GROUPS.filter(([k]) => active.some(b => b.category === k))
  const sections = filter === 'all' ? groups : groups.filter(([k]) => k === filter)
  const b = open && d.bountyById[open]
  const tname = id => d.tourById[id]?.name

  // funzione normale (non componente): così i manifesti non vengono ricreati a ogni aggiornamento
  const card = (x, i) => (
    <button key={x.id} type="button" className="ricercato" style={{ animationDelay: `${i * 35}ms` }} onClick={() => setOpen(x.id)}
      aria-label={`Ricercato ${nick(x.target_id)}, taglia ${x.value} punti${mine[x.id] ? ', ' + STATUS[mine[x.id]] : ''}`}>
      <span className="ricercato-head">{x.target_id === me ? 'SEI TU' : 'RICERCATO'}</span>
      <span className="ricercato-photo">
        {photo(x.target_id) ? <img src={photo(x.target_id)} alt="" loading="lazy" /> : <span>{ini(nick(x.target_id))}</span>}
        {mine[x.id] && <span key={drop[x.id] || 0} className={'stamp ' + mine[x.id] + (drop[x.id] ? ' drop' : '')}>{mine[x.id] === 'approved' ? 'RISCOSSA' : 'IN ATTESA'}</span>}
      </span>
      <b className="ricercato-name">{nick(x.target_id)}</b>
      {d.bl[x.target_id]?.pro_rank && <em className="ricercato-rank">#{d.bl[x.target_id].pro_rank} PBI</em>}
      <span className="ricercato-bounty"><small>TAGLIA</small><strong className="num">{x.value}</strong><small>PT</small></span>
    </button>
  )

  return <>
    {incoming.length > 0 && <>
      <h2>Da confermare</h2>
      {incoming.map(c => (
        <div className="confirm-card" key={c.id}>
          <p><b>{nick(c.hunter_id)}</b> dichiara di averti battuto{tname(c.tournament_id) ? <> alla <b>{tname(c.tournament_id)}</b></> : null}.</p>
          <p className="mut">Se confermi: {nick(c.hunter_id)} prende <b>{c.value_snapshot} pt</b>{c.penalty_snapshot > 0 ? <>, tu perdi <b>{c.penalty_snapshot} pt</b></> : null}. Se non è vero, decide un admin.</p>
          <div className="sheet-actions">
            <button type="button" className="ghost" onClick={() => respond(c, false)}>Non è vero</button>
            <button type="button" onClick={() => respond(c, true)}>Confermo</button>
          </div>
        </div>
      ))}
    </>}

    {!active.length && <p className="empty">Nessuna taglia attiva al momento. Le attivano gli admin dal pannello Admin.</p>}
    {groups.length > 1 && (
      <div className="chips" role="group" aria-label="Filtra le taglie">
        {[['all', 'Tutte'], ...groups].map(([k, l]) => (
          <button key={k} type="button" className={'chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
    )}
    {sections.map(([k, l]) => {
      const list = active.filter(x => x.category === k)
      return (
        <section key={k} className="bounty-section">
          {filter === 'all' && groups.length > 1 && <h2>{l} <small>{list.length}</small></h2>}
          <div className="ricercato-grid">{list.map(card)}</div>
        </section>
      )
    })}

    <h2>Ultime riscossioni</h2>
    {!d.claims.length && <p className="empty">Ancora nessuna riscossione in questa stagione. Batti un ricercato in una ranked e dichiaralo dal suo manifesto.</p>}
    <div className="feed">
      {d.claims.slice(0, 10).map(c => (
        <div className="feed-item" key={c.id}>
          <span><b>{nick(c.hunter_id)}</b> ha battuto <b>{nick(c.target_id)}</b><small>{tname(c.tournament_id) ? tname(c.tournament_id) + ' · ' : ''}{ago(c.created_at)} · {STATUS[c.status]}</small></span>
          <span className={'feed-pts num' + (c.status === 'approved' ? '' : ' off')}>{c.status === 'approved' ? '+' : ''}{c.value_snapshot}</span>
        </div>
      ))}
    </div>

    {b && <Wanted b={b} d={d} me={me} nick={nick} status={mine[b.id]} photo={photo(b.target_id)} claim={claim} member={isMember(b.target_id)} onClose={() => setOpen(null)} />}
  </>
}

// scheda del ricercato: foto grande, chi l'ha già battuto e la dichiarazione (scegliendo la ranked)
function Wanted({ b, d, me, nick, status, photo, claim, member, onClose }) {
  const name = nick(b.target_id), self = b.target_id === me
  const beaten = [...new Set(d.claims.filter(c => c.target_id === b.target_id && c.status === 'approved').map(c => nick(c.hunter_id)))]
  // settimane bloccate: quella di ogni mia riscossione su questo giocatore e le due vicine
  const blocked = new Set()
  for (const c of d.claims) if (c.hunter_id === me && c.target_id === b.target_id && ['pending', 'disputed', 'approved'].includes(c.status)) {
    const w = weekStart(d.tourById[c.tournament_id]?.starts_at || c.played_on)
    ;[w - WEEK, w, w + WEEK].forEach(x => blocked.add(x))
  }
  const now = Date.now()
  const recent = d.tours.filter(t => new Date(t.starts_at) <= now + 864e5 && now - new Date(t.starts_at) < 30 * 864e5).slice().reverse()
    .map(t => ({ ...t, free: !blocked.has(weekStart(t.starts_at)), went: d.entries.some(e => e.tournament_id === t.id && e.blader_id === me) }))
  const best = recent.find(t => t.free && t.went) || recent.find(t => t.free)
  const [tid, setTid] = useState(best?.id || ''), [busy, setBusy] = useState(false)
  const chosen = recent.find(t => t.id === tid)
  // penalità per chi perde (se è un Fox Blader): metà del valore della sua posizione
  const pos = positions(d.board)[d.board.findIndex(r => r.blader_id === b.target_id)]
  const penalty = member && pos ? foxValue(pos) / 2 : 0

  async function go() {
    setBusy(true)
    const ok = await claim(b, tid)
    setBusy(false)
    if (ok) { onClose(); toast(`Vittoria su ${name} inviata · ${member ? `deve confermare ${name}` : 'in attesa di un admin'}`, { kind: 'ok' }) }
  }
  async function share() {
    const r = await shareStory({ photo, name, value: b.value, hunter: nick(me), team: 'Lake Fox' })
    if (r === 'download') toast('Immagine salvata: pubblicala nelle storie')
  }
  const canClaim = !self && status !== 'pending'
  return (
    <Sheet onClose={onClose} label={`Ricercato ${name}`}>
      <div className="wanted">
        <div className="wanted-photo">{photo ? <img src={photo} alt={`Foto di ${name}`} /> : <span>{ini(name)}</span>}</div>
        <div className="wanted-info">
          <h2 className="sheet-title">{name}</h2>
          <p className="sheet-text">{GROUPS.find(g => g[0] === b.category)?.[1]}{d.bl[b.target_id]?.pro_rank ? ` · #${d.bl[b.target_id].pro_rank} PBI` : ''}</p>
          <p className="wanted-value"><b className="num">{b.value}</b> PT</p>
          {penalty > 0 && <p className="sheet-text">Se perde: <b>−{penalty} pt</b></p>}
          <p className="sheet-text">{beaten.length ? <>Già battuto da <b>{beaten.join(', ')}</b></> : 'Nessuno l\'ha ancora battuto in questa stagione'}</p>
        </div>
      </div>
      {self ? <p className="sheet-note">Questa taglia è su di te: chi ti batte in una ranked prende {b.value} punti{penalty ? ` e tu ne perdi ${penalty}` : ''}.</p>
        : status === 'pending' ? <p className="sheet-note">La tua vittoria è in attesa di conferma {member ? `di ${name}` : 'di un admin'}.</p>
        : <>
          <label className="field">
            <span>In quale ranked?</span>
            <select value={tid} onChange={e => setTid(e.target.value)}>
              {!recent.length && <option value="">Nessuna ranked negli ultimi 30 giorni</option>}
              {recent.map(t => <option key={t.id} value={t.id} disabled={!t.free}>{t.name} · {fmtDate(t.starts_at)}{t.free ? '' : ' (settimana di pausa)'}</option>)}
            </select>
          </label>
          <p className="sheet-note">Vale solo una vittoria in ranked. Su ogni giocatore si salta una settimana dopo una riscossione.
            {member ? ` Conferma ${name}; se non è d'accordo decide un admin.` : ' Conferma un admin.'}</p>
        </>}
      <div className="sheet-actions">
        {status === 'approved' && <button type="button" className="ghost" onClick={share}><Icon.share width="18" height="18" /> Condividi</button>}
        {canClaim && <button type="button" disabled={busy || !chosen?.free} onClick={go}>{status === 'approved' ? 'L\'ho battuto di nuovo' : 'L\'ho battuto'}</button>}
        {!canClaim && <button type="button" className="ghost" onClick={onClose}>Chiudi</button>}
      </div>
    </Sheet>
  )
}
