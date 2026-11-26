// Suoni dell'apertura, generati al momento (nessun file da scaricare).
// Partono solo dopo un tocco (regola dei browser) e si possono spegnere: la scelta resta salvata.
const KEY = 'fx-sound'
let ctx = null, master = null

export const soundOn = () => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } }
export const setSound = on => { try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* modalità privata */ } }

function ac() {
  if (!soundOn()) return null
  try {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext
      if (!C) return null
      ctx = new C(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch { return null }
}

function noise(c, dur) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = c.createBufferSource(); s.buffer = b; return s
}
function env(c, g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec)
}
function tone(c, freq, t, dur, type = 'sine', peak = 0.25) {
  const o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.setValueAtTime(freq, t); o.connect(g); g.connect(master)
  env(c, g, t, 0.01, peak, dur); o.start(t); o.stop(t + dur + 0.05)
}

// fruscio della carta che si strappa
export function sfxTear() {
  const c = ac(); if (!c) return
  const t = c.currentTime, s = noise(c, 0.35), f = c.createBiquadFilter(), g = c.createGain()
  f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(4200, t + 0.3)
  s.connect(f); f.connect(g); g.connect(master); env(c, g, t, 0.02, 0.6, 0.3); s.start(t)
}
// "whoosh" di una carta che si muove
export function sfxWhoosh(up = true) {
  const c = ac(); if (!c) return
  const t = c.currentTime, s = noise(c, 0.4), f = c.createBiquadFilter(), g = c.createGain()
  f.type = 'lowpass'; f.frequency.setValueAtTime(up ? 400 : 2500, t); f.frequency.exponentialRampToValueAtTime(up ? 2500 : 400, t + 0.35)
  s.connect(f); f.connect(g); g.connect(master); env(c, g, t, 0.05, 0.3, 0.3); s.start(t)
}
// tensione prima di una carta rara: ronzio che sale
export function sfxCharge(dur = 0.9) {
  const c = ac(); if (!c) return
  const t = c.currentTime, o = c.createOscillator(), g = c.createGain()
  o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(260, t + dur)
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900
  o.connect(f); f.connect(g); g.connect(master)
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
  o.start(t); o.stop(t + dur + 0.1)
}
// rivelazione: più la carta è rara, più note e più ricca
const NOTES = { rara: [784], epica: [659, 988], leggendaria: [523, 784, 1047], mitica: [523, 659, 784, 1047, 1319] }
export function sfxReveal(r) {
  const c = ac(); if (!c) return
  const t = c.currentTime, n = NOTES[r] || NOTES.rara
  n.forEach((f, k) => { tone(c, f, t + k * 0.07, 0.9, 'triangle', 0.18); tone(c, f * 2, t + k * 0.07, 0.6, 'sine', 0.05) })
  if (r === 'leggendaria' || r === 'mitica') {               // colpo basso
    const o = c.createOscillator(), g = c.createGain()
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.5)
    o.connect(g); g.connect(master); env(c, g, t, 0.005, r === 'mitica' ? 0.7 : 0.45, 0.55); o.start(t); o.stop(t + 0.7)
  }
}
export const buzz = p => { try { navigator.vibrate?.(p) } catch { /* non supportato (iPhone) */ } }
