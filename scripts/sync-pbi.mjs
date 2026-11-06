// Aggiorna posizioni e punti PBI dei blader e crea le taglie per i nuovi entrati in top 10.
// Eseguito da GitHub Actions (.github/workflows/sync-pbi.yml) ogni mattina o a mano.
// Richiede il secret SUPABASE_SERVICE_ROLE_KEY nel repository.
import { createClient } from '@supabase/supabase-js'
import { parseRanking } from './pbi-parse.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://udjviairelbvohdfwhhb.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PBI_URL = 'https://www.probladers.it/ranking'
const q = async p => { const { data, error } = await p; if (error) throw error; return data }

if (!KEY) {
  // finché il secret non è configurato l'aggiornamento viene saltato senza segnalare errori
  console.log('::warning::Secret SUPABASE_SERVICE_ROLE_KEY non configurato: aggiornamento PBI saltato. Aggiungilo in Settings > Secrets and variables > Actions.')
  process.exit(0)
}
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })

const r = await fetch(PBI_URL, { headers: { 'user-agent': 'FoxPoint/1.0 (uso interno Lake Fox)' } })
if (!r.ok) throw new Error(`Il sito PBI ha risposto ${r.status}`)
const rows = parseRanking(await r.text())
if (rows.length < 50 || rows[0].rank !== 1)
  throw new Error(`Lettura della classifica non valida (${rows.length} righe): il sito PBI potrebbe essere cambiato. Nessun dato modificato.`)
console.log(`Classifica letta: ${rows.length} giocatori. Primo: ${rows[0].nick} (${rows[0].points} pt)`)

const key = b => (b.pbi_nickname || b.nickname).toLowerCase()
const bl = await q(sb.from('bladers').select('id, nickname, pbi_nickname'))
const byNick = new Map(rows.map(x => [x.nick.toLowerCase(), x]))
const now = new Date().toISOString()

let updated = 0
for (const b of bl) {
  const x = byNick.get(key(b))
  if (!x) continue
  await q(sb.from('bladers').update({ pro_rank: x.rank, pro_points: x.points, pro_synced_at: now }).eq('id', b.id))
  updated++
}

// nuovi entrati nella top 10 (le altre taglie sono scelte a mano dagli admin)
const have = new Set(bl.map(key))
const fresh = rows.filter(x => x.rank <= 10 && !have.has(x.nick.toLowerCase()))
if (fresh.length)
  await q(sb.from('bladers').insert(fresh.map(x => ({ nickname: x.nick, pro_rank: x.rank, pro_points: x.points, pro_synced_at: now }))))

// taglia 'top10' (non attiva, valore 0) per ogni blader in top 10, in ogni team con stagione attiva
const seasons = await q(sb.from('seasons').select('id, team_id').eq('is_active', true))
const top = await q(sb.from('bladers').select('id').lte('pro_rank', 10))
const newB = seasons.flatMap(s => top.map(t => ({ team_id: s.team_id, season_id: s.id, target_id: t.id, value: 0, active: false, category: 'top10' })))
if (newB.length) await q(sb.from('bounties').upsert(newB, { onConflict: 'season_id,target_id', ignoreDuplicates: true }))

// taglie 'top10' attive su chi è uscito dalla top 10: le segnaliamo, decide l'admin
const act = await q(sb.from('bounties').select('category, bladers(nickname, pro_rank)').eq('active', true))
const usciti = [...new Set(act.filter(a => a.category === 'top10' && (!a.bladers.pro_rank || a.bladers.pro_rank > 10)).map(a => a.bladers.nickname))]

console.log(`Blader aggiornati: ${updated}`)
console.log(`Nuovi in top 10: ${fresh.map(x => x.nick).join(', ') || 'nessuno'}`)
console.log(`Fuori dalla top 10 ma con taglia attiva: ${usciti.join(', ') || 'nessuno'}`)
