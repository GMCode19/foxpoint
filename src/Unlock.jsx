import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RARITY_LABEL, GROUPS } from './lib'
import { BigCard } from './Album'
import { stillMotion } from './Launcher'

// Apertura della bustina Lake Fox:
//  pack   la bustina trema; dalla linea di strappo esce una luce nel colore della rarità (primo indizio)
//  tear   strappo (dito lungo il bordo, oppure un tocco): il bordo vola via, scintille
//  rise   la carta coperta esce dalla bustina e si mette al centro
//  ready  la carta coperta fluttua e pulsa: "tocca per girarla"
//  build  solo mitiche: lo schermo si oscura e la carta trema (suspense)
//  flip   la carta si gira
//  reveal effetto della rarità (riflesso, onda, raggi d'oro, esplosione arcobaleno), titolo e tasti
const T = { tear: 650, rise: 750, build: 900, flip: 650 }
const buzz = p => { try { navigator.vibrate?.(p) } catch { /* non supportato */ } }

export function Unlock({ d, items: incoming, nick, onDone, onAlbum }) {
  // elenco fissato all'apertura: se nel frattempo una taglia viene revocata o ne arriva una nuova, la sequenza non si rompe
  const [items] = useState(() => incoming)
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState(() => (stillMotion() ? 'reveal' : 'pack'))
  const [cut, setCut] = useState(0)                      // avanzamento dello strappo, 0–1
  const drag = useRef(null), timers = useRef([])
  const c = items[i], b = d.bountyById[c.bounty_id], r = c.card_rarity
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms))
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => { timers.current.forEach(clearTimeout); timers.current = []; setCut(0); setPhase(stillMotion() ? 'reveal' : 'pack') }, [i])

  function open() {
    if (phase !== 'pack') return
    drag.current = null
    buzz(25); setCut(1); setPhase('tear')
    later(T.tear, () => setPhase('rise'))
    later(T.tear + T.rise, () => setPhase('ready'))
  }
  function flip() {
    if (phase !== 'ready') return
    if (r === 'mitica') { buzz([30, 60, 30]); setPhase('build'); later(T.build, () => { buzz(80); setPhase('flip') }); later(T.build + T.flip, () => setPhase('reveal')) }
    else { buzz(r === 'leggendaria' ? 60 : 30); setPhase('flip'); later(T.flip, () => setPhase('reveal')) }
  }
  // strappo col dito lungo il bordo alto: oltre il 65% si apre; un tocco senza trascinare apre lo stesso
  const tearProps = {
    onPointerDown: e => { if (phase !== 'pack') return; drag.current = { x: e.clientX, w: e.currentTarget.getBoundingClientRect().width, moved: false }; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* vecchi browser */ } },
    onPointerMove: e => { const g = drag.current; if (!g) return; const p = Math.max(0, Math.min(1, Math.abs(e.clientX - g.x) / (g.w * 0.8))); if (p > 0.04) g.moved = true; setCut(p); if (p >= 1) open() },
    onPointerUp: () => { const g = drag.current; if (!g) return; drag.current = null; if (!g.moved || cut >= 0.65) open(); else setCut(0) },
    onPointerCancel: () => { drag.current = null; setCut(0) },
  }

  const last = i === items.length - 1
  const cat = GROUPS.find(g => g[0] === b?.category)?.[1]
  const date = new Date(c.played_on || c.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  const tour = d.tourById[c.tournament_id]
  const cardOut = ['rise', 'ready', 'build', 'flip', 'reveal'].includes(phase)
  const faceUp = phase === 'flip' || phase === 'reveal'

  return createPortal(
    <div className={'unlock r-' + r + ' ph-' + phase} role="dialog" aria-modal="true" aria-label="Apertura bustina">
      <button type="button" className="link unlock-skip" onClick={() => onDone(items)}>{items.length > 1 ? `Salta tutte (${items.length})` : 'Salta'}</button>
      {items.length > 1 && <span className="unlock-count">{i + 1} di {items.length}</span>}

      {/* effetti di sfondo */}
      {phase === 'reveal' && (r === 'leggendaria' || r === 'mitica') && <div className="unlock-rays" aria-hidden="true" />}
      {phase === 'reveal' && <div className="unlock-wave" aria-hidden="true" />}
      {(phase === 'tear' || phase === 'reveal') && <div className="unlock-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, k) => <i key={k} style={{ '--a': `${k * 360 / 14 + (k % 2) * 9}deg`, '--d': `${90 + (k * 37) % 70}px` }} />)}</div>}
      {phase === 'reveal' && r === 'leggendaria' && <div className="unlock-rain" aria-hidden="true">{Array.from({ length: 18 }, (_, k) => <i key={k} style={{ left: `${(k * 53) % 100}%`, animationDelay: `${(k * 0.17) % 1.6}s` }} />)}</div>}
      {phase === 'reveal' && r === 'mitica' && <div className="unlock-stars" aria-hidden="true">{Array.from({ length: 8 }, (_, k) => <i key={k} />)}</div>}

      {/* bustina */}
      {(phase === 'pack' || phase === 'tear' || phase === 'rise') && (
        <div className="pack" aria-hidden={phase !== 'pack'}>
          <div className="pack-strip" style={{ '--cut': cut }} {...tearProps}>
            <span className="pack-crimp" aria-hidden="true" />
            <span className="pack-tearline" aria-hidden="true"><i style={{ width: `${cut * 100}%` }} /></span>
          </div>
          <div className="pack-body">
            <svg className="pack-stadium" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="100" cy="100" r="90" /><circle cx="100" cy="100" r="60" /><circle cx="100" cy="100" r="30" /><path d="M28 28l144 144M172 28L28 172" /></svg>
            <img src={import.meta.env.BASE_URL + 'logo.png'} alt="" />
            <b>FOX POINT</b>
            <small>BUSTINA TAGLIE · 1 CARTA</small>
            <span className="pack-crimp bottom" aria-hidden="true" />
          </div>
        </div>
      )}

      {/* carta */}
      {cardOut && (
        <div className="unlock-card" onClick={flip} role={phase === 'ready' ? 'button' : undefined} tabIndex={phase === 'ready' ? 0 : -1}
          aria-label={phase === 'ready' ? 'Gira la carta' : undefined} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip() } }}>
          <span className="unlock-glow" aria-hidden="true" />
          <div className={'unlock-flip' + (faceUp ? ' on' : '')}>
            <div className="unlock-back" aria-hidden={faceUp}>
              <div className="unlock-back-in">
                <svg viewBox="0 0 220 220" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="110" cy="110" r="100" /><circle cx="110" cy="110" r="70" /><circle cx="110" cy="110" r="40" /><path d="M30 30l160 160M190 30L30 190" /></svg>
                <img src={import.meta.env.BASE_URL + 'logo.png'} alt="" />
                <span>FOX POINT</span>
              </div>
            </div>
            {faceUp && <div className="unlock-front">
              <BigCard d={d} target={c.target_id} name={nick(c.target_id)} rarity={r} info={cat || ''} sweep={phase === 'reveal'} tilt={phase === 'reveal'}
                stats={[['CATTURATA', date], ['TORNEO', tour?.name || '–']]} />
            </div>}
          </div>
        </div>
      )}
      {phase === 'reveal' && r === 'mitica' && <div className="unlock-stamp" aria-hidden="true">MITICA</div>}

      {/* testi e tasti */}
      {phase === 'pack' && <div className="unlock-hint">
        <span>Strappa la bustina</span>
        <small>Fai scorrere il dito lungo il bordo in alto, oppure toccala</small>
        <button type="button" className="link" onClick={open}>Apri</button>
      </div>}
      {phase === 'ready' && <div className="unlock-hint"><span>Tocca la carta per girarla</span></div>}
      {phase === 'reveal' && <>
        <div className="unlock-title">
          <span>Carta sbloccata</span>
          <b>{RARITY_LABEL[r]}</b>
        </div>
        <div className="unlock-actions">
          {last ? <>
            <button type="button" className="ghost" onClick={() => onDone(items)}>Chiudi</button>
            <button type="button" onClick={() => { onDone(items); onAlbum() }}>Vai all'album</button>
          </> : <button type="button" onClick={() => setI(i + 1)}>Prossima bustina</button>}
        </div>
      </>}
    </div>, document.body)
}
