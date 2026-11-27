// Bustina 3D in tempo reale (caricata solo quando c'è una bustina da aprire, e solo se il telefono la regge).
// Stagnola metallizzata e iridescente, forma a cuscino, lembo che si strappa davvero. Le immagini della bustina
// si disegnano al momento su canvas: gli unici file scaricati sono un logo e una mappa delle pieghe (circa 110 KB).
import {
  WebGLRenderer, Scene, PerspectiveCamera, PMREMGenerator, PointLight, AmbientLight, Group, Mesh, PlaneGeometry, MeshPhysicalMaterial,
  MeshBasicMaterial, MeshStandardMaterial, Sprite, SpriteMaterial, CanvasTexture, Texture, Vector2, Vector3, Raycaster, SRGBColorSpace, ACESFilmicToneMapping,
  AdditiveBlending, MathUtils,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { gsap } from 'gsap'
import logoUrl from './pack/logo.jpg'
import normalUrl from './pack/normal.jpg'

const PW = 1.4, PH = 2.2, DEPTH = 0.15            // dimensioni della bustina (unità 3D)
const V_TOP = 0.88, V_BOT = 0.06                  // dove finisce la saldatura in alto / inizia quella in basso (0 = fondo, 1 = cima)
const TW = 1024, TH = 1609                        // texture
const METAL = ['#2b1760', '#c2a6ff', '#4a2a94', '#efe4ff', '#6b46c8', '#2b1760']

// carattere dei titoli: lo stesso dell'app (Saira, stretta); se manca ripiega su un condensato di sistema
const FONT = '"Saira Variable", Impact, "Arial Narrow Bold", sans-serif'
const WEIGHT = 900
const stretch = (g, v) => { if ('fontStretch' in g) g.fontStretch = v }

const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src })
const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t) }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255]
  return 'rgb(' + c.map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))).join(',') + ')'
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }

// ---------- disegno della bustina ----------
function packPath(g) {
  const tooth = TW / 46, dz = 13, ny = (1 - V_TOP) * TH
  g.beginPath(); g.moveTo(0, dz)
  for (let x = 0; x < TW; x += tooth) { g.lineTo(x + tooth / 2, 0); g.lineTo(x + tooth, dz) }
  g.lineTo(TW, ny - 12); g.lineTo(TW - 16, ny); g.lineTo(TW, ny + 12)   // tacca dello strappo
  g.lineTo(TW, TH - dz)
  for (let x = TW; x > 0; x -= tooth) { g.lineTo(x - tooth / 2, TH); g.lineTo(x - tooth, TH - dz) }
  g.closePath()
}
function crimps(g) {
  const top = (1 - V_TOP) * TH, bot = (1 - V_BOT) * TH
  for (const [y0, y1] of [[0, top], [bot, TH]]) {
    const lg = g.createLinearGradient(0, 0, TW, 0); METAL.forEach((c, i) => lg.addColorStop(i / (METAL.length - 1), c))
    g.fillStyle = lg; g.fillRect(0, y0, TW, y1 - y0)
    g.globalAlpha = .22
    for (let x = 0; x < TW; x += 6) { g.fillStyle = '#fff'; g.fillRect(x, y0, 2, y1 - y0); g.fillStyle = '#000'; g.fillRect(x + 2, y0, 3, y1 - y0) }
    g.globalAlpha = 1
  }
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, top - 2, TW, 4); g.fillRect(0, bot - 2, TW, 4)
}
function fit(g, text, maxW, size) {
  stretch(g, 'extra-condensed')
  g.font = `${WEIGHT} ${size}px ${FONT}`
  const w = g.measureText(text).width
  if (w > maxW) { size = Math.floor(size * maxW / w); g.font = `${WEIGHT} ${size}px ${FONT}` }
  return size
}
function seal(g, cx, cy, r, col, logo) {
  g.beginPath()
  for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, rr = r + (i % 2 ? 4 : 10); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) }
  g.fillStyle = shade(col, -.25); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 18; g.shadowOffsetY = 8; g.fill(); g.shadowColor = 'transparent'
  const rg = g.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r)
  rg.addColorStop(0, shade(col, .45)); rg.addColorStop(.5, col); rg.addColorStop(1, shade(col, -.55))
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = rg; g.fill()
  const ir = r * .76, ig = g.createRadialGradient(cx, cy - ir * .2, 0, cx, cy, ir)
  ig.addColorStop(0, shade(col, -.6)); ig.addColorStop(1, '#0c0612')
  g.beginPath(); g.arc(cx, cy, ir, 0, Math.PI * 2); g.fillStyle = ig; g.fill()
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.stroke()
  g.save(); g.beginPath(); g.arc(cx, cy, ir - 2, 0, Math.PI * 2); g.clip()
  g.globalCompositeOperation = 'screen'; const lw = ir * 1.7; g.drawImage(logo, cx - lw / 2, cy - lw * .55, lw, lw * logo.height / logo.width); g.restore()
}
function drawFront(c, logo, color, count) {
  const g = c.getContext('2d'); g.clearRect(0, 0, TW, TH)
  g.save(); packPath(g); g.clip()
  const cy = TH * .43
  const rg = g.createRadialGradient(TW / 2, cy, 0, TW / 2, cy, TH * .75)
  rg.addColorStop(0, '#12082e'); rg.addColorStop(.28, '#3b1d8f'); rg.addColorStop(.62, '#7a4cff'); rg.addColorStop(1, '#170a3a')
  g.fillStyle = rg; g.fillRect(0, 0, TW, TH)
  g.save(); g.translate(TW / 2, cy); g.globalAlpha = .09; g.fillStyle = '#fff'                       // raggi
  for (let i = 0; i < 44; i++) { g.rotate(Math.PI * 2 / 44); g.beginPath(); g.moveTo(0, 0); g.lineTo(TH, -38); g.lineTo(TH, 38); g.fill() }
  g.restore()
  let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647                        // brillantini (sempre gli stessi)
  for (let i = 0; i < 320; i++) { g.globalAlpha = .25 + rnd() * .5; g.fillStyle = rnd() > .7 ? '#ffe7a8' : '#fff'; g.beginPath(); g.arc(rnd() * TW, rnd() * TH, .8 + rnd() * 1.8, 0, 7); g.fill() }
  g.globalAlpha = 1
  g.globalCompositeOperation = 'screen'                                                           // volpe
  const lw = TW * .8; g.drawImage(logo, (TW - lw) / 2, TH * .14, lw, lw * logo.height / logo.width)
  g.globalCompositeOperation = 'source-over'
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'
  const size = fit(g, 'BUSTINA TAGLIE', TW * .84, 150), ty = TH * .812
  g.fillStyle = '#12082e'; g.fillText('BUSTINA TAGLIE', TW / 2, ty + 6)
  const tg = g.createLinearGradient(0, ty - size * .8, 0, ty)
  tg.addColorStop(0, '#ffffff'); tg.addColorStop(.46, '#dccbff'); tg.addColorStop(.54, '#7a58d0'); tg.addColorStop(1, '#f6f0ff')
  g.fillStyle = tg; g.fillText('BUSTINA TAGLIE', TW / 2, ty)
  seal(g, TW / 2, TH * .885, 70, color, logo)                                                     // sigillo col colore della carta più rara
  stretch(g, 'condensed'); g.font = `${WEIGHT} 36px ${FONT}`; g.textAlign = 'left'
  const label = `${count} ${count === 1 ? 'CARTA' : 'CARTE'}`, lw2 = g.measureText(label).width + 44
  g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(g, 56, TH * .885 - 28, lw2, 56, 12); g.fill()
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff'; g.fillText(label, 78, TH * .885 + 13)
  g.textAlign = 'right'; g.fillStyle = 'rgba(220,203,255,.85)'; g.fillText('SERIE 1', TW - 70, TH * .885 + 13)
  crimps(g)
  g.restore()
}
function drawBack(c, logo) {
  const g = c.getContext('2d'); g.clearRect(0, 0, TW, TH)
  g.save(); g.translate(TW, 0); g.scale(-1, 1)                  // il retro si guarda da dietro: lo disegno specchiato
  packPath(g); g.clip()
  const lg = g.createLinearGradient(0, 0, 0, TH); lg.addColorStop(0, '#2a1560'); lg.addColorStop(1, '#100828')
  g.fillStyle = lg; g.fillRect(0, 0, TW, TH)
  g.globalAlpha = .06; g.strokeStyle = '#fff'; g.lineWidth = 3
  for (let x = -TH; x < TW; x += 34) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + TH, TH); g.stroke() }
  g.globalAlpha = 1
  g.globalCompositeOperation = 'screen'; const lw = TW * .42; g.drawImage(logo, (TW - lw) / 2, TH * .3, lw, lw * logo.height / logo.width); g.globalCompositeOperation = 'source-over'
  stretch(g, 'condensed'); g.textAlign = 'center'; g.fillStyle = '#dccbff'; g.font = `${WEIGHT} 56px ${FONT}`; g.fillText('BUSTINA TAGLIE', TW / 2, TH * .66)
  stretch(g, 'normal'); g.fillStyle = 'rgba(220,203,255,.7)'; g.font = '600 30px "Barlow", system-ui, sans-serif'
  g.fillText('Ogni taglia riscossa sblocca la carta', TW / 2, TH * .71); g.fillText('del blader catturato.', TW / 2, TH * .745)
  crimps(g)
  g.restore()
}

// ---------- forma a cuscino ----------
function pillow(v0, v1, sx = 56, sy) {
  sy = sy || Math.max(4, Math.round((v1 - v0) * 90))
  const g = new PlaneGeometry(1, 1, sx, sy), p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = v0 + uv.getY(i) * (v1 - v0)
    const by = smooth((v - V_BOT) / .1) * smooth((V_TOP - v) / .08), bx = Math.pow(Math.max(0, 1 - (2 * u - 1) ** 2), .5)
    p.setXYZ(i, (u - .5) * PW * (1 - .045 * by * (1 - (2 * u - 1) ** 2)), (v - .5) * PH, DEPTH * bx * by)
    uv.setXY(i, u, v)
  }
  g.computeVertexNormals(); return g
}

// opt: { color, leak (0..1, quanto filtra la luce), count, onGrab(), onTear(p, x, y), onCommit(), onLost() }
export async function createPack3D(host, opt) {
  const { color = '#FF8AD8', leak = 1, count = 1 } = opt
  const T0 = performance.now()
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true')
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })   // se non c'è WebGL2 lancia: Unlock ripiega sulla bustina classica
  let dead = false
  const fail = e => { renderer.dispose(); throw e }
  let logo, nmImg
  try { [logo, nmImg] = await Promise.all([loadImg(logoUrl), loadImg(normalUrl), document.fonts.load(`${WEIGHT} 40px "Saira Variable"`).catch(() => {}), document.fonts.load('600 30px Barlow').catch(() => {})]) } catch (e) { fail(e) }

  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = SRGBColorSpace
  const low = (navigator.hardwareConcurrency || 8) <= 4        // telefoni di fascia bassa: meno pixel e materiale più semplice
  const maxDpr = Math.min(devicePixelRatio || 1, low ? 1.5 : 2)
  renderer.setPixelRatio(maxDpr)
  const scene = new Scene()
  const pm = new PMREMGenerator(renderer)
  const envRT = pm.fromScene(new RoomEnvironment(), .03); scene.environment = envRT.texture
  const camera = new PerspectiveCamera(30, 1, .1, 50)
  const key = new PointLight(0xffffff, 6, 0, 1.6); key.position.set(-1.2, 1.4, 2.2); scene.add(key)
  const tint = new PointLight(color, 5, 0, 1.6); tint.position.set(1.4, -.6, 1.6); scene.add(tint)
  scene.add(new AmbientLight(0xffffff, .25))

  const frontC = document.createElement('canvas'), backC = document.createElement('canvas')
  frontC.width = backC.width = TW; frontC.height = backC.height = TH
  drawFront(frontC, logo, color, count); drawBack(backC, logo)
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy())
  const tex = c => { const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = aniso; return t }
  const frontT = tex(frontC), backT = tex(backC)
  const normalT = new Texture(nmImg); normalT.needsUpdate = true
  const base = { normalScale: new Vector2(.9, .9), metalness: .6, roughness: .3, alphaTest: .5, alphaToCoverage: true, envMapIntensity: 1.25 }
  const mat = map => low
    ? new MeshStandardMaterial({ ...base, map, normalMap: normalT })
    : new MeshPhysicalMaterial({ ...base, map, normalMap: normalT, clearcoat: 1, clearcoatRoughness: .12, iridescence: .6, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 560] })
  const frontM = mat(frontT), backM = mat(backT)

  const pack = new Group(); pack.visible = false; scene.add(pack)
  const body = new Group(); pack.add(body)
  const bodyGeo = pillow(0, V_TOP)
  const bodyF = new Mesh(bodyGeo, frontM), bodyB = new Mesh(bodyGeo, backM); bodyB.scale.z = -1; body.add(bodyF, bodyB)
  const strip = new Group(); pack.add(strip)                  // il lembo da strappare, con il perno su un lato (si sceglie al tocco)
  const stripGeo = pillow(V_TOP, 1, 56, 10)
  const sf = new Mesh(stripGeo, frontM), sb = new Mesh(stripGeo, backM); sb.scale.z = -1; strip.add(sf, sb)
  let hinge = -1                                                // -1 = perno a sinistra, +1 = a destra
  const setHinge = h => { hinge = h; strip.position.set(h * PW / 2, 0, 0); sf.position.x = sb.position.x = -h * PW / 2 }
  setHinge(-1)

  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new CanvasTexture(c) })()
  const seamY = (V_TOP - .5) * PH
  const glow = new Sprite(new SpriteMaterial({ map: glowTex, color, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }))
  glow.scale.set(PW * 1.7, .34, 1); glow.position.set(0, seamY, .02); pack.add(glow)
  const lineGeo = new PlaneGeometry(PW * .98, .012)
  const line = new Mesh(lineGeo, new MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }))
  line.position.set(0, seamY, .012); pack.add(line)
  const burst = new Sprite(new SpriteMaterial({ map: glowTex, color, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }))
  burst.position.set(0, seamY, .1); pack.add(burst)

  // ---------- inquadratura: la bustina sta tra la barra in alto e i testi in basso ----------
  let W = 1, H = 1
  const resize = () => {
    W = host.clientWidth; H = host.clientHeight; if (!W || !H) return
    renderer.setSize(W, H, false); camera.aspect = W / H
    const top = 72, bottom = 150, usable = Math.max(120, H - top - bottom)
    const packPx = Math.min(usable * .94, W * .72 * (PH / PW))        // altezza della bustina sullo schermo
    const upp = PH / packPx, cyPx = top + usable / 2                  // unità 3D per pixel, centro della zona libera
    const camY = (cyPx - H / 2) * upp
    camera.position.set(0, camY, upp * H / 2 / Math.tan(MathUtils.degToRad(camera.fov / 2))); camera.lookAt(0, camY, 0)
    camera.updateProjectionMatrix(); camera.updateMatrixWorld()
    markStrip()
  }
  const markStrip = () => { const p = project(0, ((V_TOP + 1) / 2 - .5) * PH, .05); host.dataset.strip = Math.round(p.x) + ',' + Math.round(p.y) }
  const _v = new Vector3()
  const project = (x, y, z) => {                                       // punto della bustina -> pixel dello schermo
    pack.updateMatrixWorld(); _v.set(x, y, z).applyMatrix4(pack.matrixWorld).project(camera)
    const r = host.getBoundingClientRect(); return { x: r.left + (_v.x + 1) / 2 * r.width, y: r.top + (1 - _v.y) / 2 * r.height }
  }
  const ro = new ResizeObserver(resize); ro.observe(host)
  host.appendChild(canvas); resize()
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (!dead) opt.onLost?.() })

  // ---------- gesti ----------
  const ray = new Raycaster(), ptr = new Vector2(), hitObjs = [sf, sb, bodyF, bodyB]
  let mode = null, pid = -1, sx = 0, sy = 0, moved = false, tear = 0, opened = false, committed = false, entered = false
  const rot = { x: 0, y: 0, tx: 0, ty: 0 }
  const hit = e => { const r = host.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, camera); return ray.intersectObjects(hitObjs)[0] }
  const commit = () => { if (committed) return; committed = true; mode = null; opt.onCommit?.() }
  const down = e => {
    if (opened || committed || !pack.visible || mode) return          // un secondo dito non interrompe il gesto in corso
    const h = hit(e); if (!h) { mode = null; return }                  // fuori dalla bustina: niente
    try { host.setPointerCapture(e.pointerId) } catch { /* vecchi browser */ }
    pid = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false
    if (h.uv.y > .8) {
      mode = 'tear'
      if (tear < .02) { const r = host.getBoundingClientRect(); setHinge(e.clientX < r.left + r.width / 2 ? 1 : -1) }   // il perno è dal lato opposto al dito
    } else mode = 'turn'
    opt.onGrab?.()
  }
  const move = e => {
    if (!mode || e.pointerId !== pid) return
    const dx = e.clientX - sx, dy = e.clientY - sy
    if (Math.hypot(dx, dy) > 6) moved = true
    if (mode === 'tear') {
      tear = Math.min(1, Math.abs(dx) / (host.clientWidth * .55))
      const s = project(0, seamY, .05); opt.onTear?.(tear, e.clientX, s.y)
      if (tear >= 1) commit()
    } else { rot.ty = Math.max(-.9, Math.min(.9, dx * .009)); rot.tx = Math.max(-.45, Math.min(.45, dy * .006)) }
  }
  const cancel = e => { if (e.pointerId !== pid) return; mode = null; rot.tx = rot.ty = 0 }   // gesto interrotto dal sistema: nessuna apertura
  const up = e => {
    if (e.pointerId !== pid) return
    const m = mode; mode = null; rot.tx = rot.ty = 0
    if (m === 'tear' && (!moved || tear >= .6)) commit()
    else if (m === 'turn' && !moved) commit()                          // un tocco sulla bustina la apre
  }
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move)
  host.addEventListener('pointerup', up); host.addEventListener('pointercancel', cancel); host.addEventListener('lostpointercapture', cancel)

  // ---------- ciclo di disegno ----------
  const reduceDpr = () => { if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); renderer.setSize(W, H, false) } }
  const glowIn = { v: 0 }
  let last = performance.now(), nFrames = 0, slow = 0
  const frame = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000
    if (entered && nFrames < 50) { nFrames++; if (dt > .034) slow++; if (nFrames === 50 && slow > 22) reduceDpr() }   // telefono in affanno: meno pixel
    if (!opened) {
      const idleY = mode ? 0 : Math.sin(t * .8) * .16, idleX = mode ? 0 : Math.sin(t * .6) * .06
      rot.x += ((mode === 'turn' ? rot.tx : idleX) - rot.x) * Math.min(1, dt * 8)
      rot.y += ((mode === 'turn' ? rot.ty : idleY) - rot.y) * Math.min(1, dt * 8)
      pack.rotation.x = rot.x; pack.rotation.y = rot.y
      if (entered) pack.position.y = Math.sin(t * 1.6) * .03
      if (mode !== 'tear' && tear > 0) tear = Math.max(0, tear - dt * 3.5)   // il lembo torna giù
      strip.rotation.z = -hinge * tear * .28; strip.rotation.y = hinge * tear * .55; strip.position.y = tear * .04; strip.position.z = tear * .08
      const pulse = .55 + .25 * Math.sin(t * 5), k = .25 + .75 * leak
      glow.material.opacity = Math.min(1, (pulse * .7 + tear * .8) * k) * glowIn.v; line.material.opacity = Math.min(1, (.6 + tear) * k) * glowIn.v
      glow.scale.y = .3 + tear * .5
    }
    key.position.x = -1.2 + Math.sin(t * .7) * .6
    renderer.render(scene, camera)
  }
  // prima di mostrare qualcosa: shader compilati e immagini già caricate sulla scheda grafica, così l'entrata non scatta
  canvas.style.visibility = 'hidden'
  pack.visible = true
  try { await renderer.compileAsync(scene, camera); renderer.render(scene, camera) } catch (e) { pack.visible = false; renderer.dispose(); throw e }
  pack.visible = false
  renderer.setAnimationLoop(frame)
  const tws = []
  const track = x => { tws.push(x); return x }

  const api = {
    // entrata: la bustina sale dal basso
    enter() {
      canvas.style.visibility = 'visible'; pack.visible = true
      pack.position.y = -2.4; pack.scale.setScalar(.7); pack.rotation.z = -.2
      track(gsap.to(pack.position, { y: 0, duration: .7, ease: 'back.out(1.5)', onComplete() { entered = true; markStrip() } }))
      track(gsap.to(pack.scale, { x: 1, y: 1, z: 1, duration: .7, ease: 'back.out(1.5)' }))
      track(gsap.to(pack.rotation, { z: 0, duration: .7, ease: 'back.out(1.5)' }))
      track(gsap.to(glowIn, { v: 1, duration: .6, delay: .3 }))
      host.dataset.ready = '1'
      host.dataset.build = Math.round(performance.now() - T0)         // quanto ci ha messo a prepararsi (ms), utile nelle prove
    },
    seam() { return project(0, seamY, .05) },                           // dov'è lo strappo sullo schermo
    // strappo: il lembo vola via, lampo di luce, la bustina cade. Restituisce la timeline (Unlock aggiunge suono e passaggio alle carte)
    open() {
      opened = true; committed = true; mode = null
      gsap.killTweensOf([pack.position, pack.scale, pack.rotation, glowIn])
      const dir = -hinge, prog = { p: tear }
      const tl = track(gsap.timeline())
      tl.to(prog, { p: 1, duration: .12, onUpdate() { tear = prog.p; strip.rotation.z = -hinge * tear * .28; strip.rotation.y = hinge * tear * .55 } })
        .to(strip.position, { x: hinge * PW / 2 + dir * 1.6, y: 1.4, z: .6, duration: .6, ease: 'power2.in' }, '>')
        .to(strip.rotation, { z: dir * .9, y: -dir * 1.2, x: .4, duration: .6, ease: 'power2.in', onComplete() { strip.visible = false } }, '<')
        .to(burst.material, { opacity: 1, duration: .1 }, '<')
        .fromTo(burst.scale, { x: .2, y: .2 }, { x: 4.5, y: 2.2, duration: .45, ease: 'expo.out' }, '<')
        .to(burst.material, { opacity: 0, duration: .45 }, '>-.1')
        .to([glow.material, line.material], { opacity: 0, duration: .3 }, '<')
        .to(pack.scale, { x: 1, y: 1, z: 1, duration: .2 }, 0)
        .to(pack.rotation, { z: 0, duration: .2 }, 0)
        .to(pack.position, { y: -3.6, duration: .7, ease: 'power3.in' }, .2)
        .to(pack.rotation, { x: .5, duration: .7, ease: 'power3.in' }, .2)
      return tl
    },
    destroy() {
      if (dead) return; dead = true
      tws.forEach(x => x.kill()); gsap.killTweensOf([pack.position, pack.scale, pack.rotation, strip.position, strip.rotation, glowIn, burst.material, burst.scale])
      renderer.setAnimationLoop(null); ro.disconnect()
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', cancel); host.removeEventListener('lostpointercapture', cancel)
      ;[bodyGeo, stripGeo, lineGeo].forEach(x => x.dispose())
      ;[frontM, backM, line.material, glow.material, burst.material].forEach(x => x.dispose())
      ;[frontT, backT, normalT, glowTex].forEach(x => x.dispose())
      envRT.dispose(); pm.dispose(); renderer.dispose(); renderer.forceContextLoss()
      canvas.remove()
    },
  }
  return api
}
