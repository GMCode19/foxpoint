import { useEffect, useState, useCallback, useRef } from 'react'
import { sb, LOGO, PHOTO_BUCKET, err, fetchAll, once, loadPhotos } from './lib'
import { Auth, NewPassword, Join } from './Auth'
import { Profile } from './Profile'
import { Ranked } from './Ranked'
import { AdminPanel } from './Admin'
import { BountyBoard } from './Bounties'
import { Leaderboard } from './Leaderboard'
import { CropModal } from './Crop'
import { UIHost, ask, toast } from './ui'
import { Icon } from './icons'

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
  return <>
    {session === undefined ? <Splash /> : recovery ? <NewPassword done={() => setRecovery(false)} /> : session ? <Home user={session.user} /> : <Auth />}
    <UIHost />
  </>
}

const Splash = () => <div className="splash"><img src={LOGO} alt="Lake Fox" /></div>

function Home({ user }) {
  const [m, setM] = useState(() => readCache('fx-member-' + user.id))
  const load = useCallback(async () => {
    const { data, error } = await sb.from('team_members')
      .select('role, team_id, teams(name, participation_points), bladers!inner(id, nickname, user_id)')
      .eq('status', 'active').eq('bladers.user_id', user.id)
    if (error) {   // senza rete con dati salvati: niente errore, ci pensa l'avviso "Sei offline"
      if (m === undefined) { setM(null); return err(error) }
      return /fetch|network|load failed/i.test(error.message || '') ? undefined : err(error)
    }
    setM(data[0] || null)
    writeCache('fx-member-' + user.id, data[0] || null)
  }, [user.id])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  if (m === undefined) return <Splash />
  return m ? <Team key={m.team_id} m={m} /> : <Join user={user} out={<button className="ghost" onClick={() => sb.auth.signOut()}>Esci</button>} onDone={load} />
}

// ultimi dati letti, salvati sul telefono: l'app si apre subito e funziona anche senza rete (in sola lettura)
function readCache(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : undefined } catch { return undefined } }
function writeCache(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* spazio pieno o modalità privata */ } }

const HASH = { rank: 'classifica', bounty: 'taglie', ranked: 'ranked', profile: 'profilo', admin: 'admin' }
const TITLE = { rank: 'Classifica', bounty: 'Taglie', ranked: 'Ranked', profile: 'Profilo', admin: 'Admin' }
let staticData = null   // tabella punti PBI: non cambia, la leggo una volta sola

function build(raw) {
  const byId = a => Object.fromEntries(a.map(x => [x.id, x]))
  return {
    ...raw,
    bl: byId(raw.bladers), tourById: byId(raw.tours), entryById: byId(raw.entries), claimById: byId(raw.claims), bountyById: byId(raw.bounties),
    tiers: Object.fromEntries(raw.tiers.map(t => [t.tier, t])),
    tp: Object.fromEntries(raw.tp.map(r => [r.tier + ':' + r.phase, r.points])),
  }
}

function Team({ m }) {
  const team = m.team_id, me = m.bladers.id, admin = m.role === 'admin'
  const cacheKey = 'fx-data-v2-' + team
  // la scheda aperta resta nell'indirizzo (#taglie, #ranked…): ricaricando la pagina si torna lì
  const [tab, setTabRaw] = useState(() => {
    const k = Object.keys(HASH).find(k => HASH[k] === decodeURIComponent(location.hash.slice(1)))
    return k && (k !== 'admin' || admin) ? k : 'rank'
  })
  const setTab = t => { setTabRaw(t); window.scrollTo({ top: 0 }) }
  useEffect(() => {
    const h = tab === 'rank' ? '' : '#' + HASH[tab]
    if (location.hash !== h) history.replaceState(history.state, '', location.pathname + location.search + h)
  }, [tab])
  const [pid, setPid] = useState(me)
  const cached = useRef(readCache(cacheKey))
  const [d, setD] = useState(() => cached.current ? build(cached.current.raw) : null)
  const [offline, setOffline] = useState(null)   // ora degli ultimi dati, se non si riesce ad aggiornarli
  const [part, setPart] = useState(m.teams.participation_points)
  const [crop, setCrop] = useState(null)   // { b, file }: inquadratura della foto in corso
  const seq = useRef(0), lastLoad = useRef(0)   // solo l'ultimo caricamento avviato aggiorna lo schermo

  const load = useCallback(async () => {
    const my = ++seq.current
    lastLoad.current = Date.now()
    try {
      const all = (t, f) => fetchAll(() => f(sb.from(t).select('*')))
      const { data: seasons, error } = await sb.from('seasons').select('id').eq('team_id', team).eq('is_active', true)
      if (error) throw error
      const season = seasons?.[0]?.id ?? '00000000-0000-0000-0000-000000000000'
      staticData ||= await Promise.all([all('ranked_tiers', x => x.order('sort')), all('ranked_tier_points', x => x.order('tier').order('phase'))])
      const [tiers, tp] = staticData
      const [board, bounties, claims, bladers, reqs, led, tours, entries, photos] = await Promise.all([
        all('leaderboard', x => x.eq('team_id', team).order('fox_points', { ascending: false }).order('nickname')),
        all('bounties', x => x.eq('team_id', team).eq('season_id', season).order('id')),
        all('claims', x => x.eq('team_id', team).eq('season_id', season).order('created_at', { ascending: false }).order('id')),
        all('bladers', x => x.order('id')),
        admin ? all('join_requests', x => x.eq('team_id', team).eq('status', 'pending').order('created_at')) : [],
        all('points_ledger', x => x.eq('team_id', team).eq('season_id', season).order('created_at').order('id')),
        all('tournaments', x => x.order('starts_at').order('id')),
        all('tournament_entries', x => x.eq('team_id', team).order('id')),
        loadPhotos(team).catch(() => ({})),   // le foto non devono mai bloccare l'app
      ])
      if (my !== seq.current) return
      const raw = { board, bounties, claims, bladers, reqs, led, tours, entries, photos, tiers, tp }
      setD(build(raw)); setOffline(null)
      writeCache(cacheKey, { at: Date.now(), raw })
    } catch (e) {
      if (my !== seq.current) return
      const net = /Failed to fetch|NetworkError|Load failed|network/i.test(e?.message || '')
      if (net && cached.current) setOffline(readCache(cacheKey)?.at || cached.current.at)
      else err(e)
    }
  }, [team, admin, cacheKey])
  useEffect(() => { load() }, [load])

  // aggiornamenti in tempo reale (approvazioni, nuove dichiarazioni…) e al ritorno nell'app
  useEffect(() => {
    let t
    const kick = () => { clearTimeout(t); t = setTimeout(load, 600) }
    const ch = sb.channel('fx-' + team)
    for (const table of ['claims', 'tournament_entries', 'points_ledger', 'bounties', 'blader_photos', 'join_requests'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `team_id=eq.${team}` }, kick)
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, kick)
    ch.subscribe()
    const vis = () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 15000) load() }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('online', load)
    return () => { clearTimeout(t); sb.removeChannel(ch); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', load) }
  }, [team, load])

  if (!d) return <Skeleton />

  const nick = id => d.bl[id]?.nickname || '?'
  // azione sul database; restituisce true se è andata a buon fine
  const act = (fn, args) => once(fn + JSON.stringify(args), async () => {
    const { error } = await sb.rpc(fn, args)
    if (error) { err(error); return false }
    await load(); return true
  })
  const byRank = (a, b) => (d.bl[a.target_id]?.pro_rank ?? 999) - (d.bl[b.target_id]?.pro_rank ?? 999)
  const active = d.bounties.filter(b => b.active).sort(byRank)
  const free = d.board.filter(r => !d.bl[r.blader_id]?.user_id)
  const todo = admin ? d.claims.filter(c => c.status === 'pending').length + d.entries.filter(e => e.status === 'pending').length + d.reqs.length : 0

  async function claim(b) {
    return once('claim' + b.id, async () => {
      const { error } = await sb.from('claims').insert({ bounty_id: b.id, hunter_id: me })
      if (error) { err(error); return false }
      await load(); return true
    })
  }
  async function revoke(c) {
    const why = await ask({ title: `Revocare la vittoria di ${nick(c.hunter_id)} su ${nick(c.target_id)}?`, text: `I ${c.value_snapshot} punti verranno tolti dalla classifica.`,
      input: { placeholder: 'Motivo (facoltativo)' }, ok: 'Revoca', danger: true })
    if (why !== null && await act('revoke_claim', { p_claim: c.id, p_note: why })) toast('Vittoria revocata')
  }
  async function saveBounty(id, value, isActive) {
    await once('bounty' + id, async () => {
      const { error } = await sb.from('bounties').update({ value, active: isActive }).eq('id', id)
      if (error) return err(error)
      toast('Taglia salvata', { kind: 'ok' }); await load()
    })
  }
  // dopo l'inquadratura (CropModal): carica il file, lo registra e cancella quello vecchio
  async function uploadPhoto(b, { blob, ext }) {
    await once('photo' + b.target_id, async () => {
      try {
        const path = `${team}/${b.target_id}-${Date.now()}.${ext}`
        const up = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false })
        if (up.error) throw up.error
        const { data: old, error } = await sb.rpc('set_blader_photo', { p_team: team, p_blader: b.target_id, p_path: path })
        if (error) { await sb.storage.from(PHOTO_BUCKET).remove([path]); throw error }
        if (old) await sb.storage.from(PHOTO_BUCKET).remove([old])
        setCrop(null); toast('Foto salvata', { kind: 'ok' })
        await load()
      } catch (e) {
        err(/blader_photos|set_blader_photo|Bucket not found/i.test(e?.message || '') ? new Error('Le foto non sono ancora attive: esegui prima lo script foxpoint_07_foto.sql su Supabase') : e)
      }
    })
  }
  async function removePhoto(b) {
    if (!await ask({ title: `Togliere la foto di ${nick(b.target_id)}?`, ok: 'Togli foto', danger: true })) return
    await once('photo' + b.target_id, async () => {
      const { data: old, error } = await sb.rpc('remove_blader_photo', { p_team: team, p_blader: b.target_id })
      if (error) return err(error)
      if (old) await sb.storage.from(PHOTO_BUCKET).remove([old])
      toast('Foto tolta'); await load()
    })
  }
  const openProfile = id => { setPid(id); setTab('profile') }

  const tabs = [['rank', 'Classifica', Icon.trophy], ['bounty', 'Taglie', Icon.target], ['ranked', 'Ranked', Icon.calendar], ['profile', 'Profilo', Icon.user]]
  const navOn = tab === 'admin' ? 'profile' : tab
  return (
    <div className="wrap app">
      <header className="top">
        <img className="logo" src={LOGO} alt={m.teams.name} />
        <h1 className="title">{tab === 'profile' && pid !== me ? nick(pid) : TITLE[tab]}</h1>
      </header>
      {offline && <p className="offline"><Icon.wifiOff width="16" height="16" /> Sei offline · dati delle {new Date(offline).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>}

      <main key={tab + (tab === 'profile' ? pid : '')} className="view">
        {tab === 'rank' && <Leaderboard d={d} me={me} nick={nick} openProfile={openProfile} />}
        {tab === 'bounty' && <BountyBoard d={d} me={me} active={active} nick={nick} claim={claim} />}
        {tab === 'ranked' && <Ranked d={d} team={team} me={me} admin={admin} part={part} nick={nick} act={act} reload={load} />}
        {tab === 'profile' && <Profile id={pid} me={me} d={d} nick={nick} admin={admin} todo={todo} goTab={setTab} back={() => setTab('rank')} part={part} />}
        {tab === 'admin' && <AdminPanel d={d} team={team} nick={nick} act={act} part={part} onPart={setPart} active={active} free={free}
          revoke={revoke} saveBounty={saveBounty} uploadPhoto={(b, file) => setCrop({ b, file })} removePhoto={removePhoto} back={() => setTab('profile')} reload={load} />}
      </main>

      <nav className="tabbar" aria-label="Sezioni">
        {tabs.map(([k, l, I]) => (
          <button key={k} type="button" className={navOn === k ? 'on' : ''} aria-current={navOn === k ? 'page' : undefined}
            onClick={() => { if (k === 'profile') setPid(me); setTab(k) }}>
            <span className="tab-ic"><I />{k === 'profile' && todo > 0 && <em className="dot" aria-label={`${todo} da approvare`}>{todo}</em>}</span>{l}
          </button>
        ))}
      </nav>

      {crop && <CropModal file={crop.file} name={nick(crop.b.target_id)} onCancel={() => setCrop(null)} onSave={img => uploadPhoto(crop.b, img)} />}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="wrap app" aria-busy="true" aria-label="Caricamento">
      <header className="top"><img className="logo" src={LOGO} alt="" /><span className="sk" style={{ width: 150, height: 28 }} /></header>
      <div className="sk-podium">{[70, 96, 54].map((h, i) => <span key={i} className="sk" style={{ height: h }} />)}</div>
      {[0, 1, 2, 3].map(i => <span key={i} className="sk sk-row" />)}
    </div>
  )
}
