import { useEffect, useState, useCallback, useRef } from 'react'
import { sb, LOGO, PHOTO_BUCKET, MEDAL, err, fetchAll, once, loadPhotos, ini, positions } from './lib'
import { Auth, NewPassword, Join } from './Auth'
import { Profile } from './Profile'
import { Ranked } from './Ranked'
import { AdminPanel } from './Admin'
import { BountyBoard } from './Bounties'
import { CropModal } from './Crop'

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

const EMPTY = { board: [], bounties: [], claims: [], reqs: [], bl: {}, led: [], tours: [], entries: [], tiers: {}, tp: {},
  tourById: {}, entryById: {}, claimById: {}, bountyById: {}, photos: {} }
const HASH = { rank: 'classifica', bounty: 'taglie', ranked: 'ranked', profile: 'profilo', admin: 'admin' }
let staticData = null   // tabella punti PBI: non cambia, la leggo una volta sola

function Team({ m, out }) {
  const team = m.team_id, me = m.bladers.id, admin = m.role === 'admin'
  // la scheda aperta resta nell'indirizzo (#taglie, #ranked…): ricaricando la pagina si torna lì
  const [tab, setTab] = useState(() => {
    const k = Object.keys(HASH).find(k => HASH[k] === decodeURIComponent(location.hash.slice(1)))
    return k && (k !== 'admin' || admin) ? k : 'rank'
  })
  useEffect(() => {
    const h = tab === 'rank' ? '' : '#' + HASH[tab]
    if (location.hash !== h) history.replaceState(history.state, '', location.pathname + location.search + h)
  }, [tab])
  const [pid, setPid] = useState(me)
  const [d, setD] = useState(EMPTY), [ready, setReady] = useState(false)
  const [part, setPart] = useState(m.teams.participation_points)
  const [crop, setCrop] = useState(null)   // { b, file }: inquadratura della foto in corso
  const seq = useRef(0)   // solo l'ultimo caricamento avviato aggiorna lo schermo

  const load = useCallback(async () => {
    const my = ++seq.current
    try {
      const all = (t, f) => fetchAll(() => f(sb.from(t).select('*')))
      const { data: seasons, error } = await sb.from('seasons').select('id').eq('team_id', team).eq('is_active', true)
      if (error) throw error
      const season = seasons?.[0]?.id ?? '00000000-0000-0000-0000-000000000000'
      staticData ||= await Promise.all([all('ranked_tiers', x => x.order('sort')), all('ranked_tier_points', x => x.order('tier').order('phase'))])
      const [tiers, tp] = staticData
      const [board, bounties, claims, bl, reqs, led, tours, entries, photos] = await Promise.all([
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
      const byId = a => Object.fromEntries(a.map(x => [x.id, x]))
      setD({
        board, bounties, claims, reqs, led, tours, entries, photos,
        bl: byId(bl), tourById: byId(tours), entryById: byId(entries), claimById: byId(claims), bountyById: byId(bounties),
        tiers: Object.fromEntries(tiers.map(t => [t.tier, t])),
        tp: Object.fromEntries(tp.map(r => [r.tier + ':' + r.phase, r.points])),
      })
      setReady(true)
    } catch (e) { if (my === seq.current) err(e) }
  }, [team, admin])
  useEffect(() => { load() }, [load])

  const nick = id => d.bl[id]?.nickname || '?'
  const act = (fn, args) => once(fn + JSON.stringify(args), async () => {
    const { error } = await sb.rpc(fn, args)
    error ? err(error) : await load()
  })
  const byRank = (a, b) => (d.bl[a.target_id]?.pro_rank ?? 999) - (d.bl[b.target_id]?.pro_rank ?? 999)
  const active = d.bounties.filter(b => b.active).sort(byRank)
  const free = d.board.filter(r => !d.bl[r.blader_id]?.user_id)
  const pos = positions(d.board)

  async function claim(b) {
    if (!confirm(`Confermi di aver battuto ${nick(b.target_id)}?`)) return
    await once('claim' + b.id, async () => {
      const { error } = await sb.from('claims').insert({ bounty_id: b.id, hunter_id: me })
      error ? err(error) : await load()
    })
  }
  function revoke(c) {
    const why = prompt(`Revocare la vittoria di ${nick(c.hunter_id)} su ${nick(c.target_id)} (${c.value_snapshot} pt)?\nI punti verranno tolti dalla classifica.\n\nMotivo (facoltativo):`)
    if (why !== null) act('revoke_claim', { p_claim: c.id, p_note: why })
  }
  async function saveBounty(id, value, isActive) {
    await once('bounty' + id, async () => {
      const { error } = await sb.from('bounties').update({ value, active: isActive }).eq('id', id)
      error ? err(error) : await load()
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
        setCrop(null)
        await load()
      } catch (e) {
        err(/blader_photos|set_blader_photo|Bucket not found/i.test(e?.message || '') ? new Error('Le foto non sono ancora attive: esegui prima lo script foxpoint_07_foto.sql su Supabase') : e)
      }
    })
  }
  async function removePhoto(b) {
    if (!confirm(`Togliere la foto di ${nick(b.target_id)}?`)) return
    await once('photo' + b.target_id, async () => {
      const { data: old, error } = await sb.rpc('remove_blader_photo', { p_team: team, p_blader: b.target_id })
      if (error) return err(error)
      if (old) await sb.storage.from(PHOTO_BUCKET).remove([old])
      await load()
    })
  }

  if (!ready) return <p className="c">Caricamento…</p>
  const tabs = [['rank', 'Classifica'], ['bounty', 'Taglie'], ['ranked', 'Ranked'], ['profile', 'Profilo'], ...(admin ? [['admin', 'Admin']] : [])]
  return (
    <div className="wrap">
      <header>
        <img className="logo" src={LOGO} alt={m.teams.name} />
        <span>{m.bladers.nickname}{admin && ' · admin'}</span>
        {out}
      </header>
      <nav>
        {tabs.map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); if (k === 'profile') setPid(me) }}>{l}</button>)}
      </nav>

      {tab === 'rank' && d.board.map((r, i) => (
        <div className={`row click${r.blader_id === me ? ' me' : ''}`} key={r.blader_id} style={{ animationDelay: `${i * 35}ms` }}
          onClick={() => { setPid(r.blader_id); setTab('profile') }}>
          <span className="av">{r.fox_points > 0 && i < 3 && MEDAL[i] || ini(r.nickname)}</span>
          <span>{pos[i]}. <b>{r.nickname}</b><small>Taglie {r.bounty_points} · Ranked {r.ranked_points}</small></span>
          <span className="pts">{r.fox_points}</span>
        </div>
      ))}

      {tab === 'bounty' && <BountyBoard d={d} me={me} active={active} nick={nick} claim={claim} />}

      {tab === 'ranked' && <Ranked d={d} team={team} me={me} admin={admin} part={part} nick={nick} act={act} reload={load} />}

      {tab === 'profile' && <Profile id={pid} d={d} nick={nick} />}

      {tab === 'admin' && <AdminPanel d={d} team={team} nick={nick} act={act} part={part} onPart={setPart} active={active} free={free}
        revoke={revoke} saveBounty={saveBounty} uploadPhoto={(b, file) => setCrop({ b, file })} removePhoto={removePhoto} />}

      {crop && <CropModal file={crop.file} name={nick(crop.b.target_id)} onCancel={() => setCrop(null)} onSave={img => uploadPhoto(crop.b, img)} />}
    </div>
  )
}
