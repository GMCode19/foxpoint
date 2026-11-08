import { BADGES, ini, phaseName, positions } from './lib'

export function Profile({ id, d, nick }) {
  const b = d.bl[id], row = d.board.find(r => r.blader_id === id)
  if (!b || !row) return <p className="mut">Profilo non disponibile.</p>
  const tour = tid => d.tourById[tid]
  const pos = positions(d.board)[d.board.findIndex(r => r.blader_id === id)]
  const won = d.claims.filter(c => c.hunter_id === id && c.status === 'approved')
  const pend = d.claims.filter(c => c.hunter_id === id && c.status === 'pending').length
  const lost = d.claims.filter(c => c.target_id === id && c.status === 'approved').length
  const cat = c => d.bountyById[c.bounty_id]?.category
  let tot = 0
  const pts = d.led.filter(l => l.blader_id === id)
    .map(l => ({ t: (l.source === 'bounty' && d.claimById[l.ref_id]?.played_on)
      || (l.source === 'ranked' && tour(d.entryById[l.ref_id]?.tournament_id)?.starts_at?.slice(0, 10))
      || l.created_at.slice(0, 10), p: l.points }))
    .sort((a, z) => a.t.localeCompare(z.t))
    .map(x => ({ t: x.t, v: (tot += x.p) }))
  const rk = d.entries.filter(e => e.blader_id === id && e.status === 'approved')
    .sort((a, z) => (tour(z.tournament_id)?.starts_at || '').localeCompare(tour(a.tournament_id)?.starts_at || ''))
  const earned = BADGES.filter(x => x.ok(won, cat, rk))
  return (
    <>
      <div className="hero">
        <span className="av big">{ini(b.nickname)}</span>
        <div>
          <h1 style={{ margin: 0 }}>{b.nickname}</h1>
          <small className="mut">#{pos} Fox Point{b.pro_rank ? ` · #${b.pro_rank} PBI (${b.pro_points ?? '–'} pt)` : ''}</small>
        </div>
      </div>
      <div className="stats">
        <div><b>{row.fox_points}</b><small>Fox Point</small></div>
        <div><b>{won.length}</b><small>Taglie riscosse</small></div>
        <div><b>{row.bounty_points}</b><small>Punti taglie</small></div>
        <div><b>{lost}</b><small>Taglie subite</small></div>
        <div><b>{row.ranked_points}</b><small>Punti ranked</small></div>
        <div><b>{rk.length}</b><small>Ranked giocate</small></div>
      </div>
      <h2>Andamento punti</h2>
      <LineChart pts={pts} />
      <h2>Traguardi</h2>
      <div className="badges">
        {BADGES.map(x => <span key={x.k} className={'badge' + (earned.includes(x) ? ' on' : '')} title={x.d}>{x.i} {x.n}</span>)}
      </div>
      <h2>Ranked giocate</h2>
      {!rk.length && <p className="mut">Nessuna ranked registrata finora.</p>}
      {rk.map(e => (
        <div className="row" key={e.id}>
          <span><b>{tour(e.tournament_id)?.name}</b><small>{tour(e.tournament_id)?.starts_at.slice(0, 10)} · {phaseName(e.phase)}</small></span>
          <span className="pts">+{e.total_pts}</span>
        </div>
      ))}
      <h2>Storico vittorie{pend ? ` (${pend} in attesa)` : ''}</h2>
      {!won.length && <p className="mut">Nessuna taglia riscossa finora.</p>}
      {won.map(c => (
        <div className="row" key={c.id}>
          <span>Ha battuto <b>{nick(c.target_id)}</b><small>{c.played_on}</small></span>
          <span className="pts">+{c.value_snapshot}</span>
        </div>
      ))}
    </>
  )
}

function LineChart({ pts }) {
  if (pts.length < 2) return <p className="mut">Servono almeno due movimenti di punti per mostrare il grafico.</p>
  const W = 320, H = 120, P = 10, max = Math.max(...pts.map(p => p.v)) || 1
  const xy = pts.map((p, i) => [P + (i / (pts.length - 1)) * (W - 2 * P), H - P - (p.v / max) * (H - 2 * P)])
  const line = xy.map(p => p.join(',')).join(' ')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polygon points={`${P},${H - P} ${line} ${W - P},${H - P}`} className="area" />
      <polyline points={line} className="line" />
      {pts.length <= 40 && xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" className="dot"><title>{pts[i].t}: {pts[i].v} pt</title></circle>)}
    </svg>
  )
}
