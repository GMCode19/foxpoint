// Aggiorna posizioni e punti PBI dei blader e crea le taglie per i nuovi entrati in top 10.
// Eseguito da GitHub Actions (.github/workflows/sync-pbi.yml) ogni mattina o a mano.
// Richiede il secret SUPABASE_SERVICE_ROLE_KEY. Con SOLO_PROVA=true legge e mostra senza scrivere nulla.
import { createClient } from '@supabase/supabase-js'
import { parseRanking, validateRanking } from './pbi-parse.js'
import { planSync } from './pbi-plan.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://udjviairelbvohdfwhhb.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY = process.env.SOLO_PROVA === 'true'
const PBI_URL = 'https://www.probladers.it/ranking'
const TOP_N = 10
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data }
const list = a => a.length ? a.join(', ') : 'nessuno'

// 1) lettura e controllo della classifica
const res = await fetch(PBI_URL, { headers: { 'user-agent': 'FoxPoint/1.0 (uso interno Lake Fox)' } })
if (!res.ok) throw new Error(`Il sito PBI ha risposto ${res.status}`)
const html = await res.text()
const rows = parseRanking(html)
const problems = validateRanking(rows)
const withId = rows.filter(r => r.pbiId).length
console.log(`Classifica letta: ${rows.length} giocatori, ${withId} con id PBI, ${rows.filter(r => r.team).length} con team.`)
if (DRY) {
  const firstRow = (html.match(/<tr[\s\S]*?<\/tr>/gi) || []).find(t => /<td/i.test(t)) || ''
  console.log('--- HTML della prima riga (per controllo) ---\n' + firstRow.replace(/\s+/g, ' ').slice(0, 1500))
  console.log('--- Prime 12 righe interpretate ---')
  rows.slice(0, 12).forEach(r => console.log(`#${r.rank} nick="${r.nick}" team="${r.team ?? ''}" id=${r.pbiId ?? '-'} punti=${r.points}`))
}
if (problems.length) throw new Error(`Classifica non valida (${problems.join('; ')}): il sito PBI potrebbe essere cambiato. Nessun dato modificato.`)

if (!KEY) {
  console.log('::warning::Secret SUPABASE_SERVICE_ROLE_KEY non configurato: aggiornamento PBI saltato.')
  process.exit(0)
}
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })

// 2) piano delle modifiche
const bladers = await q(sb.from('bladers').select('id, nickname, pbi_nickname, pbi_id, pro_rank'))
const plan = planSync(bladers, rows, { topN: TOP_N })
console.log(`Da aggiornare: ${plan.updates.length} | nuovi in top ${TOP_N}: ${list(plan.inserts.map(i => i.nickname))}`)
console.log(`Doppioni rinominati: ${list(plan.renames.map(r => `${r.from} -> ${r.nickname}`))}`)
console.log(`Usciti dalla classifica: ${list(plan.clears.map(c => c.nickname))}`)
if (plan.skipped.length) console.log(`::warning::Saltati: ${plan.skipped.join('; ')}`)
if (DRY) { console.log('Modalità prova: nessuna modifica scritta.'); process.exit(0) }

// 3) scrittura
const now = new Date().toISOString()
for (const r of plan.renames) await q(sb.from('bladers').update({ nickname: r.nickname }).eq('id', r.id))
for (const u of plan.updates) {
  const { id, nickname, ...fields } = u
  await q(sb.from('bladers').update({ ...fields, pro_synced_at: now }).eq('id', id))
}
if (plan.inserts.length) await q(sb.from('bladers').insert(plan.inserts.map(i => ({ ...i, pro_synced_at: now }))))
if (plan.clears.length) await q(sb.from('bladers').update({ pro_rank: null, pro_points: null }).in('id', plan.clears.map(c => c.id)))

// 4) taglia 'top10' (valore 0, non attiva) per ogni blader in top 10, in ogni team con stagione attiva
const seasons = await q(sb.from('seasons').select('id, team_id').eq('is_active', true))
const top = await q(sb.from('bladers').select('id').lte('pro_rank', TOP_N))
const newB = seasons.flatMap(s => top.map(t => ({ team_id: s.team_id, season_id: s.id, target_id: t.id, value: 0, active: false, category: 'top10' })))
if (newB.length) await q(sb.from('bounties').upsert(newB, { onConflict: 'season_id,target_id', ignoreDuplicates: true }))

// 5) taglie 'top10' attive su chi è uscito dalla top 10: le segnaliamo, decide l'admin
const act = await q(sb.from('bounties').select('category, bladers(nickname, pro_rank)').eq('active', true))
const usciti = [...new Set(act.filter(a => a.category === 'top10' && (!a.bladers.pro_rank || a.bladers.pro_rank > TOP_N)).map(a => a.bladers.nickname))]
console.log(`Taglie top 10 attive su chi è fuori dalla top 10: ${list(usciti)}`)
