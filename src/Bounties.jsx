import { useEffect, useState } from 'react'
import { GROUPS, ini } from './lib'

export function BountyBoard({ d, me, active, nick, claim }) {
  const [zoom, setZoom] = useState(null)
  const label = { pending: '⏳ in attesa', approved: '✅ approvata', rejected: '❌ rifiutata', revoked: '↩️ revocata' }
  useEffect(() => {
    if (!zoom) return
    const close = e => e.key === 'Escape' && setZoom(null)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [zoom])
  return <>
    {!active.length && <p className="mut">Nessuna taglia attiva al momento.</p>}
    {GROUPS.map(([k, t]) => active.some(b => b.category === k) && (
      <div key={k}>
        <h2>{t}</h2>
        <div className="ricercato-grid">
          {active.filter(b => b.category === k).map((b, i) => (
            <Ricercato key={b.id} i={i} name={nick(b.target_id)} rank={d.bl[b.target_id]?.pro_rank} value={b.value}
              photo={d.photos[b.target_id]} self={b.target_id === me} onZoom={setZoom} onClaim={() => claim(b)} />
          ))}
        </div>
      </div>
    ))}
    {zoom && <div className="zoom" onClick={() => setZoom(null)}><img src={zoom.url} alt={zoom.name} /><b>{zoom.name}</b></div>}
    <h2>Ultime riscossioni</h2>
    {!d.claims.length && <p className="mut">Ancora nessuna riscossione.</p>}
    {d.claims.slice(0, 20).map(c => (
      <div className="row" key={c.id}>
        <span>{nick(c.hunter_id)} → {nick(c.target_id)}<small>{c.played_on} · {c.value_snapshot} pt</small></span>
        <span className="tag">{label[c.status]}</span>
      </div>
    ))}
  </>
}

function Ricercato({ i, name, rank, value, photo, self, onZoom, onClaim }) {
  return (
    <div className="ricercato" style={{ animationDelay: `${i * 40}ms` }}>
      <div className="ricercato-head">RICERCATO</div>
      <button type="button" className="ricercato-photo" onClick={() => photo && onZoom({ url: photo, name })} aria-label={photo ? `Foto di ${name}` : name}>
        {photo ? <img src={photo} alt="" loading="lazy" /> : <span>{ini(name)}</span>}
      </button>
      <b className="ricercato-name">{name}</b>
      {rank && <em className="ricercato-rank">#{rank} PBI</em>}
      <div className="ricercato-bounty"><small>TAGLIA</small><strong>{value}</strong><small>PT</small></div>
      {self ? <button disabled>Sei tu!</button> : <button onClick={onClaim}>Ho vinto</button>}
    </div>
  )
}
