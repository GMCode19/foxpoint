import { useEffect, useState, useCallback } from 'react'
import { supabase as sb } from './supabase'

const GROUPS = [['top10', 'Top 10 PBI'], ['rilevante', 'Blader rilevanti'], ['capo', 'Capi team e creator']]
const MEDAL = ['🥇', '🥈', '🥉']
const ini = n => n.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '🦊'
const BADGES = [
  { k: 'a', i: '🎯', n: 'Prima taglia', d: 'Riscuoti la prima taglia', ok: w => w.length >= 1 },
  { k: 'b', i: '🔥', n: 'Cacciatore', d: '5 taglie riscosse', ok: w => w.length >= 5 },
  { k: 'c', i: '👑', n: 'Cacciatore di Top 10', d: 'Batti un blader della top 10', ok: (w, c) => w.some(x => c(x) === 'top10') },
  { k: 'd', i: '🦊', n: 'Colpo grosso', d: 'Batti un capo team', ok: (w, c) => w.some(x => c(x) === 'capo') },
  { k: 'e', i: '🎟️', n: 'Prima ranked', d: 'Gioca la prima ranked', ok: (w, c, r) => r.length >= 1 },
  { k: 'f', i: '🏅', n: 'Sul podio', d: 'Arriva almeno in semifinale in una ranked', ok: (w, c, r) => r.some(x => PODIUM.includes(x.phase)) },
  { k: 'g', i: '🏆', n: 'Campione', d: 'Vinci una ranked', ok: (w, c, r) => r.some(x => x.phase === 'winner') },
]
const PHASES = [['winner', 'Vincitore 🏆'], ['final', 'Finale (2°)'], ['sf', 'Semifinale'], ['qf', 'Quarti'],
  ['r16', 'Ottavi (R16)'], ['r32', 'R32'], ['r64', 'R64'], ['r128', 'R128'], ['groups', 'Eliminato ai gironi']]
const phaseName = k => PHASES.find(p => p[0] === k)?.[1] || k
const PODIUM = ['winner', 'final', 'sf']
const fmtDate = t => new Date(t).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const FRIENDLY = [
  [/one_pending_claim/, "C'è già una dichiarazione in attesa per questa taglia"],
  [/row-level security|permission denied/i, 'Non hai i permessi per questa azione'],
  [/violates foreign key/i, 'Non si può eliminare: ci sono dati collegati'],
  [/teams_participation_points_check/, 'I punti partecipazione devono essere tra 0 e 1000'],
  [/bounties_value_check/, 'Il valore della taglia non può essere negativo'],
  [/claims_check/, 'Non puoi riscuotere una taglia su te stesso'],
  [/duplicate key/i, 'Questo elemento esiste già'],
  [/Failed to fetch|NetworkError|Load failed/i, 'Connessione assente o instabile: riprova tra poco'],
]
const err = e => {
  const m = e?.message || String(e)
  alert(FRIENDLY.find(([re]) => re.test(m))?.[1] || m)
}
// Supabase restituisce al massimo 1000 righe per richiesta: scarico a pagine
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}
const LOGO = import.meta.env.BASE_URL + 'logo.png'
const APP_URL = window.location.origin + import.meta.env.BASE_URL
const SYNC_URL = 'https://github.com/GMCode19/foxpoint/actions/workflows/sync-pbi.yml'
const todayLocal = () => new Date().toLocaleDateString('sv-SE')
// impedisce che un doppio clic invii due volte la stessa azione
const inflight = new Set()
async function once(key, fn) {
  if (inflight.has(key)) return
  inflight.add(key)
  try { return await fn() } finally { inflight.delete(key) }
}

export default function App() {
  const [session, setSession] = useState(undefined), [recovery, setRecovery] = useState(false)
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((ev, s) => {
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <p className="c">Caricamento…</p>
  if (recovery) return <NewPassword done={() => setRecovery(false)} />
  return session ? <Home user={session.user} /> : <Auth />
}

// Dopo il link "Password dimenticata?" arrivato via email
function NewPassword({ done }) {
  const [pw, setPw] = useState(''), [msg, setMsg] = useState('')
  async function save(e) {
    e.preventDefault()
    const { error } = await sb.auth.updateUser({ password: pw })
    if (error) return setMsg(error.message)
    alert('Password aggiornata.'); done()
  }
  return (
    <form className="card c" onSubmit={save}>
      <img className="logo big" src={LOGO} alt="Lake Fox" />
      <h1>Nuova password</h1>
      <input type="password" placeholder="Nuova password (min. 6 caratteri)" value={pw} onChange={e => setPw(e.target.value)} minLength={6} required />
      <button>Salva</button>
      {msg && <p className="msg">{msg}</p>}
    </form>
  )
}

function Auth() {
  const [mode, setMode] = useState('login'), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [msg, setMsg] = useState('')
  async function submit(e) {
    e.preventDefault(); setMsg('')
    const { data, error } = mode === 'login'
      ? await sb.auth.signInWithPassword({ email, password: pw })
      : await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: APP_URL } })
    if (error) return setMsg(/Invalid login/i.test(error.message) ? 'Email o password non corretti' : error.message)
    if (mode === 'signup' && !data.session) setMsg('Registrazione fatta: controlla la mail per confermare, poi accedi.')
  }
  async function forgot() {
    if (!email) return setMsg('Scrivi prima la tua email qui sopra')
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL })
    setMsg(error ? error.message : 'Ti abbiamo mandato una mail con il link per scegliere una nuova password.')
  }
  return (
    <form className="card c" onSubmit={submit}>
      <img className="logo big" src={LOGO} alt="Lake Fox" />
      <h1>Fox Point</h1>
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
      <input type="password" placeholder="Password (min. 6 caratteri)" value={pw} onChange={e => setPw(e.target.value)} minLength={6} required />
      <button>{mode === 'login' ? 'Accedi' : 'Registrati'}</button>
      {msg && <p className="msg">{msg}</p>}
      <button type="button" className="ghost" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Non hai un account? Registrati' : 'Hai già un account? Accedi'}
      </button>
      {mode === 'login' && <button type="button" className="link" onClick={forgot}>Password dimenticata?</button>}
    </form>
  )
}

function Home({ user }) {
  const [m, setM] = useState(undefined)
  const load = useCallback(async () => {
    const { data, error } = await sb.from('team_members')
      .select('role, team_id, teams(name, participation_points), bladers!inner(id, nickname, user_id)')
      .eq('status', 'active').eq('bladers.user_id', user.id)
    if (error) return err(error)
    setM(data[0] || null)
  }, [user.id])
  useEffect(() => { load() }, [load])
  const out = <button className="ghost" onClick={() => sb.auth.signOut()}>Esci</button>
  if (m === undefined) return <p className="c">Caricamento…</p>
  return m ? <Team m={m} out={out} /> : <Join user={user} out={out} onDone={load} />
}

function Join({ user, out, onDone }) {
  const [code, setCode] = useState(''), [nick, setNick] = useState(''), [reqs, setReqs] = useState([])
  const loadReqs = () => sb.from('join_requests').select('*').eq('user_id', user.id)
    .order('created_at', { ascending: false }).then(({ data }) => setReqs(data || []))
  useEffect(() => { loadReqs() }, [])
  async function send(e) {
    e.preventDefault()
    const { error } = await sb.rpc('request_join', { p_code: code, p_nickname: nick })
    if (error) return err(error)
    setCode(''); loadReqs()
  }
  const pending = reqs.find(r => r.status === 'pending')
  return (
    <div className="card">
      <img className="logo big" src={LOGO} alt="Lake Fox" />
      <h1 className="c">Entra nel team</h1>
      {pending
        ? <><p>Richiesta inviata come <b>{pending.nickname}</b>: aspetta l'approvazione di un admin.</p><button onClick={onDone}>Controlla di nuovo</button></>
        : <form onSubmit={send} style={{ display: 'contents' }}>
            <input placeholder="Codice team" value={code} onChange={e => setCode(e.target.value)} required />
            <input placeholder="Il tuo nickname (come in squadra)" value={nick} onChange={e => setNick(e.target.value)} minLength={2} maxLength={30} required />
            <button>Invia richiesta</button>
          </form>}
      {reqs[0]?.status === 'rejected' && !pending && <p className="msg">L'ultima richiesta è stata rifiutata.</p>}
      {out}
    </div>
  )
}

function Team({ m, out }) {
  const team = m.team_id, me = m.bladers.id, admin = m.role === 'admin'
  const [tab, setTab] = useState('rank'), [pid, setPid] = useState(me)
  const [d, setD] = useState({ board: [], bounties: [], claims: [], reqs: [], bl: {}, led: [], tours: [], entries: [], tiers: {}, tp: {},
    tourById: {}, entryById: {}, claimById: {}, bountyById: {} })
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    try {
      const all = (t, f) => fetchAll(() => f(sb.from(t).select('*')))
      const { data: seasons } = await sb.from('seasons').select('id').eq('team_id', team).eq('is_active', true)
      const season = seasons?.[0]?.id ?? '00000000-0000-0000-0000-000000000000'
      const [board, bounties, claims, bl, reqs, led, tours, entries, tiers, tp] = await Promise.all([
        all('leaderboard', x => x.eq('team_id', team).order('fox_points', { ascending: false }).order('blader_id')),
        all('bounties', x => x.eq('team_id', team).eq('season_id', season).order('id')),
        all('claims', x => x.eq('team_id', team).eq('season_id', season).order('created_at', { ascending: false }).order('id')),
        all('bladers', x => x.order('id')),
        admin ? all('join_requests', x => x.eq('team_id', team).eq('status', 'pending').order('created_at')) : [],
        all('points_ledger', x => x.eq('team_id', team).eq('season_id', season).order('created_at').order('id')),
        all('tournaments', x => x.order('starts_at').order('id')),
        all('tournament_entries', x => x.eq('team_id', team).order('id')),
        all('ranked_tiers', x => x.order('sort')),
        all('ranked_tier_points', x => x.order('tier').order('phase')),
      ])
      const byId = a => Object.fromEntries(a.map(x => [x.id, x]))
      setD({
        board, bounties, claims, reqs, led, tours, entries,
        bl: byId(bl), tourById: byId(tours), entryById: byId(entries), claimById: byId(claims), bountyById: byId(bounties),
        tiers: Object.fromEntries(tiers.map(t => [t.tier, t])),
        tp: Object.fromEntries(tp.map(r => [r.tier + ':' + r.phase, r.points])),
      })
      setReady(true)
    } catch (e) { err(e) }
  }, [team, admin])
  useEffect(() => { load() }, [load])

  const nick = id => d.bl[id]?.nickname || '?'
  const act = (fn, args) => once(fn + JSON.stringify(args), async () => {
    const { error } = await sb.rpc(fn, args)
    error ? err(error) : await load()
  })
  const byRank = (a, b) => (d.bl[a.target_id]?.pro_rank ?? 999) - (d.bl[b.target_id]?.pro_rank ?? 999)
  const gi = c => GROUPS.findIndex(g => g[0] === c)
  const active = d.bounties.filter(b => b.active).sort(byRank)
  const free = d.board.filter(r => !d.bl[r.blader_id]?.user_id)
  const label = { pending: '⏳ in attesa', approved: '✅ approvata', rejected: '❌ rifiutata', revoked: '↩️ revocata' }
  const okClaims = d.claims.filter(c => c.status === 'approved')
  const [showAllClaims, setShowAllClaims] = useState(false)

  async function claim(b) {
    if (!confirm(`Confermi di aver battuto ${nick(b.target_id)}?`)) return
    await once('claim' + b.id, async () => {
      const { error } = await sb.from('claims').insert({ bounty_id: b.id, hunter_id: me })
      error ? err(error) : await load()
    })
  }
  async function revoke(c) {
    const why = prompt(`Revocare la vittoria di ${nick(c.hunter_id)} su ${nick(c.target_id)} (${c.value_snapshot} pt)?\nI punti verranno tolti dalla classifica.\n\nMotivo (facoltativo):`)
    if (why === null) return
    act('revoke_claim', { p_claim: c.id, p_note: why })
  }
  async function saveBounty(id, value, isActive) {
    await once('bounty' + id, async () => {
      const { error } = await sb.from('bounties').update({ value, active: isActive }).eq('id', id)
      error ? err(error) : await load()
    })
  }
  const lastSync = Object.values(d.bl).map(b => b.pro_synced_at).filter(Boolean).sort().pop()

  if (!ready) return <p className="c">Caricamento…</p>
  return (
    <div className="wrap">
      <header>
        <img className="logo" src={LOGO} alt={m.teams.name} />
        <span>{m.bladers.nickname}{admin && ' · admin'}</span>
        {out}
      </header>
      <nav>
        {[['rank', 'Classifica'], ['bounty', 'Taglie'], ['ranked', 'Ranked'], ['profile', 'Profilo'], ...(admin ? [['admin', 'Admin']] : [])].map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); if (k === 'profile') setPid(me) }}>{l}</button>)}
      </nav>

      {tab === 'rank' && d.board.map((r, i) => (
        <div className={`row click${r.blader_id === me ? ' me' : ''}`} key={r.blader_id} style={{ animationDelay: `${i * 35}ms` }}
          onClick={() => { setPid(r.blader_id); setTab('profile') }}>
          <span className="av">{MEDAL[i] || ini(r.nickname)}</span>
          <span>{i + 1}. <b>{r.nickname}</b><small>Taglie {r.bounty_points} · Ranked {r.ranked_points}</small></span>
          <span className="pts">{r.fox_points}</span>
        </div>
      ))}

      {tab === 'profile' && <Profile id={pid} d={d} nick={nick} />}

      {tab === 'ranked' && <Ranked d={d} team={team} me={me} admin={admin} part={m.teams.participation_points} nick={nick} act={act} reload={load} />}

      {tab === 'bounty' && <>
        {!active.length && <p className="mut">Nessuna taglia attiva al momento.</p>}
        {GROUPS.map(([k, t]) => active.some(b => b.category === k) && (
          <div key={k}>
            <h2>{t}</h2>
            {active.filter(b => b.category === k).map(b => (
              <div className="row" key={b.id}>
                <span><b>{nick(b.target_id)}</b><small>#{d.bl[b.target_id]?.pro_rank ?? '–'} PBI</small></span>
                <span className="pts">{b.value} pt</span>
                <button onClick={() => claim(b)}>Ho vinto</button>
              </div>
            ))}
          </div>
        ))}
        <h2>Ultime riscossioni</h2>
        {!d.claims.length && <p className="mut">Ancora nessuna riscossione.</p>}
        {d.claims.slice(0, 20).map(c => (
          <div className="row" key={c.id}>
            <span>{nick(c.hunter_id)} → {nick(c.target_id)}<small>{c.played_on} · {c.value_snapshot} pt</small></span>
            <span className="tag">{label[c.status]}</span>
          </div>
        ))}
      </>}

      {tab === 'admin' && <>
        <h2>Classifica PBI</h2>
        <div className="row">
          <span>Ultimo aggiornamento<small>{lastSync ? new Date(lastSync).toLocaleString('it-IT') : 'mai'} · automatico ogni mattina. Per farlo subito: apri la pagina, premi "Run workflow" e poi ricarica l'app dopo un minuto.</small></span>
          <a className="btn" href={SYNC_URL} target="_blank" rel="noreferrer">Aggiorna ora</a>
        </div>

        <h2>Punti partecipazione ranked</h2>
        <Participation team={team} value={m.teams.participation_points} />

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
            onSave={saveBounty} />)}
      </>}
    </div>
  )
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

function BountyRow({ b, name, note, onSave }) {
  const [v, setV] = useState(b.value), [a, setA] = useState(b.active)
  return (
    <div className="row">
      <span>{name}<small>{note}</small></span>
      <input type="number" min="0" value={v} onChange={e => setV(+e.target.value)} />
      <label className="chk"><input type="checkbox" checked={a} onChange={e => setA(e.target.checked)} /> attiva</label>
      <button onClick={() => onSave(b.id, v, a)}>Salva</button>
    </div>
  )
}

function Profile({ id, d, nick }) {
  const b = d.bl[id], row = d.board.find(r => r.blader_id === id)
  if (!b || !row) return <p className="mut">Profilo non disponibile.</p>
  const tour = tid => d.tourById[tid]
  const pos = d.board.findIndex(r => r.blader_id === id) + 1
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

function Participation({ team, value }) {
  const [v, setV] = useState(value)
  async function save() {
    const { error } = await sb.from('teams').update({ participation_points: v }).eq('id', team)
    error ? err(error) : alert('Salvato. Vale per i risultati inseriti da adesso in poi: ricarica la pagina.')
  }
  return (
    <div className="row">
      <span>Punti a ogni membro che gioca una ranked<small>Si sommano a quelli del piazzamento</small></span>
      <input type="number" min="0" value={v} onChange={e => setV(+e.target.value)} />
      <button onClick={save}>Salva</button>
    </div>
  )
}

function Ranked({ d, team, me, admin, part, nick, act, reload }) {
  const now = Date.now(), DAY = 864e5
  const tier = t => d.tiers[t.tier]
  const phasesFor = t => PHASES.filter(([k]) => k === 'groups' || d.tp[t.tier + ':' + k] !== undefined)
  const calc = (t, ph) => ph === 'groups' ? part : part + (tier(t)?.qualified_bonus || 0) + (d.tp[t.tier + ':' + ph] || 0)
  const byTour = {}
  d.entries.forEach(e => { (byTour[e.tournament_id] ||= []).push(e) })
  const entriesOf = t => byTour[t.id] || []
  const mine = t => entriesOf(t).find(e => e.blader_id === me)
  const upcoming = d.tours.filter(t => new Date(t.starts_at) > now)
  const recent = d.tours.filter(t => new Date(t.starts_at) <= now && now - new Date(t.starts_at) < 30 * DAY).reverse()
  const done = d.entries.filter(e => e.status === 'approved')
    .map(e => ({ e, t: d.tourById[e.tournament_id] })).filter(x => x.t)
    .sort((a, z) => z.t.starts_at.localeCompare(a.t.starts_at))
  const pending = d.entries.filter(e => e.status === 'pending')
  const tname = id => d.tourById[id]?.name || '?'
  const [showAll, setShowAll] = useState(false), [showRecent, setShowRecent] = useState(false)
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
    {upcoming.map(t => {
      const my = mine(t), going = entriesOf(t).map(e => nick(e.blader_id))
      return (
        <div className="row tour" key={t.id}>
          <span className="tier">{t.tier === 'slam' ? 'Slam' : tier(t)?.label.replace('PBI ', '')}</span>
          <span><b>{t.name}</b>
            <small>{fmtDate(t.starts_at)}{t.club ? ` · ${t.club}` : ''}{t.city ? `, ${t.city}` : ''}</small>
            <small>{going.length ? `🦊 ${going.join(', ')}` : 'Nessun Lake Fox iscritto'}{t.url && <> · <a href={t.url} target="_blank" rel="noreferrer">pagina PBI</a></>}</small>
          </span>
          {my
            ? <button className="ghost" onClick={() => act('ranked_leave', { p_team: team, p_tournament: t.id })}>Non partecipo</button>
            : <button onClick={() => act('ranked_join', { p_team: team, p_tournament: t.id })}>Partecipo</button>}
        </div>
      )
    })}

    <h2>Com'è andata?</h2>
    {!recent.length && <p className="mut">Nessuna ranked negli ultimi 30 giorni.</p>}
    {(showRecent ? recent : [...recent.filter(t => mine(t)), ...recent.filter(t => !mine(t)).slice(0, 10)]).map(t => <Report key={t.id} t={t} my={mine(t)} st={st} tierLabel={tier(t)?.label} phases={phasesFor(t)} calc={ph => calc(t, ph)}
      send={ph => act('ranked_report', { p_team: team, p_tournament: t.id, p_phase: ph })} />)}
    {recent.filter(t => !mine(t)).length > 10 && <button className="ghost more" onClick={() => setShowRecent(!showRecent)}>{showRecent ? 'Mostra meno' : `Mostra tutte (${recent.length})`}</button>}

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
