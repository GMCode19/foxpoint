import { useState } from 'react'
import { sb, BADGES, phaseName, positions } from './lib'
import { Sheet, ask } from './ui'
import { Icon } from './icons'
import { Avatar } from './Avatar'
import { Notifications, unsubscribeDevice } from './push'

// avanzamento verso ogni traguardo: [fatto, obiettivo]
const PROGRESS = {
  a: w => [Math.min(w.length, 1), 1], b: w => [Math.min(w.length, 5), 5],
  c: (w, c) => [w.some(x => c(x) === 'top10') ? 1 : 0, 1], d: (w, c) => [w.some(x => c(x) === 'capo') ? 1 : 0, 1],
  e: (w, c, r) => [Math.min(r.length, 1), 1], f: (w, c, r) => [r.some(x => ['winner', 'final', 'sf'].includes(x.phase)) ? 1 : 0, 1],
  g: (w, c, r) => [r.some(x => x.phase === 'winner') ? 1 : 0, 1],
}

export function Profile({ id, me, d, nick, admin, todo, goTab, back, part, onAvatar, removeAvatar }) {
  const [help, setHelp] = useState(false)
  const self = id === me
  const b = d.bl[id], row = d.board.find(r => r.blader_id === id)
  if (!b || !row) return <p className="empty">Profilo non disponibile.</p>
  const tour = tid => d.tourById[tid]
  const pos = positions(d.board)[d.board.findIndex(r => r.blader_id === id)]
  const won = d.claims.filter(c => c.hunter_id === id && c.status === 'approved')
  const pend = d.claims.filter(c => c.hunter_id === id && c.status === 'pending').length
  const lostList = d.claims.filter(c => c.target_id === id && c.status === 'approved'), lost = lostList.length
  const penOf = c => d.led.find(l => l.source === 'penalty' && l.ref_id === c.id)?.points || 0
  const cat = c => d.bountyById[c.bounty_id]?.category
  const manual = d.led.filter(l => l.blader_id === id && !['bounty', 'ranked', 'penalty'].includes(l.source)).reduce((s, l) => s + l.points, 0)
  let tot = 0
  const pts = d.led.filter(l => l.blader_id === id)
    .map(l => ({ t: ((l.source === 'bounty' || l.source === 'penalty') && d.claimById[l.ref_id]?.played_on)
      || (l.source === 'ranked' && tour(d.entryById[l.ref_id]?.tournament_id)?.starts_at?.slice(0, 10))
      || l.created_at.slice(0, 10), p: l.points }))
    .sort((a, z) => a.t.localeCompare(z.t))
    .map(x => ({ t: x.t, v: (tot += x.p) }))
  const rk = d.entries.filter(e => e.blader_id === id && e.status === 'approved')
    .sort((a, z) => (tour(z.tournament_id)?.starts_at || '').localeCompare(tour(a.tournament_id)?.starts_at || ''))
  const parts = [['Taglie', row.bounty_points, 'b'], ['Ranked', row.ranked_points, 'r'], ['Correzioni', manual, 'm']].filter(p => p[1] > 0)
  const lostPts = row.penalty_points || 0
  const sum = parts.reduce((s, p) => s + p[1], 0) || 1

  async function logout() { if (await ask({ title: 'Vuoi uscire?', text: 'Per rientrare ti serviranno email e password. Su questo telefono smetteranno di arrivare le notifiche.', ok: 'Esci' })) { await unsubscribeDevice(); sb.auth.signOut() } }

  return <>
    {!self && <button type="button" className="back" onClick={back}><Icon.back width="18" height="18" /> Classifica</button>}
    <div className="player">
      {self
        ? <label className="avatar-edit" title="Cambia foto profilo">
            <Avatar className="av xl" url={d.avatars?.[id]} name={b.nickname} />
            <span className="avatar-badge" aria-hidden="true"><Icon.camera width="15" height="15" /></span>
            <input type="file" accept="image/*" className="sr-only" aria-label="Cambia foto profilo" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAvatar(f) }} />
          </label>
        : <Avatar className="av xl" url={d.avatars?.[id]} name={b.nickname} />}
      <div className="player-id">
        <h2 className="player-name">{b.nickname}</h2>
        <small>{pos}° Fox Point{b.pro_rank ? ` · #${b.pro_rank} PBI` : ''}</small>
      </div>
      <div className="player-pts"><b className="num">{row.fox_points}</b><small>Fox Point</small></div>
      {parts.length > 0 && <>
        <div className="split" aria-hidden="true">{parts.map(p => <span key={p[2]} className={'split-' + p[2]} style={{ flexGrow: p[1] / sum }} />)}</div>
        <div className="split-legend">{parts.map(p => <span key={p[2]}><i className={'split-' + p[2]} />{p[0]} <b>{p[1]}</b></span>)}
          {lostPts < 0 && <span className="lost">Taglie subite <b>{lostPts}</b></span>}</div>
      </>}
    </div>

    <div className="stats">
      <div><b className="num">{won.length}</b><small>Taglie riscosse{pend ? ` (+${pend} in attesa)` : ''}</small></div>
      <div><b className="num">{rk.length}</b><small>Ranked giocate</small></div>
      <div><b className="num">{lost}</b><small>Taglie subite</small></div>
    </div>

    <h2>Andamento punti</h2>
    <LineChart pts={pts} self={self} />

    <h2>Traguardi</h2>
    <div className="goals">
      {BADGES.map(x => {
        const [cur, max] = PROGRESS[x.k](won, cat, rk), done = cur >= max
        return (
          <div key={x.k} className={'goal' + (done ? ' on' : '')}>
            <span className="goal-ic" aria-hidden="true">{x.i}</span>
            <span className="goal-txt"><b>{x.n}</b><small>{x.d}</small>
              {max > 1 && !done && <span className="bar" role="progressbar" aria-valuenow={cur} aria-valuemax={max}><i style={{ width: `${cur / max * 100}%` }} /></span>}</span>
            <span className="goal-state">{done ? <Icon.check width="18" height="18" /> : max > 1 ? `${cur}/${max}` : ''}</span>
          </div>
        )
      })}
    </div>

    <h2>Ranked giocate</h2>
    {!rk.length && <div className="empty">{self ? <>Nessuna ranked ancora. <button type="button" className="link" onClick={() => goTab('ranked')}>Guarda le prossime</button></> : 'Nessuna ranked registrata finora.'}</div>}
    {rk.map(e => (
      <div className="row" key={e.id}>
        <span><b>{tour(e.tournament_id)?.name}</b><small>{tour(e.tournament_id)?.starts_at.slice(0, 10)} · {phaseName(e.phase)}</small></span>
        <span className="pts num">+{e.total_pts}</span>
      </div>
    ))}
    {lostList.length > 0 && <>
      <h2>Taglie subite</h2>
      {lostList.map(c => (
        <div className="row" key={c.id}>
          <span>Battuto da <b>{nick(c.hunter_id)}</b><small>{d.tourById[c.tournament_id]?.name || c.played_on}</small></span>
          <span className="pts num minus">{penOf(c) || '–'}</span>
        </div>
      ))}
    </>}
    <h2>Taglie riscosse</h2>
    {!won.length && <div className="empty">{self ? <>Nessuna taglia riscossa. <button type="button" className="link" onClick={() => goTab('bounty')}>Vedi i ricercati</button></> : 'Nessuna taglia riscossa finora.'}</div>}
    {won.map(c => (
      <div className="row" key={c.id}>
        <span>Ha battuto <b>{nick(c.target_id)}</b><small>{c.played_on}</small></span>
        <span className="pts num">+{c.value_snapshot}</span>
      </div>
    ))}

    {self && <>
      <h2>Impostazioni</h2>
      <div className="menu">
        {admin && <button type="button" onClick={() => goTab('admin')}><Icon.shield /><span>Pannello admin</span>{todo > 0 && <em className="dot">{todo}</em>}<Icon.chevron /></button>}
        {d.avatars?.[me] && <button type="button" onClick={removeAvatar}><Icon.user /><span>Togli la foto profilo</span></button>}
        <Notifications me={me} admin={admin} />
        <button type="button" onClick={() => setHelp(true)}><Icon.help /><span>Come funzionano i punti</span><Icon.chevron /></button>
        <button type="button" onClick={logout}><Icon.logout /><span>Esci</span></button>
      </div>
    </>}
    {help && <Help part={part} onClose={() => setHelp(false)} />}
  </>
}

function Help({ part, onClose }) {
  return (
    <Sheet onClose={onClose} label="Come funzionano i punti">
      <h2 className="sheet-title">Come funzionano i punti</h2>
      <div className="help">
        <p><b>Fox Point</b> = punti delle taglie + punti delle ranked. La classifica del team è la somma.</p>
        <p><b>Taglie.</b> Ogni ricercato ha un valore. Valgono solo le vittorie <b>in una ranked</b>: dichiarale dal manifesto scegliendo la ranked. Su ogni giocatore, dopo una riscossione, si salta una settimana. Le taglie della Top 10 PBI valgono in base alla posizione e si aggiornano da sole ogni mattina.</p>
        <p><b>Fox Blader.</b> Anche tra di noi c'è una taglia: vale in base alla posizione Fox Point di chi viene battuto (1° 60, 2° 50, 3° 40, 4°-5° 30, poi 20) e chi perde perde metà del valore, mai sotto zero. La vittoria la conferma chi è stato battuto; se dice che non è vero, decide un admin.</p>
        <p><b>Ranked.</b> Ogni ranked PBI giocata vale <b>+{part}</b> di partecipazione, più i punti ufficiali PBI del piazzamento (bonus qualified compreso). Premi "Partecipo" prima, poi a fine torneo inserisci il piazzamento in "Com'è andata?".</p>
        <p><b>Frecce ▲▼.</b> Quante posizioni hai guadagnato o perso negli ultimi 7 giorni.</p>
      </div>
      <div className="sheet-actions"><button type="button" onClick={onClose}>Ho capito</button></div>
    </Sheet>
  )
}

function LineChart({ pts, self }) {
  if (pts.length < 2) return <p className="empty">{self ? 'Il grafico compare dopo i primi due movimenti di punti.' : 'Ancora pochi dati per il grafico.'}</p>
  const W = 320, H = 120, P = 10, max = Math.max(...pts.map(p => p.v)) || 1
  const xy = pts.map((p, i) => [P + (i / (pts.length - 1)) * (W - 2 * P), H - P - (p.v / max) * (H - 2 * P)])
  const line = xy.map(p => p.join(',')).join(' ')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Andamento: da ${pts[0].v} a ${pts[pts.length - 1].v} punti`}>
      <defs><linearGradient id="chartfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a47c9" stopOpacity=".45" /><stop offset="1" stopColor="#7a47c9" stopOpacity="0" /></linearGradient></defs>
      <polygon points={`${P},${H - P} ${line} ${W - P},${H - P}`} fill="url(#chartfill)" />
      <polyline points={line} className="line" />
      {pts.length <= 40 && xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" className="dot"><title>{pts[i].t}: {pts[i].v} pt</title></circle>)}
    </svg>
  )
}
