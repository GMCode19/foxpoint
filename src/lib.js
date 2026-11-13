// Costanti e funzioni comuni a tutta l'app
import { supabase as sb } from './supabase'
import { toast } from './ui'

export { sb }
export const GROUPS = [['top10', 'Top 10'], ['rilevante', 'Blader rilevanti'], ['capo', 'Capi team e creator'], ['fox', 'Fox Blader']]
export const AVATAR_BUCKET = 'avatar'
export const MEDAL = ['🥇', '🥈', '🥉']
export const PODIUM = ['winner', 'final', 'sf']
export const PHASES = [['winner', 'Vincitore 🏆'], ['final', 'Finale (2°)'], ['sf', 'Semifinale'], ['qf', 'Quarti'],
  ['r16', 'Ottavi (R16)'], ['r32', 'R32'], ['r64', 'R64'], ['r128', 'R128'], ['groups', 'Eliminato ai gironi']]
export const BADGES = [
  { k: 'a', i: '🎯', n: 'Prima taglia', d: 'Riscuoti la prima taglia', ok: w => w.length >= 1 },
  { k: 'b', i: '🔥', n: 'Cacciatore', d: '5 taglie riscosse', ok: w => w.length >= 5 },
  { k: 'c', i: '👑', n: 'Cacciatore di Top 10', d: 'Batti un blader della top 10', ok: (w, c) => w.some(x => c(x) === 'top10') },
  { k: 'd', i: '🦊', n: 'Colpo grosso', d: 'Batti un capo team', ok: (w, c) => w.some(x => c(x) === 'capo') },
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
