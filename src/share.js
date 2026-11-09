// Immagine per le storie (1080x1920): manifesto con il timbro RISCOSSA, valore della taglia e logo del team.
// Si condivide con il menu di sistema del telefono (Instagram, WhatsApp…); dove non c'è, si scarica.
import { LOGO } from './lib'

// Safari meno recenti: niente angoli arrotondati, rettangolo semplice
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect)
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h) }

const img = (src, cors) => new Promise((ok, ko) => {
  const i = new Image()
  if (cors) i.crossOrigin = 'anonymous'
  i.onload = () => ok(i); i.onerror = ko; i.src = src
})

async function draw({ photo, name, value, hunter, team }, withPhoto) {
  const W = 1080, H = 1920, c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  const bg = g.createRadialGradient(W / 2, 260, 40, W / 2, 400, 1300)
  bg.addColorStop(0, '#3a1d70'); bg.addColorStop(1, '#0b0810')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  try { await document.fonts.load('800 120px "Barlow Condensed"') } catch { /* carattere di riserva */ }
  const F = (w, s) => `${w} ${s}px "Barlow Condensed", Impact, "Arial Black", sans-serif`

  try { const l = await img(LOGO); const h = 150, w = l.width * h / l.height; g.globalCompositeOperation = 'lighten'; g.drawImage(l, (W - w) / 2, 110, w, h); g.globalCompositeOperation = 'source-over' } catch { /* senza logo */ }
  g.textAlign = 'center'; g.fillStyle = '#b99be8'; g.font = F(700, 54)
  g.fillText('TAGLIA RISCOSSA', W / 2, 340)

  // manifesto 2:3
  const pw = 640, ph = 960, px = (W - pw) / 2, py = 400
  g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 60
  g.fillStyle = '#1a1029'; g.beginPath(); g.roundRect(px - 16, py - 16, pw + 32, ph + 32, 34); g.fill(); g.restore()
  g.save(); g.beginPath(); g.roundRect(px, py, pw, ph, 22); g.clip()
  let drawn = false
  if (withPhoto && photo) { try { const p = await img(photo, true); g.drawImage(p, px, py, pw, ph); drawn = true } catch { /* foto non disponibile */ } }
  if (!drawn) {
    const pg = g.createLinearGradient(px, py, px, py + ph); pg.addColorStop(0, '#3a2566'); pg.addColorStop(1, '#1a1029')
    g.fillStyle = pg; g.fillRect(px, py, pw, ph)
    g.fillStyle = '#cdb8f2'; g.font = F(800, 260); g.fillText((name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(), W / 2, py + ph / 2 + 90)
  }
  g.restore()
  g.strokeStyle = '#7a47c9'; g.lineWidth = 6; g.beginPath(); g.roundRect(px, py, pw, ph, 22); g.stroke()

  // timbro
  g.save(); g.translate(W / 2, py + ph * 0.56); g.rotate(-0.24)
  g.font = F(800, 150); const tw = g.measureText('RISCOSSA').width
  g.fillStyle = 'rgba(255,240,230,.18)'; g.strokeStyle = '#e0453a'; g.lineWidth = 14
  g.beginPath(); g.roundRect(-tw / 2 - 36, -118, tw + 72, 168, 18); g.fill(); g.stroke()
  g.fillStyle = '#e0453a'; g.fillText('RISCOSSA', 0, 10); g.restore()

  g.fillStyle = '#f2eef8'; g.font = F(800, 96); g.fillText(name.toUpperCase(), W / 2, py + ph + 150, W - 120)
  g.fillStyle = '#e3d4ff'; g.font = F(800, 130); g.fillText(`${value} PT`, W / 2, py + ph + 290)
  g.fillStyle = '#9b90ae'; g.font = F(600, 50); g.fillText(`${hunter} · ${team} · Fox Point`, W / 2, H - 110, W - 120)
  return new Promise((ok, ko) => c.toBlob(b => b ? ok(b) : ko(new Error('immagine non creata')), 'image/png'))
}

export async function shareStory(info) {
  let blob
  try { blob = await draw(info, true) } catch { blob = await draw(info, false) }   // foto non leggibile: manifesto con le iniziali
  const file = new File([blob], `taglia-${info.name}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Taglia riscossa su ${info.name}` }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancel' }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file); a.download = file.name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  return 'download'
}
