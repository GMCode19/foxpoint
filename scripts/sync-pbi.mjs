// Aggiorna posizioni e punti PBI dei blader, crea le taglie per i nuovi entrati in top 10
// e importa le prossime ranked dal calendario PBI (così i membri possono segnare "Partecipo").
// Eseguito da GitHub Actions (.github/workflows/sync-pbi.yml) ogni mattina o a mano.
// Richiede il secret SUPABASE_SERVICE_ROLE_KEY. Con SOLO_PROVA=true legge e mostra senza scrivere nulla.
import { createClient } from '@supabase/supabase-js'
import { parseRanking, validateRanking } from './pbi-parse.js'
import { planSync } from './pbi-plan.js'
import { parseCalendar, parseEvent, planEvents } from './pbi-events.js'
import { planBounties } from './pbi-bounties.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://udjviairelbvohdfwhhb.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY = process.env.SOLO_PROVA === 'true'
const PBI_URL = 'https://www.probladers.it/ranking'
const CAL_URL = 'https://www.probladers.it/calendario-eventi'
// ogni richiesta al sito PBI si arrende dopo 30 secondi (un sito bloccato non deve tenere ferma l'automazione)
const get = url => fetch(url, { headers: { 'user-agent': 'FoxPoint/1.0 (uso interno Lake Fox)' }, signal: AbortSignal.timeout(30000) })
const TOP_N = 10
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data }
const list = a => a.length ? a.join(', ') : 'nessuno'

const sb = KEY ? createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } }) : null

// 0) prossime ranked dal calendario PBI: indipendente dalla classifica, un suo errore non blocca il resto
try {
  const cal = await get(CAL_URL)
  if (!cal.ok) throw new Error(`il calendario PBI ha risposto ${cal.status}`)
  const candidates = parseCalendar(await cal.text())
  const found = []
  for (const c of candidates) {
    const r = await get(c.url)
    if (!r.ok) { console.log(`::warning::${c.name}: pagina non leggibile (${r.status})`); continue }
    const t = parseEvent(await r.text(), c.url)
    if (t.skip) console.log(`Calendario: salto "${c.name}" (${t.skip})`)
    else found.push(t)
  }
  console.log(`Calendario: ${candidates.length} eventi PBI, ${found.length} ranked in arrivo: ${list(found.map(t => `${t.name} (${t.starts_at.slice(0, 10)})`))}`)
  if (sb) {
    const urls = found.map(t => t.url)
    const existing = urls.length ? await q(sb.from('tournaments').select('id, name, tier, starts_at, club, city, url, created_by_team').in('url', urls)) : []
    const plan = planEvents(existing, found)
    console.log(`Ranked nuove: ${list(plan.inserts.map(t => t.name))} | da correggere: ${list(plan.updates.map(t => t.name))}`)
    plan.skipped.forEach(m => console.log('Calendario: ' + m))
    // possibili doppioni: ranked future inserite a mano (senza link o con un altro link) stesso tier e stesso giorno
    const upcoming = await q(sb.from('tournaments').select('name, tier, starts_at, url').gte('starts_at', new Date().toISOString()))
    for (const f of found) for (const t of upcoming)
      if (t.url !== f.url && t.tier === f.tier && Math.abs(new Date(t.starts_at) - new Date(f.starts_at)) < 12 * 3600e3)
        console.log(`::warning::Possibile doppione: "${t.name}" (aggiunto a mano) e "${f.name}" (dal calendario PBI)`)
    if (!DRY) {
      if (plan.inserts.length) await q(sb.from('tournaments').upsert(plan.inserts, { onConflict: 'url', ignoreDuplicates: true }))
      for (const { id, ...f } of plan.updates) await q(sb.from('tournaments').update(f).eq('id', id).is('created_by_team', null))
    }
  }
} catch (e) {
  console.log(`::error::Importazione ranked dal calendario non riuscita: ${e.message}`)
  process.exitCode = 1
}

// 1) lettura e controllo della classifica
const res = await get(PBI_URL)
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
  process.exit(process.exitCode ?? 0)
}
// 2) piano delle modifiche
const bladers = await q(sb.from('bladers').select('id, nickname, pbi_nickname, pbi_id, pro_rank'))
const plan = planSync(bladers, rows, { topN: TOP_N })
console.log(`Da aggiornare: ${plan.updates.length} | nuovi in top ${TOP_N}: ${list(plan.inserts.map(i => i.nickname))}`)
console.log(`Doppioni rinominati: ${list(plan.renames.map(r => `${r.from} -> ${r.nickname}`))}`)
console.log(`Cloni "nome + team" da eliminare: ${list(plan.duplicates.map(d => `${d.nickname} (resta ${d.keep})`))}`)
console.log(`Usciti dalla classifica: ${list(plan.clears.map(c => c.nickname))}`)
if (plan.skipped.length) console.log(`::warning::Saltati: ${plan.skipped.join('; ')}`)
if (DRY) { console.log('Modalità prova: nessuna modifica scritta.'); process.exit(process.exitCode ?? 0) }

// 3) scrittura
const now = new Date().toISOString()
for (const r of plan.renames) await q(sb.from('bladers').update({ nickname: r.nickname }).eq('id', r.id))
for (const u of plan.updates) {
  const { id, nickname: _nickname, ...fields } = u
  await q(sb.from('bladers').update({ ...fields, pro_synced_at: now }).eq('id', id))
}
if (plan.inserts.length) await q(sb.from('bladers').insert(plan.inserts.map(i => ({ ...i, pro_synced_at: now }))))
if (plan.clears.length) await q(sb.from('bladers').update({ pro_rank: null, pro_points: null }).in('id', plan.clears.map(c => c.id)))

// cloni "nome + team": eliminati solo se non hanno nulla di collegato (account, team, vittorie, taglie usate)
for (const d of plan.duplicates) {
  const [b] = await q(sb.from('bladers').select('user_id').eq('id', d.id))
  const members = await q(sb.from('team_members').select('blader_id').eq('blader_id', d.id))
  const claims = await q(sb.from('claims').select('id').or(`hunter_id.eq.${d.id},target_id.eq.${d.id}`).limit(1))
  const entries = await q(sb.from('tournament_entries').select('id').eq('blader_id', d.id).limit(1))
  const ledger = await q(sb.from('points_ledger').select('id').eq('blader_id', d.id).limit(1))
  const bounties = await q(sb.from('bounties').select('id, value, active').eq('target_id', d.id))
  const photos = (await sb.from('blader_photos').select('blader_id').eq('blader_id', d.id).limit(1)).data || []   // tabella facoltativa
  const used = b?.user_id || members.length || claims.length || entries.length || ledger.length || photos.length || bounties.some(x => x.active || x.value > 0)
  if (used) { console.log(`::warning::Clone "${d.nickname}" non eliminato perché ha dati collegati: va unito a mano a "${d.keep}"`); continue }
  if (bounties.length) await q(sb.from('bounties').delete().eq('target_id', d.id))
  await q(sb.from('bladers').delete().eq('id', d.id))
  console.log(`Clone eliminato: ${d.nickname} (resta ${d.keep})`)
}

// 4) taglia 'top10' (valore 0, non attiva) per ogni blader in top 10, in ogni team con stagione attiva
const seasons = await q(sb.from('seasons').select('id, team_id').eq('is_active', true))
const top = await q(sb.from('bladers').select('id').lte('pro_rank', TOP_N))
const newB = seasons.flatMap(s => top.map(t => ({ team_id: s.team_id, season_id: s.id, target_id: t.id, value: 0, active: false, category: 'top10' })))
if (newB.length) await q(sb.from('bounties').upsert(newB, { onConflict: 'season_id,target_id', ignoreDuplicates: true }))

// 5) le taglie Top 10 slittano con la classifica: valore per posizione (impostato dall'admin), attivazione automatica
try {
  const slotRows = (await sb.from('bounty_rank_values').select('team_id, rank, value'))
  if (slotRows.error) throw new Error('esegui prima lo script foxpoint_08_taglie_posizione.sql (' + slotRows.error.message + ')')
  const slots = new Map()
  for (const r of slotRows.data) { if (!slots.has(r.team_id)) slots.set(r.team_id, new Map()); slots.get(r.team_id).set(r.rank, r.value) }
  const oldRank = new Map(bladers.map(b => [b.id, b.pro_rank]))
  const newRank = new Map((await q(sb.from('bladers').select('id, pro_rank').not('pro_rank', 'is', null))).map(b => [b.id, b.pro_rank]))
  const current = seasons.length ? await q(sb.from('bounties').select('id, team_id, target_id, category, value, active, prev_category, prev_value').in('season_id', seasons.map(s => s.id))) : []
  const ups = planBounties(current, oldRank, newRank, slots)
  const nick = new Map((await q(sb.from('bladers').select('id, nickname').in('id', [...new Set(ups.map(u => u.target_id))].concat(['00000000-0000-0000-0000-000000000000'])))).map(b => [b.id, b.nickname]))
  for (const { id, target_id, ...f } of ups) {
    await q(sb.from('bounties').update(f).eq('id', id))
    console.log(`Taglia ${nick.get(target_id) ?? target_id}: ${JSON.stringify(f)}`)
  }
  console.log(`Taglie Top 10 aggiornate in base alla posizione: ${ups.length}`)
} catch (e) {
  console.log(`::warning::Slittamento taglie Top 10 non eseguito: ${e.message}`)
}

// 6) taglie 'top10' attive su chi è uscito dalla top 10: le segnaliamo, decide l'admin
const act = await q(sb.from('bounties').select('category, bladers(nickname, pro_rank)').eq('active', true))
const usciti = [...new Set(act.filter(a => a.category === 'top10' && (!a.bladers.pro_rank || a.bladers.pro_rank > TOP_N)).map(a => a.bladers.nickname))]
console.log(`Taglie top 10 attive su chi è fuori dalla top 10: ${list(usciti)}`)
