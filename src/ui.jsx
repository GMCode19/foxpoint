// Pannelli dal basso, domande di conferma e avvisi temporanei, nello stile dell'app
// (al posto di confirm / prompt / alert del browser, che su iPhone bloccano tutto e rompono l'atmosfera).
// Si usano da qualunque punto: ask({...}) restituisce una Promise, toast('testo', { undo }) mostra un avviso.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

let setAskState = null, pushToast = null

// title, text, ok (etichetta), danger (azione distruttiva), input: { placeholder } per chiedere un testo
// -> true / testo scritto se confermato, null se annullato
export function ask(opts) {
  return new Promise(resolve => {
    if (!setAskState) return resolve(window.confirm(opts.title) || null)
    setAskState({ ...opts, resolve })
  })
}

// kind: 'ok' | 'bad'; undo: funzione per il tasto "Annulla"; ms: durata
export function toast(text, opts = {}) {
  if (pushToast) pushToast({ text, ...opts, id: Math.random() })
}

export function Sheet({ onClose, label, children, wide }) {
  const ref = useRef(null), close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const prev = document.activeElement
    const key = e => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', key)
    document.body.style.overflow = 'hidden'
    ref.current?.focus({ preventScroll: true })
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus?.({ preventScroll: true }) }
  }, [])
  // nel <body>: un contenitore animato non deve mai spostare il pannello
  return createPortal(
    <div className="sheet-wrap">
      <button type="button" className="sheet-scrim" aria-label="Chiudi" onClick={onClose} />
      <div className={'sheet' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        <span className="sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </div>, document.body)
}

function AskSheet({ a, done }) {
  const [v, setV] = useState('')
  const close = () => done(null)
  return (
    <Sheet onClose={close} label={a.title}>
      <h2 className="sheet-title">{a.title}</h2>
      {a.text && <p className="sheet-text">{a.text}</p>}
      {a.input && <input autoFocus value={v} placeholder={a.input.placeholder} onChange={e => setV(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && done(v)} />}
      <div className="sheet-actions">
        <button type="button" className="ghost" onClick={close}>{a.cancel || 'Annulla'}</button>
        <button type="button" className={a.danger ? 'danger' : ''} onClick={() => done(a.input ? v : true)}>{a.ok || 'Conferma'}</button>
      </div>
    </Sheet>
  )
}

export function UIHost() {
  const [a, setA] = useState(null), [toasts, setToasts] = useState([])
  useEffect(() => {
    setAskState = setA
    pushToast = t => {
      setToasts(list => [...list.slice(-1), t])
      setTimeout(() => setToasts(list => list.filter(x => x.id !== t.id)), t.ms || (t.undo ? 5000 : 3200))
    }
    return () => { setAskState = null; pushToast = null }
  }, [])
  const done = v => { a.resolve(v); setA(null) }
  const drop = id => setToasts(list => list.filter(x => x.id !== id))
  return <>
    {a && <AskSheet a={a} done={done} />}
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={'toast ' + (t.kind || '')} role="status">
          <span>{t.text}</span>
          {t.undo && <button type="button" className="toast-undo" onClick={() => { drop(t.id); t.undo() }}>Annulla</button>}
        </div>
      ))}
    </div>
  </>
}
