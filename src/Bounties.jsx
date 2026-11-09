import { useEffect, useRef, useState } from 'react'
import { GROUPS, ini } from './lib'
import { Sheet, toast } from './ui'
import { Icon } from './icons'
import { shareStory } from './share'
import { ago } from './Leaderboard'

const STATUS = { pending: 'in attesa', approved: 'riscossa', rejected: 'rifiutata', revoked: 'revocata' }

export function BountyBoard({ d, me, active, nick, claim }) {
  const [filter, setFilter] = useState('all'), [open, setOpen] = useState(null)
  // la MIA dichiarazione più recente per ogni taglia (per i timbri IN ATTESA / RISCOSSA)
  const mine = {}
  for (const c of d.claims) if (c.hunter_id === me && (c.status === 'pending' || c.status === 'approved') && !mine[c.bounty_id]) mine[c.bounty_id] = c.status
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

  const groups = GROUPS.filter(([k]) => active.some(b => b.category === k))
  const shown = active.filter(b => filter === 'all' || b.category === filter)
  const b = open && d.bountyById[open]

  if (!active.length) return <p className="empty">Nessuna taglia attiva al momento. Le attivano gli admin dal pannello Admin.</p>
  return <>
    {groups.length > 1 && (
      <div className="chips" role="group" aria-label="Filtra le taglie">
        {[['all', 'Tutte'], ...groups].map(([k, l]) => (
          <button key={k} type="button" className={'chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l.replace('Blader rilevanti', 'Rilevanti').replace('Capi team e creator', 'Capi team')}
          </button>
        ))}
      </div>
    )}
    <div className="ricercato-grid">
      {shown.map((x, i) => (
        <button type="button" key={x.id} className="ricercato" style={{ animationDelay: `${i * 35}ms` }} onClick={() => setOpen(x.id)}
          aria-label={`Ricercato ${nick(x.target_id)}, taglia ${x.value} punti${mine[x.id] ? ', ' + STATUS[mine[x.id]] : ''}`}>
          <span className="ricercato-head">RICERCATO</span>
          <span className="ricercato-photo">
            {d.photos[x.target_id] ? <img src={d.photos[x.target_id]} alt="" loading="lazy" /> : <span>{ini(nick(x.target_id))}</span>}
            {mine[x.id] && <span key={drop[x.id] || 0} className={'stamp ' + mine[x.id] + (drop[x.id] ? ' drop' : '')}>{mine[x.id] === 'approved' ? 'RISCOSSA' : 'IN ATTESA'}</span>}
          </span>
          <b className="ricercato-name">{nick(x.target_id)}</b>
          {d.bl[x.target_id]?.pro_rank && <em className="ricercato-rank">#{d.bl[x.target_id].pro_rank} PBI</em>}
          <span className="ricercato-bounty"><small>TAGLIA</small><strong className="num">{x.value}</strong><small>PT</small></span>
        </button>
      ))}
    </div>

    <h2>Ultime riscossioni</h2>
    {!d.claims.length && <p className="empty">Ancora nessuna riscossione in questa stagione. Batti un ricercato e dichiaralo dal suo manifesto.</p>}
    <div className="feed">
      {d.claims.slice(0, 10).map(c => (
        <div className="feed-item" key={c.id}>
          <span><b>{nick(c.hunter_id)}</b> ha battuto <b>{nick(c.target_id)}</b><small>{ago(c.created_at)} · {STATUS[c.status]}</small></span>
          <span className={'feed-pts num' + (c.status === 'approved' ? '' : ' off')}>{c.status === 'approved' ? '+' : ''}{c.value_snapshot}</span>
        </div>
      ))}
    </div>

    {b && <Wanted b={b} d={d} me={me} nick={nick} status={mine[b.id]} claim={claim} onClose={() => setOpen(null)} />}
  </>
}

// scheda del ricercato: foto grande, chi l'ha già battuto e la dichiarazione
function Wanted({ b, d, me, nick, status, claim, onClose }) {
  const name = nick(b.target_id), photo = d.photos[b.target_id], self = b.target_id === me
  const beaten = [...new Set(d.claims.filter(c => c.target_id === b.target_id && c.status === 'approved').map(c => nick(c.hunter_id)))]
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    const ok = await claim(b)
    setBusy(false)
    if (ok) { onClose(); toast(`Vittoria su ${name} inviata · in attesa di un admin`, { kind: 'ok' }) }
  }
  async function share() {
    const r = await shareStory({ photo, name, value: b.value, hunter: nick(me), team: 'Lake Fox' })
    if (r === 'download') toast('Immagine salvata: pubblicala nelle storie')
  }
  return (
    <Sheet onClose={onClose} label={`Ricercato ${name}`}>
      <div className="wanted">
        <div className="wanted-photo">{photo ? <img src={photo} alt={`Foto di ${name}`} /> : <span>{ini(name)}</span>}</div>
        <div className="wanted-info">
          <h2 className="sheet-title">{name}</h2>
          <p className="sheet-text">{GROUPS.find(g => g[0] === b.category)?.[1]}{d.bl[b.target_id]?.pro_rank ? ` · #${d.bl[b.target_id].pro_rank} PBI` : ''}</p>
          <p className="wanted-value"><b className="num">{b.value}</b> PT</p>
          <p className="sheet-text">{beaten.length ? <>Già battuto da <b>{beaten.join(', ')}</b></> : 'Nessuno l\'ha ancora battuto in questa stagione'}</p>
        </div>
      </div>
      {self ? <p className="sheet-note">Questa taglia è su di te: chi ti batte guadagna {b.value} punti.</p>
        : status === 'pending' ? <p className="sheet-note">La tua vittoria è in attesa della conferma di un admin.</p>
        : <p className="sheet-note">La vittoria resta in attesa finché un admin non la conferma: i punti arrivano dopo.</p>}
      <div className="sheet-actions">
        {status === 'approved' && <button type="button" className="ghost" onClick={share}><Icon.share width="18" height="18" /> Condividi</button>}
        {!self && status !== 'pending' && <button type="button" disabled={busy} onClick={go}>{status === 'approved' ? 'L\'ho battuto di nuovo' : 'L\'ho battuto'}</button>}
        {(self || status === 'pending') && <button type="button" className="ghost" onClick={onClose}>Chiudi</button>}
      </div>
    </Sheet>
  )
}
