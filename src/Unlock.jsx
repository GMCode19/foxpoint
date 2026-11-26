import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from 'gsap'
import { RARITIES, RARITY_LABEL, GROUPS } from './lib'
import { BigCard, CardArt } from './Album'
import { stillMotion } from './Launcher'
import { createParticles } from './particles'
import { sfxTear, sfxWhoosh, sfxCharge, sfxReveal, buzz, soundOn, setSound } from './sfx'

// Apertura della bustina Lake Fox (caricata solo quando c'è una carta da sbloccare).
//  pack     bustina con la luce della carta più rara che filtra dallo strappo; si strappa col dito (o tocco / "Apri")
//  opening  il lembo vola via, la bustina scende, le carte salgono coperte
//  deck     carta coperta in cima al mazzetto: un tocco per girarla
//  charge   solo leggendarie e mitiche: tensione (la carta trema, la luce cresce; per le mitiche lo schermo si oscura e si crepa)
//  flip     la carta si gira con lampo, particelle e suono della sua rarità
//  shown    la carta resta in mano (olografia col dito o inclinando); scorri o "Prossima" per la successiva
//  summary  riepilogo di tutte le carte della bustina (solo se più di una)
const COLORS = {
  rara: ['#FFFFFF', '#DCD9E6', '#A9A5B4'], epica: ['#C9A8FF', '#8E5BEA', '#8EF0FF'],
  leggendaria: ['#FFE29A', '#F2C14E', '#FFF6D8'], mitica: ['#FF8AD8', '#8EF0FF', '#FFE68A', '#B38CFF', '#FFFFFF'],
}
const rank = r => RARITIES.indexOf(r)
const fmt = c => new Date(c.played_on || c.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

export function Unlock({ d, items: incoming, nick, onDone, onAlbum }) {
  // elenco fissato all'apertura, dalla meno rara alla più rara: il momento migliore arriva per ultimo
  const [items] = useState(() => [...incoming].sort((a, z) => rank(a.card_rarity) - rank(z.card_rarity) || a.created_at.localeCompare(z.created_at)))
  const still = useRef(stillMotion()).current
  const [phase, setPhase] = useState(still ? 'summary' : 'pack')
  const [idx, setIdx] = useState(0), [cut, setCut] = useState(0), [hint, setHint] = useState(false), [sound, setSnd] = useState(soundOn)
  const root = useRef(null), canvas = useRef(null), fx = useRef(null), strip = useRef(null), body = useRef(null), pack = useRef(null)
  const deck = useRef(null), flash = useRef(null), dark = useRef(null), cracks = useRef(null), stamp = useRef(null), drag = useRef(null), swipe = useRef(null)
  const tl = useRef([])
  const top = items.reduce((m, c) => (rank(c.card_rarity) > rank(m) ? c.card_rarity : m), 'rara')
  const c = items[idx], r = c?.card_rarity
  const run = t => { tl.current.push(t); return t }

  // particelle e pulizia
  useEffect(() => {
    if (still || !canvas.current) return
    fx.current = createParticles(canvas.current)
    return () => { fx.current?.destroy(); tl.current.forEach(t => t.kill()) }
  }, [still])
  // entrata della bustina e suggerimento dopo qualche secondo senza strappo
  useLayoutEffect(() => {
    if (phase !== 'pack' || !pack.current) return
    run(gsap.fromTo(pack.current, { y: '55vh', rotation: -12, scale: 0.7, opacity: 0 }, { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.5)' }))
    const t = setTimeout(() => setHint(true), 3500)
    return () => clearTimeout(t)
  }, [phase === 'pack'])

  const center = el => {
    const a = el.getBoundingClientRect(), b = root.current.getBoundingClientRect()
    return [a.left - b.left + a.width / 2, a.top - b.top + a.height / 2]
  }
  const askMotion = () => {   // iPhone: il permesso per i riflessi con l'inclinazione si può chiedere solo durante un tocco
    const D = window.DeviceOrientationEvent
    if (D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {})
  }

  // ---- strappo
  function open() {
    if (phase !== 'pack') return
    drag.current = null; setCut(1); setHint(false); askMotion()
    sfxTear(); buzz(30); setPhase('opening')
    const [x, y] = center(strip.current)
    fx.current?.burst(x, y, { n: 26 + rank(top) * 10, colors: COLORS[top], speed: [180, 460], grav: 700 })
    run(gsap.timeline({ onComplete: () => setPhase('deck') })
      .to(strip.current, { x: -260, y: -230, rotation: -75, opacity: 0, duration: 0.6, ease: 'power2.in' }, 0)
      .to(body.current, { y: '75vh', rotation: 5, opacity: 0, duration: 0.75, ease: 'power2.in' }, 0.2)
      .add(() => sfxWhoosh(true), 0.35))
  }
  const tearProps = {
    onPointerDown: e => { if (phase !== 'pack') return; const b = e.currentTarget.getBoundingClientRect(); drag.current = { x: e.clientX, w: b.width, left: b.left, moved: false }; setHint(false); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* vecchi browser */ } },
    onPointerMove: e => {
      const g = drag.current; if (!g) return
      const p = Math.max(0, Math.min(1, Math.abs(e.clientX - g.x) / (g.w * 0.75)))
      if (p > 0.04) g.moved = true
      setCut(p); gsap.set(strip.current, { rotation: -p * 9, y: -p * 6, transformOrigin: g.x - g.left < g.w / 2 ? '100% 100%' : '0% 100%' })
      if (Math.random() < 0.5) { const b = root.current.getBoundingClientRect(), s = strip.current.getBoundingClientRect(); fx.current?.burst(e.clientX - b.left, s.bottom - b.top, { n: 3, colors: COLORS[top], speed: [60, 180], life: [0.3, 0.6], grav: 500 }) }
      if (p >= 1) open()
    },
    onPointerUp: () => { const g = drag.current; if (!g) return; drag.current = null; if (!g.moved || cut >= 0.6) open(); else { setCut(0); gsap.to(strip.current, { rotation: 0, y: 0, duration: 0.3, ease: 'back.out(2)' }) } },
    onPointerCancel: () => { drag.current = null; setCut(0); gsap.set(strip.current, { rotation: 0, y: 0 }) },
  }

  // ---- le carte salgono dal fondo
  useLayoutEffect(() => {
    if (phase !== 'deck' || !deck.current) return
    const cards = deck.current.querySelectorAll('.po-card')
    if (idx === 0) run(gsap.fromTo(cards, { y: '30vh', scale: 0.6, opacity: 0 }, { y: (k) => -k * 4, scale: 1, opacity: 1, duration: 0.6, stagger: 0.05, ease: 'back.out(1.3)' }))
  }, [phase === 'deck' && idx === 0])

  // ---- rivelazione
  function reveal() {
    if (phase !== 'deck') return
    const card = deck.current.querySelector('.po-card.current')
    const big = r === 'leggendaria' || r === 'mitica'
    if (!big) return flip(card)
    setPhase('charge'); sfxCharge(r === 'mitica' ? 1.1 : 0.75); buzz(r === 'mitica' ? [40, 60, 40, 60, 40] : [30, 50, 30])
    const t = gsap.timeline({ onComplete: () => flip(card) })
    t.to(card, { keyframes: [{ x: -3, rotation: -1 }, { x: 4, rotation: 1.5 }, { x: -6, rotation: -2 }, { x: 7, rotation: 2.5 }, { x: -9, rotation: -3 }, { x: 0, rotation: 0, scale: 1.08 }], duration: r === 'mitica' ? 1.1 : 0.75, ease: 'none' }, 0)
    if (r === 'mitica') {
      t.to(dark.current, { opacity: 0.94, duration: 0.5 }, 0)
      t.fromTo(cracks.current.querySelectorAll('path'), { strokeDashoffset: 120, opacity: 1 }, { strokeDashoffset: 0, duration: 0.8, stagger: 0.08, ease: 'power1.in' }, 0.25)
    }
    run(t)
  }
  function flip(card) {
    setPhase('flip')
    const inner = card.querySelector('.po-flip'), [x, y] = center(card)
    const t = gsap.timeline()
    t.add(() => setPhase('shown'), r === 'mitica' ? 1.1 : 0.7)   // tasti e olografia subito dopo il giro, senza aspettare la fine degli effetti
    t.to(inner, { rotationY: 180, duration: 0.55, ease: 'back.out(1.3)' }, 0)
    t.add(() => {
      sfxReveal(r); buzz(r === 'mitica' ? 120 : r === 'leggendaria' ? 70 : 25)
      const n = { rara: 18, epica: 44, leggendaria: 70, mitica: 110 }[r]
      fx.current?.burst(x, y, { n, colors: COLORS[r], speed: r === 'mitica' ? [260, 720] : [200, 520], size: [1.5, 3.5], grav: 500 })
      if (r === 'leggendaria') fx.current?.rain({ n: 55, colors: COLORS.leggendaria })
      if (r === 'mitica') { fx.current?.rain({ n: 70, colors: COLORS.mitica }); fx.current?.burst(x, y, { n: 30, colors: COLORS.mitica, shape: 'star', speed: [120, 380], size: [4, 8], grav: 200, life: [1, 1.8] }) }
    }, 0.22)
    t.fromTo(flash.current, { opacity: 0 }, { opacity: r === 'mitica' ? 1 : r === 'leggendaria' ? 0.75 : 0.45, duration: 0.08, yoyo: true, repeat: 1 }, 0.2)
    if (r === 'mitica') {
      t.to(dark.current, { opacity: 0, duration: 0.6 }, 0.3)
      t.to(cracks.current.querySelectorAll('path'), { opacity: 0, duration: 0.3 }, 0.25)
      t.fromTo(card, { scale: 1.3 }, { scale: 1, duration: 1.1, ease: 'expo.out' }, 0.2)
      t.fromTo(stamp.current, { scale: 2.6, opacity: 0, rotation: -12 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, 0.65)
      t.to(stamp.current, { opacity: 0, scale: 1.1, duration: 0.45 }, 2.2)
    } else t.to(card, { scale: 1, duration: 0.4 }, 0.2)
    run(t)
  }

  // ---- carta successiva / fine
  function next() {
    if (phase !== 'shown') return
    const card = deck.current?.querySelector('.po-card.current')
    if (idx === items.length - 1) { if (items.length > 1) { sfxWhoosh(false); setPhase('summary') } return }
    sfxWhoosh(false)
    run(gsap.to(card, { x: '-120vw', rotation: -22, duration: 0.42, ease: 'power2.in', onComplete: () => { setIdx(i => i + 1); setPhase('deck') } }))
  }
  const swipeProps = {
    onPointerDown: e => { swipe.current = e.clientX; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* vecchi browser */ } },
    onPointerUp: e => { const s = swipe.current; swipe.current = null; if (s != null && Math.abs(e.clientX - s) > 70) next() },
    onPointerCancel: () => { swipe.current = null },
  }
  const finish = album => { tl.current.forEach(t => t.kill()); onDone(items); if (album) onAlbum() }

  // etichetta: nuova, nuova espansione o doppione
  const label = cl => {
    const prev = (d.album || []).filter(x => x.hunter_id === cl.hunter_id && x.target_id === cl.target_id && x.status === 'approved' && x.id !== cl.id && x.created_at < cl.created_at)
    if (!prev.length) return 'Nuova'
    const same = prev.filter(x => x.card_rarity === cl.card_rarity).length
    return same ? `×${same + 1}` : 'Nuova espansione'
  }
  const cat = cl => GROUPS.find(g => g[0] === d.bountyById[cl.bounty_id]?.category)?.[1] || ''
  const stats = cl => [['CATTURATA', fmt(cl)], ['TORNEO', d.tourById[cl.tournament_id]?.name || '–']]
  const toggleSound = () => { setSound(!sound); setSnd(!sound) }
  const last = idx === items.length - 1

  return createPortal(
    <div ref={root} className={`po is-${phase} pr-${phase === 'pack' || phase === 'opening' ? top : r || top}`} role="dialog" aria-modal="true" aria-label="Apertura bustina">
      <div className="po-bg" aria-hidden="true" />
      {(phase === 'shown' || phase === 'flip') && (r === 'leggendaria' || r === 'mitica') && <div className="po-rays" aria-hidden="true" />}
      <div ref={dark} className="po-dark" aria-hidden="true" />
      <canvas ref={canvas} className="po-fx" aria-hidden="true" />

      <div className="po-top">
        {!still && <button type="button" className="po-icon" onClick={toggleSound} aria-label={sound ? 'Spegni i suoni' : 'Accendi i suoni'} aria-pressed={sound}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" />{sound ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}</svg>
        </button>}
        {items.length > 1 && phase !== 'summary' && <span className="po-count">{phase === 'pack' || phase === 'opening' ? `${items.length} carte` : `${idx + 1} di ${items.length}`}</span>}
        {phase !== 'summary' && <button type="button" className="link po-skip" onClick={() => (items.length > 1 ? setPhase('summary') : finish(false))}>{items.length > 1 ? 'Mostra tutte' : 'Salta'}</button>}
      </div>

      {/* bustina */}
      {(phase === 'pack' || phase === 'opening') && (
        <div ref={pack} className="po-pack">
          <div ref={strip} className="po-strip" style={{ '--cut': cut }} {...tearProps}>
            <span className="po-guide" aria-hidden="true" />
            <span className="po-seam" aria-hidden="true"><i style={{ width: `${cut * 100}%` }} /></span>
          </div>
          <div ref={body} className="po-body">
            <span className="po-foil" aria-hidden="true" />
            <svg className="po-stadium" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="100" cy="100" r="90" /><circle cx="100" cy="100" r="60" /><circle cx="100" cy="100" r="30" /><path d="M28 28l144 144M172 28L28 172" /></svg>
            <img src={import.meta.env.BASE_URL + 'logo.png'} alt="" draggable={false} />
            <b>FOX POINT</b>
            <small>BUSTINA TAGLIE · {items.length} {items.length === 1 ? 'CARTA' : 'CARTE'}</small>
          </div>
        </div>
      )}

      {/* mazzetto */}
      {['deck', 'charge', 'flip', 'shown'].includes(phase) && (
        <div ref={deck} className="po-deck">
          {items.map((cl, k) => k < idx ? null : (
            <div key={cl.id} className={'po-card r-' + cl.card_rarity + (k === idx ? ' current' : '')} style={{ zIndex: items.length - k }}
              onClick={k === idx && phase === 'deck' ? reveal : undefined} {...(k === idx && phase === 'shown' ? swipeProps : {})}>
              <span className="po-glow" aria-hidden="true" />
              <div className="po-flip">
                <div className="po-back">
                  <div className="po-back-in">
                    <svg viewBox="0 0 220 220" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="110" cy="110" r="100" /><circle cx="110" cy="110" r="70" /><circle cx="110" cy="110" r="40" /><path d="M30 30l160 160M190 30L30 190" /></svg>
                    <img src={import.meta.env.BASE_URL + 'logo.png'} alt="" draggable={false} />
                    <span>FOX POINT</span>
                  </div>
                </div>
                {/* fronte preparato già mentre la carta è coperta: al giro il telefono non deve costruirlo da zero */}
                {k === idx && <div className={'po-front' + (phase === 'flip' || phase === 'shown' ? ' on' : '')} aria-hidden={!(phase === 'flip' || phase === 'shown')}>
                  <BigCard d={d} target={cl.target_id} name={nick(cl.target_id)} rarity={cl.card_rarity} info={cat(cl)} stats={stats(cl)} tilt={phase === 'shown'} sweep={phase === 'shown'} />
                </div>}
              </div>
            </div>
          ))}
          <svg ref={cracks} className="po-cracks" viewBox="0 0 100 130" fill="none" aria-hidden="true">
            <path d="M50 65L18 20M50 65L80 12M50 65L92 70M50 65L70 122M50 65L12 98M50 65L40 2" pathLength="120" strokeDasharray="120" strokeDashoffset="120" />
          </svg>
        </div>
      )}
      <div ref={stamp} className="po-stamp" aria-hidden="true">MITICA</div>
      <div ref={flash} className="po-flash" aria-hidden="true" />

      {/* testi e tasti */}
      {phase === 'pack' && <div className="po-hint">
        <span>Strappa la bustina</span>
        <small className={hint ? 'on' : ''}>Fai scorrere il dito lungo il bordo in alto, oppure tocca</small>
        <button type="button" className="link" onClick={open}>Apri</button>
      </div>}
      {phase === 'deck' && <div className="po-hint"><span className="pulse">Tocca la carta per girarla</span></div>}
      {phase === 'shown' && <div className="po-result" role="status">
        <span className="po-badge">{label(c)}</span>
        <b>{RARITY_LABEL[r]}</b>
        <div className="po-actions">
          {!last ? <button type="button" onClick={next}>Prossima carta</button>
            : items.length > 1 ? <button type="button" onClick={next}>Riepilogo</button>
            : <><button type="button" className="ghost" onClick={() => finish(false)}>Chiudi</button><button type="button" onClick={() => finish(true)}>Vai all'album</button></>}
        </div>
      </div>}

      {phase === 'summary' && <div className="po-summary">
        <h2>{items.length === 1 ? 'Carta sbloccata' : `${items.length} carte sbloccate`}</h2>
        {items.length === 1
          ? <BigCard d={d} target={c.target_id} name={nick(c.target_id)} rarity={c.card_rarity} info={cat(c)} stats={stats(c)} />
          : <div className="po-grid">
              {items.map(cl => (
                <div key={cl.id} className="po-cell">
                <span className="po-tag">{label(cl)}</span>
                <div className={'acard mini r-' + cl.card_rarity} role="img" aria-label={`${nick(cl.target_id)}, ${RARITY_LABEL[cl.card_rarity]}, ${label(cl)}`}>
                  <span className="acard-in">
                    <CardArt d={d} target={cl.target_id} name={nick(cl.target_id)} />
                    <span className="acard-mname">{nick(cl.target_id)}</span>
                    <span className="acard-mrar">{RARITY_LABEL[cl.card_rarity]}</span>
                    <span className="acard-holo" aria-hidden="true" />
                  </span>
                </div>
                </div>
              ))}
            </div>}
        <div className="po-actions">
          <button type="button" className="ghost" onClick={() => finish(false)}>Chiudi</button>
          <button type="button" onClick={() => finish(true)}>Vai all'album</button>
        </div>
      </div>}
    </div>, document.body)
}
