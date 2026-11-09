import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ini, positions, phaseName } from './lib'
import { Icon } from './icons'

const WEEK = 7 * 864e5
const RING = ['gold', 'silver', 'bronze']

export const ago = t => {
  const s = (Date.now() - new Date(t)) / 1000
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min fa`
  if (s < 86400) return `${Math.round(s / 3600)} ${Math.round(s / 3600) === 1 ? 'ora' : 'ore'} fa`
  const g = Math.round(s / 86400)
  return g === 1 ? 'ieri' : `${g} giorni fa`
}

// movimento in classifica rispetto a 7 giorni fa (punti di questa settimana tolti)
function weekly(d) {
  const since = Date.now() - WEEK, gain = {}
  for (const l of d.led) if (new Date(l.created_at) >= since) gain[l.blader_id] = (gain[l.blader_id] || 0) + l.points
  const before = d.board.map(r => ({ ...r, fox_points: r.fox_points - (gain[r.blader_id] || 0) })).sort((a, z) => z.fox_points - a.fox_points)
  const oldPos = Object.fromEntries(positions(before).map((p, i) => [before[i].blader_id, p]))
  return { gain, oldPos }
}

export function Leaderboard({ d, me, nick, openProfile }) {
  const pos = positions(d.board)
  const { gain, oldPos } = weekly(d)
  const rows = d.board.map((r, i) => ({ ...r, pos: pos[i], move: oldPos[r.blader_id] - pos[i], gain: gain[r.blader_id] || 0 }))
  const podium = rows.slice(0, 3).filter(r => r.fox_points > 0)
  const rest = rows.slice(podium.length)
  const mine = rows.find(r => r.blader_id === me)
  const meRef = useRef(null), [meVisible, setMeVisible] = useState(true)
  useEffect(() => {
    const el = meRef.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setMeVisible(e.isIntersecting), { rootMargin: '0px 0px -90px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [mine?.pos, podium.length])
  const refIf = id => id === me ? meRef : undefined
  const Move = ({ r }) => r.move ? <span className={'move ' + (r.move > 0 ? 'up' : 'down')} aria-label={`${r.move > 0 ? 'salito' : 'sceso'} di ${Math.abs(r.move)} in settimana`}>{r.move > 0 ? '▲' : '▼'}{Math.abs(r.move)}</span> : null

  if (!rows.length) return <p className="empty">Nessun membro ancora in classifica.</p>
  return <>
    {podium.length > 0 && (
      <div className={'podium n' + podium.length}>
        {[1, 0, 2].filter(i => podium[i]).map(i => {
          const r = podium[i]
          return (
            <button type="button" key={r.blader_id} className={'pod ' + RING[r.pos - 1 > 2 ? 2 : r.pos - 1] + (r.blader_id === me ? ' me' : '')} ref={refIf(r.blader_id)}
              style={{ animationDelay: `${[90, 0, 180][i]}ms` }} onClick={() => openProfile(r.blader_id)} aria-label={`${r.pos}° ${r.nickname}, ${r.fox_points} punti`}>
              <span className="pod-av">{ini(r.nickname)}</span>
              <span className="pod-name">{r.nickname}</span>
              <span className="pod-pts"><b className="num">{r.fox_points}</b><small>PT</small></span>
              <Move r={r} />
              <span className="pod-base"><span className="num">{r.pos}</span></span>
            </button>
          )
        })}
      </div>
    )}
    <div className="list">
      {rest.map((r, i) => (
        <button type="button" className={'row lb' + (r.blader_id === me ? ' me' : '')} key={r.blader_id} ref={refIf(r.blader_id)}
          style={{ animationDelay: `${200 + i * 40}ms` }} onClick={() => openProfile(r.blader_id)}>
          <span className="lb-pos num">{r.pos}</span>
          <span className="av sm">{ini(r.nickname)}</span>
          <span className="lb-name"><b>{r.nickname}</b><small>Taglie {r.bounty_points} · Ranked {r.ranked_points}</small></span>
          <Move r={r} />
          <span className="lb-pts num">{r.fox_points}</span>
        </button>
      ))}
    </div>

    <Feed d={d} nick={nick} />

    {mine && !meVisible && createPortal(
      <button type="button" className="mebar" onClick={() => openProfile(me)}>
        <span className="av sm">{ini(mine.nickname)}</span>
        <span><b>Tu sei {mine.pos}°</b> · {mine.fox_points} pt<small>{mine.gain > 0 ? `+${mine.gain} pt questa settimana` : 'Nessun punto questa settimana'}</small></span>
        <Icon.chevron />
      </button>, document.body
    )}
  </>
}

// "Ultime dal team": ogni movimento di punti (taglie e ranked) degli ultimi 14 giorni
function Feed({ d, nick }) {
  const [all, setAll] = useState(false)
  const items = d.led.filter(l => l.points > 0 && (l.source === 'bounty' || l.source === 'ranked') && Date.now() - new Date(l.created_at) < 2 * WEEK)
    .slice().reverse()
    .map(l => {
      if (l.source === 'bounty') {
        const c = d.claimById[l.ref_id]
        return { id: l.id, at: l.created_at, pts: l.points, text: <><b>{nick(l.blader_id)}</b> ha riscosso la taglia su <b>{c ? nick(c.target_id) : '?'}</b></> }
      }
      const e = d.entryById[l.ref_id], t = e && d.tourById[e.tournament_id]
      return { id: l.id, at: l.created_at, pts: l.points, text: <><b>{nick(l.blader_id)}</b> · {e ? phaseName(e.phase).replace(/ \(.*\)/, '') : 'ranked'}{t ? <> alla {t.name}</> : null}</> }
    })
  if (!items.length) return null
  return <>
    <h2>Ultime dal team</h2>
    <div className="feed">
      {(all ? items.slice(0, 20) : items.slice(0, 4)).map(x => (
        <div className="feed-item" key={x.id}>
          <span>{x.text}<small>{ago(x.at)}</small></span>
          <span className="feed-pts num">+{x.pts}</span>
        </div>
      ))}
    </div>
    {items.length > 4 && <button className="ghost more" onClick={() => setAll(!all)}>{all ? 'Mostra meno' : 'Mostra altre'}</button>}
  </>
}
