import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export const stillMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

// launcher da tirare (come il ripcord di un lanciatore): oltre l'80% della corsa parte la dichiarazione
export function Launcher({ name, disabled, onLaunch }) {
  const track = useRef(null), drag = useRef(null)
  const [pull, setPull] = useState(0), [held, setHeld] = useState(false)
  const max = () => Math.max(60, (track.current?.clientWidth || 300) - 64 - 8 - 18)
  const ready = pull >= max() * 0.8

  function down(e) {
    if (disabled) return
    drag.current = { x: e.clientX - pull, id: e.pointerId }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* vecchi browser */ }
    setHeld(true)
  }
  function move(e) {
    if (!drag.current) return
    setPull(Math.max(0, Math.min(max(), e.clientX - drag.current.x)))
  }
  function up() {
    if (!drag.current) return
    drag.current = null
    setHeld(false)
    if (pull >= max() * 0.8) { navigator.vibrate?.(30); onLaunch() }
    setPull(0)
  }

  return (
    <div className={'launcher' + (disabled ? ' off' : '') + (held ? ' held' : '')}>
      <span className="launcher-label">Tira il launcher per dichiarare la vittoria</span>
      <div className="launcher-track" ref={track}>
        <span className="launcher-fill" style={{ width: pull + 64 }} aria-hidden="true" />
        <span className="launcher-teeth" aria-hidden="true" />
        <span className={'launcher-go' + (ready ? ' on' : '')} aria-hidden="true">GO SHOOT</span>
        <button type="button" className="launcher-grip" disabled={disabled}
          aria-label={`Dichiara la vittoria su ${name}`}
          style={{ transform: `translateX(${pull}px)` }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onClick={e => { if (e.detail === 0) onLaunch() /* da tastiera */ }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6v12M8 4v16M8 12h12M16 8l4 4-4 4" /></svg>
        </button>
      </div>
      <button type="button" className="link launcher-alt" disabled={disabled} onClick={onLaunch}>Preferisci un tasto? Tocca qui</button>
    </div>
  )
}

// "3, 2, 1… GO SHOOT!" a tutto schermo
export function Countdown({ name }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = [1, 2, 3].map(n => setTimeout(() => setStep(n), n * 620))
    return () => t.forEach(clearTimeout)
  }, [])
  const word = ['3', '2', '1', 'GO SHOOT!'][step]
  return createPortal(
    <div className="countdown" role="status" aria-live="assertive">
      <svg className="countdown-ring" width="260" height="260" viewBox="0 0 260 260" fill="none" aria-hidden="true"><circle cx="130" cy="130" r="118" stroke="#8E5BEA" strokeWidth="3" strokeDasharray="14 12" /><circle cx="130" cy="130" r="92" stroke="#3A3647" strokeWidth="2" /></svg>
      <span key={step} className={'countdown-n' + (step === 3 ? ' go' : '')}>{word}</span>
      <span className="countdown-sub">Vittoria su {name}</span>
    </div>, document.body)
}
