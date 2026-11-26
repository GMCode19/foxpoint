// Particelle leggere su <canvas>: scintille con gravità, brillantini, pioggia d'oro.
// Il ciclo di disegno gira solo finché ci sono particelle vive; limite fisso per i telefoni meno potenti.
// telefoni con pochi core: metà particelle
const LOW = (navigator.hardwareConcurrency || 8) <= 4
const MAX = LOW ? 120 : 240
const scale = n => (LOW ? Math.ceil(n / 2) : n)

export function createParticles(canvas) {
  const g = canvas.getContext('2d')
  let parts = [], raf = 0, w = 0, h = 0, last = 0
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const resize = () => {
    w = canvas.clientWidth; h = canvas.clientHeight
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  function frame(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now
    g.clearRect(0, 0, w, h)
    g.globalCompositeOperation = 'lighter'
    parts = parts.filter(p => (p.t += dt) < p.life)
    for (const p of parts) {
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav * dt
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt
      const k = 1 - p.t / p.life, a = p.fade ? Math.min(1, k * 1.6) : 1
      g.globalAlpha = a
      g.fillStyle = p.color
      if (p.shape === 'spark') {                                 // scia allungata nella direzione del moto (linea: niente save/restore)
        const sp = Math.hypot(p.vx, p.vy) || 1, len = Math.min(18, sp * 0.03) + p.size
        g.strokeStyle = p.color; g.lineWidth = p.size; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx / sp * len, p.y - p.vy / sp * len); g.stroke()
      } else if (p.shape === 'star') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); const s = p.size * (0.6 + 0.4 * Math.sin(p.t * 12))
        g.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.35 : s, an = i * Math.PI / 4; g.lineTo(Math.cos(an) * r, Math.sin(an) * r) }
        g.closePath(); g.fill(); g.restore()
      } else {
        g.beginPath(); g.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, Math.PI * 2); g.fill()
      }
    }
    g.globalAlpha = 1
    raf = parts.length ? requestAnimationFrame(frame) : 0
    if (!raf) { last = 0; g.clearRect(0, 0, w, h) }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame) }

  return {
    // esplosione radiale da un punto
    burst(x, y, { n = 40, colors = ['#fff'], speed = [200, 520], life = [0.6, 1.2], size = [1.5, 3.5], grav = 600, shape = 'spark', drag = 0.97 } = {}) {
      for (let i = 0, m = scale(n); i < m && parts.length < MAX; i++) {
        const a = Math.random() * Math.PI * 2, v = speed[0] + Math.random() * (speed[1] - speed[0])
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - v * 0.25, grav, drag, t: 0, rot: 0, spin: (Math.random() - 0.5) * 8,
          life: life[0] + Math.random() * (life[1] - life[0]), size: size[0] + Math.random() * (size[1] - size[0]),
          color: colors[(Math.random() * colors.length) | 0], shape, fade: true })
      }
      kick()
    },
    // pioggia dall'alto (brillantini d'oro)
    rain({ n = 60, colors = ['#FFE29A'], size = [2, 4], shape = 'star', dur = 1.6 } = {}) {
      for (let i = 0, m = scale(n); i < m && parts.length < MAX; i++) {
        parts.push({ x: Math.random() * w, y: -10 - Math.random() * h * 0.6, vx: (Math.random() - 0.5) * 40, vy: 80 + Math.random() * 140, grav: 120, drag: 1,
          t: 0, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 6, life: dur + Math.random() * 1.4,
          size: size[0] + Math.random() * (size[1] - size[0]), color: colors[(Math.random() * colors.length) | 0], shape, fade: true })
      }
      kick()
    },
    clear() { parts = [] },
    destroy() { cancelAnimationFrame(raf); raf = 0; parts = []; window.removeEventListener('resize', resize) },
  }
}
