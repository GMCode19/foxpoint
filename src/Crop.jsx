import { useEffect, useRef, useState } from 'react'

// Riquadro per scegliere l'inquadratura della foto prima del caricamento.
// Telefono: trascina con un dito, allarga/stringi con due dita. Computer: trascina con il mouse, rotellina per lo zoom.
// Quello che si vede nel riquadro è esattamente quello che comparirà sul manifesto (formato verticale 2:3).
// Si può rimpicciolire fino a vedere la foto intera (es. un manifesto verticale): lo spazio libero
// viene riempito con la foto stessa sfocata e scurita, uguale nell'anteprima e nella foto salvata.
export const RATIO = 1.5                  // altezza / larghezza del manifesto: 2:3
const OUT_W = 640, OUT_H = OUT_W * RATIO, MAX_ZOOM = 4

export function CropModal({ file, name, onCancel, onSave }) {
  const box = useRef(null), imgRef = useRef(null), pointers = useRef(new Map()), pinch = useRef(null)
  const [src, setSrc] = useState(null), [nat, setNat] = useState(null), [V, setV] = useState(300)
  // vista = zoom + spostamento in un unico stato: ogni passo del gesto si calcola sempre sui valori più recenti
  const [view, setView] = useState({ z: 1, x: 0, y: 0 }), viewRef = useRef(view)
  viewRef.current = view
  const { z } = view
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')

  useEffect(() => {
    const url = URL.createObjectURL(file); setSrc(url)
    document.body.style.overflow = 'hidden'
    const noGesture = e => e.preventDefault()             // Safari iOS: evita lo zoom della pagina durante il pizzico
    document.addEventListener('gesturestart', noGesture)
    return () => { URL.revokeObjectURL(url); document.body.style.overflow = ''; document.removeEventListener('gesturestart', noGesture) }
  }, [file])

  useEffect(() => {                                        // misura il riquadro (cambia con rotazione o dimensione finestra)
    const measure = () => box.current && setV(box.current.getBoundingClientRect().width)
    measure(); window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // geometria: riquadro largo V e alto H (2:3)
  const H = V * RATIO
  const base = nat ? Math.max(V / nat.w, H / nat.h) : 1                    // zoom 1 = la foto riempie il riquadro
  const minZ = nat ? Math.min(V / nat.w, H / nat.h) / base : 1             // zoom minimo = foto intera
  const w = nat ? nat.w * base * z : V, h = nat ? nat.h * base * z : H
  // la foto non può uscire dal riquadro; se è più piccola del riquadro su un lato resta centrata su quel lato
  const clamp = v => {
    const mx = Math.max(0, ((nat ? nat.w * base * v.z : V) - V) / 2), my = Math.max(0, ((nat ? nat.h * base * v.z : H) - H) / 2)
    return { z: v.z, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) }
  }
  const left = (V - w) / 2 + view.x, top = (H - h) / 2 + view.y

  function onLoad(e) {
    const i = e.currentTarget, n = { w: i.naturalWidth, h: i.naturalHeight }
    setNat(n)
    // partenza: foto centrata; se è più allungata del riquadro, spostata verso l'alto dove di solito c'è il viso
    const b = Math.max(V / n.w, H / n.h), my = (n.h * b - H) / 2
    setView({ z: 1, x: 0, y: my * 0.45 })
  }
  // zoom attorno al punto indicato (centro, dita o puntatore del mouse); target = valore o funzione dello zoom attuale
  function zoomTo(target, focus = { x: V / 2, y: H / 2 }) {
    const cx = focus.x - V / 2, cy = focus.y - H / 2
    setView(v => {
      const nz = Math.max(minZ, Math.min(MAX_ZOOM, typeof target === 'function' ? target(v.z) : target)), k = nz / v.z
      return clamp({ z: nz, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k })
    })
  }
  const local = e => { const r = box.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  function down(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, local(e))
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: viewRef.current.z }
    }
  }
  function move(e) {
    const prev = pointers.current.get(e.pointerId); if (!prev) return
    const cur = local(e); pointers.current.set(e.pointerId, cur)
    if (pointers.current.size === 1) setView(v => clamp({ z: v.z, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }))
    else if (pinch.current) {
      const [a, b] = [...pointers.current.values()]
      zoomTo(pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    }
  }
  function up(e) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }
  function wheel(e) { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015); zoomTo(cz => cz * f, local(e)) }
  useEffect(() => {                                        // la rotellina deve poter bloccare lo scorrimento della pagina
    const el = box.current; el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })

  async function save() {
    setBusy(true); setError('')
    try {
      const img = imgRef.current, sc = OUT_W / V
      const c = document.createElement('canvas'); c.width = OUT_W; c.height = OUT_H
      const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
      if (w < V - 0.5 || h < H - 0.5) {
        // sfondo: la foto ridotta a 24x36 px e riallargata (sfocatura che funziona su tutti i browser, Safari compreso)
        const t = document.createElement('canvas'); t.width = 24; t.height = 24 * RATIO
        const sw = Math.min(nat.w, nat.h / RATIO), sh = sw * RATIO   // ritaglio centrale in 2:3
        t.getContext('2d').drawImage(img, (nat.w - sw) / 2, (nat.h - sh) / 2, sw, sh, 0, 0, t.width, t.height)
        g.drawImage(t, -OUT_W * 0.08, -OUT_H * 0.08, OUT_W * 1.16, OUT_H * 1.16)
        g.fillStyle = 'rgba(11, 8, 16, 0.45)'; g.fillRect(0, 0, OUT_W, OUT_H)
      }
      g.drawImage(img, left * sc, top * sc, w * sc, h * sc)
      const toBlob = type => new Promise(r => c.toBlob(r, type, 0.85))
      let blob = await toBlob('image/webp')
      if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg')   // Safari meno recenti
      await onSave({ blob, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' })
    } catch (e) { setError(e?.message || String(e)); setBusy(false) }
  }

  return (
    <div className="crop-modal" role="dialog" aria-modal="true" aria-label={`Foto di ${name}`}>
      <div className="crop-card">
        <h2>Foto di {name}</h2>
        <p className="mut note">Trascina per spostare, due dita per lo zoom.</p>
        <div className="crop-box" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          {src && nat && z < 1 && <img className="crop-bg" src={src} alt="" draggable={false} />}
          {src && <img ref={imgRef} src={src} alt="" draggable={false} onLoad={onLoad}
            onError={() => setError('Formato immagine non supportato: prova con una foto JPG o PNG')}
            style={{ width: w, height: h, transform: `translate(${left}px, ${top}px)`, opacity: nat ? 1 : 0 }} />}
          <span className="crop-grid" aria-hidden="true" />
        </div>
        <label className="crop-zoom">
          <span>➖</span>
          <input type="range" min={minZ} max={MAX_ZOOM} step="0.01" value={z} onChange={e => zoomTo(+e.target.value)} aria-label="Zoom" />
          <span>➕</span>
        </label>
        {minZ < 0.98 && <div className="crop-fit">
          <button type="button" className={'ghost' + (z <= minZ + 0.001 ? ' on' : '')} onClick={() => zoomTo(minZ)}>Foto intera</button>
          <button type="button" className={'ghost' + (Math.abs(z - 1) < 0.001 ? ' on' : '')} onClick={() => zoomTo(1)}>Riempi</button>
        </div>}
        <label className="chk crop-consent">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          {name} mi ha dato il consenso a mettere questa foto nell'app del team (se è minorenne, un suo genitore).
        </label>
        {error && <p className="notice bad">{error}</p>}
        <div className="crop-actions">
          <button className="ghost" onClick={onCancel} disabled={busy}>Annulla</button>
          <button onClick={save} disabled={!nat || !consent || busy}>{busy ? 'Salvataggio…' : 'Salva foto'}</button>
        </div>
      </div>
    </div>
  )
}
