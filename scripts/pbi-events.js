// Legge le prossime ranked dal calendario PBI (/calendario-eventi).
// Il sito pubblica dati strutturati (JSON-LD, schema.org): l'elenco degli eventi nella pagina del calendario
// e, nella pagina di ogni evento, un "SportsEvent" con data e ora esatte, club e luogo.
// Funzioni pure (niente rete né database), così sono collaudabili.

const TIERS = ['320', '480', '640', '960']

// tutti i blocchi JSON-LD della pagina (quelli non leggibili vengono ignorati)
export function jsonLd(html) {
  const out = []
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1])
      for (const x of [j, ...(j['@graph'] || [])].flat()) if (x && typeof x === 'object') out.push(x)
    } catch { /* blocco non valido: si salta */ }
  }
  return out
}

// tier PBI dal nome o dalla descrizione: "PBI 320", "PBI Masters", "Grande Slam"
export function tierOf(text) {
  const t = (text || '').toLowerCase()
  const n = t.match(/\bpbi\s*(\d{3})\b/)
  if (n && TIERS.includes(n[1])) return n[1]
  if (/\bmasters?\b/.test(t)) return 'masters'
  if (/grande?\s*slam|grand\s*slam/.test(t)) return 'slam'
  return null
}

// pagina del calendario -> [{ url, name }] degli eventi che potrebbero essere ranked PBI
export function parseCalendar(html) {
  const list = jsonLd(html).find(x => x['@type'] === 'ItemList' && Array.isArray(x.itemListElement))
  if (!list) return []
  const seen = new Set()
  return list.itemListElement
    .map(e => ({ url: (e.url || e.item?.['@id'] || e.item || '').toString().trim(), name: (e.name || '').trim() }))
    .filter(e => /^https:\/\/(www\.)?probladers\.it\/calendario-eventi\/[^/?#]+$/.test(e.url) && !seen.has(e.url) && seen.add(e.url))
    .filter(e => tierOf(e.name))   // solo i nomi tipo "PBI 320 - …", "PBI Masters …"
}

const title = s => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

// pagina di un evento -> torneo pronto per il database, oppure { skip: motivo }
export function parseEvent(html, url, now = new Date()) {
  const ev = jsonLd(html).find(x => /SportsEvent|^Event$/.test(x['@type']))
  if (!ev) return { skip: 'dati dell\'evento non trovati' }
  const desc = ev.description || ''
  if (!/\branked\b/i.test(desc) && !/\branked\b/i.test(ev.name || '')) return { skip: 'non è un torneo ranked' }
  if (/Cancelled|Postponed/i.test(ev.eventStatus || '')) return { skip: 'annullato o rinviato' }
  const tier = tierOf(ev.name) || tierOf(desc)
  if (!tier) return { skip: 'tier non riconosciuto' }
  const start = new Date(ev.startDate)
  if (isNaN(start)) return { skip: 'data non valida' }
  if (start <= now) return { skip: 'già iniziato' }
  // nome senza la data finale: "PBI 320 - 2000's kids - 14/11/2026" -> "PBI 320 - 2000's kids"
  const name = (ev.name || '').replace(/\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '').replace(/\s+/g, ' ').trim()
  // città: "… PBI 320 a MASSA il 14 novembre …", altrimenti dall'indirizzo "Via …, 54100 Massa, Italia"
  const fromDesc = desc.match(/\ba\s+([\p{L}' .-]{2,40}?)\s+il\s+\d/u)?.[1]
  const addr = ev.location?.address
  const fromAddr = (typeof addr === 'string' ? addr : addr?.addressLocality || addr?.streetAddress || '')
    .match(/\d{5}\s+([^,]+)/)?.[1]
  const city = (fromDesc || fromAddr || '').trim()
  return {
    name: name.slice(0, 120), tier, starts_at: start.toISOString(),
    club: (ev.organizer?.name || '').trim().slice(0, 80) || null,
    city: city ? title(city).slice(0, 60) : null,
    url,
  }
}

// cosa scrivere: nuovi tornei da inserire e tornei ufficiali già presenti da correggere (data, nome, ecc.)
export function planEvents(existing, found) {
  const byUrl = new Map(existing.map(t => [t.url, t]))
  const inserts = [], updates = [], skipped = []
  for (const f of found) {
    const t = byUrl.get(f.url)
    if (!t) { inserts.push(f); continue }
    if (t.created_by_team) { skipped.push(`${f.name}: inserito a mano da un team, non lo tocco`); continue }
    const diff = {}
    for (const k of ['name', 'tier', 'club', 'city']) if ((t[k] ?? null) !== f[k]) diff[k] = f[k]
    if (new Date(t.starts_at).getTime() !== new Date(f.starts_at).getTime()) diff.starts_at = f.starts_at
    if (Object.keys(diff).length) updates.push({ id: t.id, name: f.name, ...diff })
  }
  return { inserts, updates, skipped }
}
