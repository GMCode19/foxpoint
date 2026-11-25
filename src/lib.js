// Costanti e funzioni comuni a tutta l'app
import { supabase as sb } from './supabase'
import { toast } from './ui'

export { sb }
export const GROUPS = [['top10', 'Top 10'], ['rilevante', 'Blader rilevanti'], ['capo', 'Team leader'], ['superstar', 'Superstar'], ['fox', 'Fox Blader']]
export const AVATAR_BUCKET = 'avatar'
export const MEDAL = ['🥇', '🥈', '🥉']
export const PODIUM = ['winner', 'final', 'sf']
export const PHASES = [['winner', 'Vincitore 🏆'], ['final', 'Finale (2°)'], ['sf', 'Semifinale'], ['qf', 'Quarti'],
  ['r16', 'Ottavi (R16)'], ['r32', 'R32'], ['r64', 'R64'], ['r128', 'R128'], ['groups', 'Eliminato ai gironi']]
export const BADGES = [
  { k: 'a', i: '🎯', n: 'Prima taglia', d: 'Riscuoti la prima taglia', ok: w => w.length >= 1 },
  { k: 'b', i: '🔥', n: 'Cacciatore', d: '5 taglie riscosse', ok: w => w.length >= 5 },
  { k: 'c', i: '👑', n: 'Cacciatore di Top 10', d: 'Batti un blader della top 10', ok: (w, c) => w.some(x => c(x) === 'top10') },
  { k: 'd', i: '🦊', n: 'Colpo grosso', d: 'Batti un team leader o una superstar', ok: (w, c) => w.some(x => ['capo', 'superstar'].includes(c(x))) },
  { k: 'e', i: '🎟️', n: 'Prima ranked', d: 'Gioca la prima ranked', ok: (w, c, r) => r.length >= 1 },
  { k: 'f', i: '🏅', n: 'Sul podio', d: 'Arriva almeno in semifinale in una ranked', ok: (w, c, r) => r.some(x => PODIUM.includes(x.phase)) },
  { k: 'g', i: '🏆', n: 'Campione', d: 'Vinci una ranked', ok: (w, c, r) => r.some(x => x.phase === 'winner') },
]
export const LOGO = import.meta.env.BASE_URL + 'logo.png'
export const APP_URL = window.location.origin + import.meta.env.BASE_URL
export const SYNC_URL = 'https://github.com/GMCode19/foxpoint/actions/workflows/sync-pbi.yml'
export const PHOTO_BUCKET = 'foto-bersagli'

export const ini = n => (n || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '🦊'
export const phaseName = k => PHASES.find(p => p[0] === k)?.[1] || k
export const fmtDate = t => new Date(t).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const todayLocal = () => new Date().toLocaleDateString('sv-SE')
// campi di testo senza maiuscola automatica e correttore (codici, nickname)
export const plain = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }

// posizione in classifica con i pari merito (100, 80, 80, 50 -> 1, 2, 2, 4)
export const positions = board => board.map(r => 1 + board.filter(x => x.fox_points > r.fox_points).length)

const FRIENDLY = [
  [/tournament_id|respond_claim|penalty_snapshot|set_avatar|function admin_register_claim\(.*p_tournament/i, 'Manca un aggiornamento del database: va eseguito lo script foxpoint_11_taglie_fox_avatar.sql su Supabase'],
  [/one_pending_claim/, "C'è già una dichiarazione in attesa per questa taglia"],
  [/row-level security|permission denied/i, 'Non hai i permessi per questa azione'],
  [/violates foreign key/i, 'Non si può eliminare: ci sono dati collegati'],
  [/teams_participation_points_check/, 'I punti partecipazione devono essere tra 0 e 1000'],
  [/bounties_value_check/, 'Il valore della taglia non può essere negativo'],
  [/claims_check/, 'Non puoi riscuotere una taglia su te stesso'],
  [/duplicate key/i, 'Questo elemento esiste già'],
  [/Failed to fetch|NetworkError|Load failed/i, 'Connessione assente o instabile: riprova tra poco'],
]
export const err = e => {
  const m = e?.message || String(e)
  toast(FRIENDLY.find(([re]) => re.test(m))?.[1] || m, { kind: 'bad', ms: 5000 })
}

// Supabase restituisce al massimo 1000 righe per richiesta: scarico a pagine
export async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// impedisce che un doppio clic invii due volte la stessa azione
const inflight = new Set()
export async function once(key, fn) {
  if (inflight.has(key)) return
  inflight.add(key)
  try { return await fn() } finally { inflight.delete(key) }
}

// Indirizzi temporanei delle foto: riusati finché validi, così il browser non riscarica le immagini a ogni azione
// salvati anche sul telefono: alla riapertura dell'app le foto restano in cache invece di essere riscaricate
const PHOTO_TTL = 12 * 3600, PHOTO_KEY = 'fx-photo-urls'
const signedCache = (() => { try { return new Map(JSON.parse(localStorage.getItem(PHOTO_KEY) || '[]')) } catch { return new Map() } })()   // path -> { url, exp }
// URL firmati (validi 12 ore) per i file privati, con cache in memoria e sul telefono
async function signed(bucket, paths) {
  const now = Date.now(), key = p => bucket + ':' + p
  const missing = paths.filter(p => !(signedCache.get(key(p))?.exp > now + 600e3))
  if (missing.length) {
    const { data } = await sb.storage.from(bucket).createSignedUrls(missing, PHOTO_TTL)
    data?.forEach((s, i) => { if (s?.signedUrl) signedCache.set(key(missing[i]), { url: s.signedUrl, exp: now + PHOTO_TTL * 1000 }) })
    for (const [k, v] of signedCache) if (v.exp < now) signedCache.delete(k)
    try { localStorage.setItem(PHOTO_KEY, JSON.stringify([...signedCache])) } catch { /* spazio pieno */ }
  }
  return Object.fromEntries(paths.filter(p => signedCache.has(key(p))).map(p => [p, signedCache.get(key(p)).url]))
}

// manifesti dei ricercati (caricati dagli admin, per team)
export async function loadPhotos(team) {
  const { data, error } = await sb.from('blader_photos').select('blader_id, path').eq('team_id', team)
  if (error || !data?.length) return {}
  const urls = await signed(PHOTO_BUCKET, data.map(p => p.path))
  return Object.fromEntries(data.filter(p => urls[p.path]).map(p => [p.blader_id, urls[p.path]]))
}

// foto profilo: bladers = righe con avatar_path
export async function loadAvatars(bladers) {
  const list = bladers.filter(b => b.avatar_path)
  if (!list.length) return {}
  const urls = await signed(AVATAR_BUCKET, list.map(b => b.avatar_path))
  return Object.fromEntries(list.filter(b => urls[b.avatar_path]).map(b => [b.id, urls[b.avatar_path]]))
}

// settimana (lunedì, ora italiana) di una data: serve per la regola "si salta una settimana"
export function weekStart(t) {
  const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}
// valore delle taglie tra Fox Blader in base alla posizione (uguale al database)
export const foxValue = pos => pos === 1 ? 60 : pos === 2 ? 50 : pos === 3 ? 40 : pos <= 5 ? 30 : 20

// ===== Album collezionabile =====
// rarità dalla più bassa alla più alta (stesso ordine del database, script 14)
export const RARITIES = ['rara', 'epica', 'leggendaria', 'mitica']
export const RARITY_LABEL = { mitica: 'Mitica', leggendaria: 'Leggendaria', epica: 'Epica', rara: 'Rara' }
const higher = (a, b) => (RARITIES.indexOf(b) > RARITIES.indexOf(a) ? b : a)
// rarità di oggi di un ricercato (per le sagome da catturare): stesse regole di card_rarity_of nel database
export function currentRarity(d, b) {
  const t = d.bl[b.target_id] || {}, rk = t.pro_rank
  let best = 'rara'
  if (b.category === 'fox') {
    const i = d.board.findIndex(r => r.blader_id === b.target_id), row = d.board[i]
    const pos = i >= 0 ? positions(d.board)[i] : null
    best = !row || row.fox_points <= 0 ? 'rara' : pos === 1 ? 'leggendaria' : pos <= 3 ? 'epica' : 'rara'
  } else {
    best = higher(best, rk >= 1 && rk <= 3 ? 'mitica' : rk >= 4 && rk <= 10 ? 'leggendaria' : 'rara')
    best = higher(best, b.category === 'superstar' ? 'leggendaria' : b.category === 'capo' ? 'epica' : rk >= 1 && rk <= 30 ? 'epica' : 'rara')
  }
  return t.special_rarity ? higher(best, t.special_rarity) : best
}
export const ALBUM_GOALS = [
  { k: 'first', i: '🃏', n: 'Prima carta', d: 'Sblocca la prima carta' },
  { k: 'coll10', i: '📒', n: 'Collezionista', d: 'Carte di 10 blader diversi', max: 10 },
  { k: 'coll25', i: '📚', n: 'Grande collezionista', d: 'Carte di 25 blader diversi', max: 25 },
  { k: 'coll50', i: '🏛️', n: 'Archivista', d: 'Carte di 50 blader diversi', max: 50 },
  { k: 'mythic', i: '✨', n: 'Mitica!', d: 'Sblocca una carta mitica' },
  { k: 'pantheon', i: '🌌', n: 'Pantheon', d: 'Una carta mitica di ognuno dei mitici di oggi' },
  { k: 'set_top10', i: '👑', n: 'Set Top 10', d: 'Tutti i Top 10 di oggi nell\'album' },
  { k: 'set_superstar', i: '⭐', n: 'Set Superstar', d: 'Tutte le Superstar nell\'album' },
  { k: 'set_capo', i: '🛡️', n: 'Set Team leader', d: 'Tutti i Team leader nell\'album' },
  { k: 'set_rilevante', i: '🎯', n: 'Set Blader rilevanti', d: 'Tutti i Blader rilevanti nell\'album' },
  { k: 'set_fox', i: '🦊', n: 'Caccia in casa', d: 'Tutti i Fox Blader nell\'album' },
  { k: 'rivincita', i: '🔁', n: 'Rivincita', d: 'Batti due volte la stessa persona' },
  { k: 'espansioni', i: '🎴', n: 'Espansioni', d: 'La stessa persona in 3 rarità diverse' },
]
// album di un blader: set per categoria (ricercati attivi di oggi) + archivio, con le espansioni possedute
export function buildAlbum(d, who) {
  const mine = (d.album || []).filter(c => c.hunter_id === who && c.status === 'approved' && c.card_rarity)
  const byTarget = new Map()
  for (const c of mine) {
    if (!byTarget.has(c.target_id)) byTarget.set(c.target_id, {})
    const e = byTarget.get(c.target_id)
    ;(e[c.card_rarity] ||= []).push(c)
  }
  const slot = (target, rarity, category) => {
    const eds = byTarget.get(target) || {}
    const owned = RARITIES.filter(r => eds[r]).reverse()   // dalla più alta
    return { target, now: rarity, category, eds, owned, best: owned[0] || null, copies: owned.reduce((s, r) => s + eds[r].length, 0) }
  }
  const seen = new Set()
  const sets = GROUPS.map(([k, label]) => {
    const slots = d.bounties.filter(b => b.active && b.category === k && b.target_id !== who)
      .map(b => { seen.add(b.target_id); return slot(b.target_id, currentRarity(d, b), k) })
      .sort((a, z) => RARITIES.indexOf(z.now) - RARITIES.indexOf(a.now) || (d.bl[a.target]?.pro_rank || 999) - (d.bl[z.target]?.pro_rank || 999))
    return { k, label, slots, got: slots.filter(s => s.best).length }
  }).filter(s => s.slots.length)
  const archive = [...byTarget.keys()].filter(t => !seen.has(t)).map(t => slot(t, null, null))
  const count = Object.fromEntries(RARITIES.map(r => [r, mine.filter(c => c.card_rarity === r).length]))
  const total = sets.reduce((s, x) => s + x.slots.length, 0), got = sets.reduce((s, x) => s + x.got, 0)
  return { sets, archive, count, total, got, people: byTarget.size, cards: mine.length }
}
