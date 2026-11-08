import { useEffect, useState, useCallback, useRef } from 'react'
import { sb, LOGO, PHOTO_BUCKET, MEDAL, err, fetchAll, once, compressPhoto, loadPhotos, ini, positions } from './lib'
import { Auth, NewPassword, Join } from './Auth'
import { Profile } from './Profile'
import { Ranked } from './Ranked'
import { AdminPanel } from './Admin'
import { BountyBoard } from './Bounties'

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
let staticData = null   // tabella punti PBI: non cambia, la leggo una volta sola

function Team({ m, out }) {
  const team = m.team_id, me = m.bladers.id, admin = m.role === 'admin'
  const [tab, setTab] = useState('rank'), [pid, setPid] = useState(me)
  const [d, setD] = useState(EMPTY), [ready, setReady] = useState(false)
  const [part, setPart] = useState(m.teams.participation_points)
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
  async function uploadPhoto(b, file) {
    const name = nick(b.target_id)
    if (!confirm(`${name} ti ha dato il consenso a mettere la sua foto nell'app del team?\n\nConferma solo se te l'ha detto lui (o un genitore, se è minorenne).`)) return
    await once('photo' + b.target_id, async () => {
      try {
        const { blob, ext } = await compressPhoto(file)
        const path = `${team}/${b.target_id}-${Date.now()}.${ext}`
        const up = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false })
        if (up.error) throw up.error
        const { data: old, error } = await sb.rpc('set_blader_photo', { p_team: team, p_blader: b.target_id, p_path: path })
        if (error) { await sb.storage.from(PHOTO_BUCKET).remove([path]); throw error }
        if (old) await sb.storage.from(PHOTO_BUCKET).remove([old])
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
          <span className="av">{r.fox_points > 0 && MEDAL[pos[i] - 1] || ini(r.nickname)}</span>
          <span>{pos[i]}. <b>{r.nickname}</b><small>Taglie {r.bounty_points} · Ranked {r.ranked_points}</small></span>
          <span className="pts">{r.fox_points}</span>
        </div>
      ))}

      {tab === 'bounty' && <BountyBoard d={d} me={me} active={active} nick={nick} claim={claim} />}

      {tab === 'ranked' && <Ranked d={d} team={team} me={me} admin={admin} part={part} nick={nick} act={act} reload={load} />}

      {tab === 'profile' && <Profile id={pid} d={d} nick={nick} />}

      {tab === 'admin' && <AdminPanel d={d} team={team} nick={nick} act={act} part={part} onPart={setPart} active={active} free={free}
        revoke={revoke} saveBounty={saveBounty} uploadPhoto={uploadPhoto} removePhoto={removePhoto} />}
    </div>
  )
}
