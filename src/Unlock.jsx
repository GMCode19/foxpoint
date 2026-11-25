import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RARITY_LABEL, GROUPS } from './lib'
import { BigCard } from './Album'
import { stillMotion } from './Launcher'

// Animazione di sblocco: la carta coperta entra girando come una trottola lanciata, si ferma con un lampo
// nel colore della rarità, si gira e i riflessi le passano sopra. Una carta alla volta, con "Salta".
const STEPS = [['spin', 1250], ['hit', 350], ['flip', 700], ['reveal', 0]]

export function Unlock({ d, items, nick, onDone, onAlbum }) {
  const [i, setI] = useState(0), [phase, setPhase] = useState('spin')
  const timers = useRef([])
  const c = items[i], b = d.bountyById[c.bounty_id]
  useEffect(() => {
    timers.current.forEach(clearTimeout); timers.current = []
    if (stillMotion()) { setPhase('reveal'); return }
    setPhase('spin')
    let t = 0
    for (const [p, ms] of STEPS) { const at = t; timers.current.push(setTimeout(() => setPhase(p), at)); t += ms }
    return () => timers.current.forEach(clearTimeout)
  }, [i])
  const last = i === items.length - 1
  const cat = GROUPS.find(g => g[0] === (b?.category))?.[1]
  const info = [cat, new Date(c.played_on || c.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')

  return createPortal(
    <div className={'unlock r-' + c.card_rarity + ' ph-' + phase} role="dialog" aria-modal="true" aria-label="Carta sbloccata">
      {items.length > 1 && <button type="button" className="link unlock-skip" onClick={() => onDone(items)}>Salta tutte ({items.length})</button>}
      {(c.card_rarity === 'mitica' || c.card_rarity === 'leggendaria') && phase !== 'spin' && <div className="unlock-rays" aria-hidden="true" />}
      {phase === 'hit' && <div className="unlock-flash" aria-hidden="true" />}
      {phase === 'spin' && <svg className="unlock-trail" viewBox="0 0 320 320" fill="none" aria-hidden="true"><path d="M160 12a148 148 0 0 1 148 148" /><path d="M160 308a148 148 0 0 1-148-148" /></svg>}
      <div className="unlock-card">
        <div className={'unlock-flip' + (phase === 'flip' || phase === 'reveal' ? ' on' : '')}>
          <div className="unlock-back" aria-hidden={phase === 'reveal'}>
            <div className="unlock-back-in">
              <svg viewBox="0 0 220 220" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="110" cy="110" r="100" /><circle cx="110" cy="110" r="70" /><circle cx="110" cy="110" r="40" /><path d="M30 30l160 160M190 30L30 190" /></svg>
              <img src={import.meta.env.BASE_URL + 'logo.png'} alt="" />
              <span>FOX POINT</span>
            </div>
          </div>
          <div className="unlock-front">
            <BigCard d={d} target={c.target_id} name={nick(c.target_id)} rarity={c.card_rarity} info={info} sweep={phase === 'reveal'} />
          </div>
        </div>
      </div>
      {c.card_rarity === 'mitica' && phase === 'reveal' && <div className="unlock-stars" aria-hidden="true">{Array.from({ length: 8 }, (_, k) => <i key={k} />)}</div>}
      {phase === 'reveal' && <>
        <div className="unlock-title">
          <span>Carta sbloccata{items.length > 1 ? ` · ${i + 1} di ${items.length}` : ''}</span>
          <b>{RARITY_LABEL[c.card_rarity]}</b>
        </div>
        <div className="unlock-actions">
          {last ? <>
            <button type="button" className="ghost" onClick={() => onDone(items)}>Chiudi</button>
            <button type="button" onClick={() => { onDone(items); onAlbum() }}>Vai all'album</button>
          </> : <button type="button" onClick={() => setI(i + 1)}>Avanti</button>}
        </div>
      </>}
    </div>, document.body)
}
