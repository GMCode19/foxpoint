import { useEffect, useState } from 'react'
import { sb, ini, buildAlbum, RARITIES, RARITY_LABEL, GROUPS, ALBUM_GOALS } from './lib'
import { Sheet } from './ui'
import { Icon } from './icons'

// immagine della carta: personaggio ritagliato dal manifesto, altrimenti foto profilo, altrimenti iniziali
export function CardArt({ d, target, name }) {
  const poster = d.photos?.[target], avatar = d.avatars?.[target]
  return (
    <span className="acard-art">
      <svg className="acard-stadium" viewBox="0 0 200 150" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="100" cy="75" r="64" /><circle cx="100" cy="75" r="38" /><path d="M40 15l120 120M160 15L40 135" /></svg>
      {poster ? <img className="acard-poster" src={poster} alt="" loading="lazy" />
        : avatar ? <img className="acard-avatar" src={avatar} alt="" loading="lazy" />
        : <span className="acard-ini">{ini(name)}</span>}
    </span>
  )
}

// carta grande (scheda della carta e animazione di sblocco)
export function BigCard({ d, target, name, rarity, info, copies, sweep }) {
  return (
    <div className={'acard big r-' + rarity}>
      <div className="acard-in">
        <div className="acard-top"><span>LAKE FOX</span><em>{RARITY_LABEL[rarity]}</em></div>
        <CardArt d={d} target={target} name={name} />
        <div className="acard-name"><b>{name}</b></div>
        <div className="acard-info">{info}</div>
        {copies > 1 && <span className="acard-copies">×{copies}</span>}
        <span className={'acard-foil' + (sweep ? ' sweep' : '')} aria-hidden="true" />
      </div>
    </div>
  )
}

const catLabel = k => GROUPS.find(g => g[0] === k)?.[1] || ''
const when = c => new Date(c.played_on || c.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

export function AlbumView({ d, who, me, nick, back }) {
  const a = buildAlbum(d, who), self = who === me
  const [open, setOpen] = useState(null)
  // all'apertura del proprio album il database ricontrolla i set completati (es. un ricercato tolto dalla lista)
  useEffect(() => { if (self) sb.rpc('album_refresh').then(() => {}, () => {}) }, [self])
  if (!d.album) return <>
    <button type="button" className="back" onClick={back}><Icon.back width="18" height="18" /> Profilo</button>
    <p className="empty">L'album sarà disponibile appena un admin avrà aggiornato il database (script 14).</p>
  </>
  const done = new Set((d.achievements || []).filter(x => x.blader_id === who).map(x => x.key))
  const next = self && a.sets.map(s => ({ s, miss: s.slots.length - s.got })).filter(x => x.miss > 0 && !done.has('set_' + x.s.k)).sort((x, y) => x.miss - y.miss)[0]
  const card = s => s.best
    ? <button key={s.target} type="button" className={'acard mini r-' + s.best} onClick={() => setOpen(s)}
        aria-label={`${nick(s.target)}, carta ${RARITY_LABEL[s.best].toLowerCase()}${s.owned.length > 1 ? `, ${s.owned.length} espansioni` : s.copies > 1 ? `, ${s.copies} copie` : ''}`}>
        <span className="acard-in">
          <CardArt d={d} target={s.target} name={nick(s.target)} />
          <span className="acard-mname">{nick(s.target)}</span>
          <span className="acard-mrar">{RARITY_LABEL[s.best]}</span>
        </span>
        {(s.owned.length > 1 || s.copies > 1) && <span className="acard-badge">{s.owned.length > 1 ? `${s.owned.length} esp.` : `×${s.copies}`}</span>}
      </button>
    : <div key={s.target} className="acard mini locked" role="img" aria-label={`${nick(s.target)}, da catturare, ${RARITY_LABEL[s.now].toLowerCase()}`}>
        <svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="22" r="11" /><path d="M7 60c2-14 11-21 23-21s21 7 23 21z" /></svg>
        <span className="acard-mname">{nick(s.target)}</span>
        <span className="acard-mrar">{RARITY_LABEL[s.now]}</span>
      </div>

  return <>
    <button type="button" className="back" onClick={back}><Icon.back width="18" height="18" /> {self ? 'Profilo' : nick(who)}</button>
    <div className="album-head">
      <span><small>{self ? 'La tua collezione' : 'Collezione di ' + nick(who)}</small><b>{a.cards} {a.cards === 1 ? 'carta' : 'carte'} · {a.people} blader</b></span>
      <span className="album-count num">{a.got}<small>/{a.total}</small></span>
    </div>
    <div className="album-bar" role="progressbar" aria-valuenow={a.got} aria-valuemax={a.total} aria-label="Carte collezionate"><i style={{ width: `${a.total ? a.got / a.total * 100 : 0}%` }} /></div>
    <div className="album-legend">
      {[...RARITIES].reverse().map(r => <span key={r} className={'r-' + r}><b className="num">{a.count[r]}</b><small>{RARITY_LABEL[r]}</small></span>)}
    </div>
    {next && <p className="album-next"><Icon.trophy width="20" height="20" /><span>Prossimo traguardo: <b>{ALBUM_GOALS.find(g => g.k === 'set_' + next.s.k)?.n}</b> · ti {next.miss === 1 ? 'manca 1 carta' : `mancano ${next.miss} carte`}</span></p>}
    {!a.cards && <p className="empty">{self ? 'Ancora nessuna carta. Batti un ricercato in una ranked: quando la vittoria viene confermata, la sua carta entra qui.' : 'Ancora nessuna carta in questo album.'}</p>}

    {a.sets.map(s => (
      <section key={s.k} className="album-set">
        <h2>{s.label} <small className="num">{s.got}/{s.slots.length}</small></h2>
        <div className="album-grid">{s.slots.map(card)}</div>
      </section>
    ))}
    {a.archive.length > 0 && <section className="album-set">
      <h2>Archivio <small>carte di chi non è più ricercato</small></h2>
      <div className="album-grid">{a.archive.map(card)}</div>
    </section>}

    {open && <CardSheet d={d} slot={open} nick={nick} onClose={() => setOpen(null)} />}
  </>
}

function CardSheet({ d, slot, nick, onClose }) {
  const [sel, setSel] = useState(slot.best)
  const list = slot.eds[sel] || [], last = list[list.length - 1], first = Object.values(slot.eds).flat().sort((a, z) => a.created_at.localeCompare(z.created_at))[0]
  const tour = last && d.tourById[last.tournament_id]
  return (
    <Sheet onClose={onClose} label={`Carta di ${nick(slot.target)}`}>
      <BigCard d={d} target={slot.target} name={nick(slot.target)} rarity={sel} copies={list.length}
        info={`${slot.category ? catLabel(slot.category) + ' · ' : ''}${last ? when(last) : ''}`} />
      <h2 className="espa-title">Espansioni <small className="num">{slot.owned.length}/4</small></h2>
      <div className="espa" role="group" aria-label="Espansioni">
        {[...RARITIES].reverse().map(r => {
          const n = slot.eds[r]?.length || 0
          return (
            <button key={r} type="button" className={'espa-b r-' + r + (sel === r ? ' on' : '') + (n ? '' : ' off')} disabled={!n} aria-pressed={sel === r} onClick={() => setSel(r)}>
              <i aria-hidden="true" /><b>{RARITY_LABEL[r]}</b><small>{n ? (n > 1 ? `×${n}` : 'posseduta') : 'manca'}</small>
            </button>
          )
        })}
      </div>
      <dl className="espa-rows">
        <div><dt>Catture totali</dt><dd className="num">{slot.copies}</dd></div>
        {first && <div><dt>Prima cattura</dt><dd>{when(first)}</dd></div>}
        {tour && <div><dt>Ultima, in questa edizione</dt><dd>{tour.name}</dd></div>}
        {slot.now && <div><dt>Rarità di oggi</dt><dd className={'rar-txt r-' + slot.now}>{RARITY_LABEL[slot.now]}</dd></div>}
      </dl>
      <p className="sheet-note">Ogni cattura fissa la rarità di quel momento: nella stessa rarità sale il contatore, in un'altra si aggiunge un'espansione.</p>
      <div className="sheet-actions"><button type="button" className="ghost" onClick={onClose}>Chiudi</button></div>
    </Sheet>
  )
}
