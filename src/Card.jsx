import { useEffect, useRef, useState } from 'react'
import { phaseName } from './lib'
import { Avatar } from './Avatar'
import { Icon } from './icons'
import { stillMotion } from './Launcher'

const ORDER = ['winner', 'final', 'sf', 'qf', 'r16', 'r32', 'r64', 'r128', 'groups']
const TIER = [['legend', 'Leggendaria'], ['epic', 'Epica'], ['rare', 'Rara']]

// carta collezionabile del blader: riflessi olografici che seguono il dito o l'inclinazione del telefono, si gira per le statistiche
export function TradingCard({ name, pos, total, avatar, won, pend, lost, ranked, parts, lostPts, self, onAvatar }) {
  const el = useRef(null), raf = useRef(0), asked = useRef(false)
  const [back, setBack] = useState(false), [live, setLive] = useState(false)
  const [tier, label] = TIER[pos === 1 ? 0 : pos <= 3 ? 1 : 2]
  const best = ranked.map(e => e.phase).sort((a, z) => ORDER.indexOf(a) - ORDER.indexOf(z))[0]

  // aggiorna solo variabili CSS (niente nuovo render a ogni movimento)
  const set = (px, py) => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const s = el.current?.style
      if (!s) return
      s.setProperty('--ry', ((px - 0.5) * 26).toFixed(2) + 'deg')
      s.setProperty('--rx', ((0.5 - py) * 22).toFixed(2) + 'deg')
      s.setProperty('--fx', (px * 100).toFixed(1) + '%')
      s.setProperty('--fy', (py * 100).toFixed(1) + '%')
    })
  }
  const rest = () => { setLive(false); set(0.5, 0.5) }

  // inclinazione del telefono (Android subito; su iPhone dopo il permesso, chiesto al primo tocco su "Gira la carta")
  useEffect(() => {
    if (stillMotion() || !('DeviceOrientationEvent' in window)) return
    const on = e => {
      if (e.gamma == null) return
      setLive(true)
      const px = 0.5 + Math.max(-30, Math.min(30, e.gamma)) / 60
      const py = 0.5 + Math.max(-30, Math.min(30, e.beta - 45)) / 60
      set(px, py)
    }
    window.addEventListener('deviceorientation', on)
    return () => { window.removeEventListener('deviceorientation', on); cancelAnimationFrame(raf.current) }
  }, [])

  async function flip() {
    const D = window.DeviceOrientationEvent
    if (D && typeof D.requestPermission === 'function' && !asked.current) { asked.current = true; try { await D.requestPermission() } catch { /* rifiutato: resta il dito */ } }
    setBack(b => !b)
  }

  return <>
    <div className={'tcard-stage ' + tier + (live ? ' live' : '')} ref={el}
      onPointerMove={e => { if (e.pointerType === 'touch' && !e.isPrimary) return; const r = e.currentTarget.getBoundingClientRect(); setLive(true); set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height) }}
      onPointerLeave={rest}>
      <div className={'tcard' + (back ? ' back' : '')}>
        <div className="tcard-face front" aria-hidden={back}>
          <div className="tcard-in">
            <div className="tcard-top"><span>LAKE FOX</span><em>{label}</em></div>
            <div className="tcard-art">
              <svg viewBox="0 0 280 208" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="140" cy="104" r="88" /><circle cx="140" cy="104" r="56" /><circle cx="140" cy="104" r="20" /><path d="M62 26l156 156M218 26L62 182" /></svg>
              <Avatar className="tcard-av" url={avatar} name={name} />
              <span className="tcard-pos num">{pos}</span>
            </div>
            <div className="tcard-name"><b>{name}</b></div>
            <div className="tcard-stats">
              <span><b className="num">{total}</b><small>FOX POINT</small></span>
              <span><b className="num">{won}</b><small>TAGLIE</small></span>
              <span><b className="num">{ranked.length}</b><small>RANKED</small></span>
            </div>
            <span className="tcard-serial">STAGIONE {new Date().getFullYear()} · {String(pos).padStart(2, '0')}</span>
            <span className="tcard-foil" aria-hidden="true" />
            <span className="tcard-glare" aria-hidden="true" />
          </div>
        </div>
        <div className="tcard-face rear" aria-hidden={!back}>
          <div className="tcard-in">
            <b className="tcard-title">Scheda del blader</b>
            <dl className="tcard-rows">
              {parts.map(p => <div key={p[2]}><dt><i className={'split-' + p[2]} />{p[0]}</dt><dd className="num">{p[1]}</dd></div>)}
              {lostPts < 0 && <div><dt>Punti persi in taglie</dt><dd className="num minus">{lostPts}</dd></div>}
              <div><dt>Taglie riscosse{pend ? ` (+${pend} in attesa)` : ''}</dt><dd className="num">{won}</dd></div>
              <div><dt>Taglie subite</dt><dd className="num">{lost}</dd></div>
              <div><dt>Ranked giocate</dt><dd className="num">{ranked.length}</dd></div>
              <div><dt>Miglior piazzamento</dt><dd>{best ? phaseName(best).replace(/ \(.*\)/, '').replace(/[^\p{L}\p{N} ]/gu, '').trim() : '–'}</dd></div>
            </dl>
            <span className="tcard-serial">{name} · {pos}° Fox Point</span>
          </div>
        </div>
      </div>
    </div>
    <div className="tcard-actions">
      <button type="button" onClick={flip}><Icon.flip width="18" height="18" /> {back ? 'Fronte' : 'Gira la carta'}</button>
      {self && <label className="btn ghost">
        <Icon.camera width="18" height="18" /> Cambia foto
        <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAvatar(f) }} />
      </label>}
    </div>
  </>
}
