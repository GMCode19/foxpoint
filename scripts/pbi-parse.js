// Legge la classifica dalla pagina /ranking di PBI.
// Restituisce [{ rank, nick, team, pbiId, points }]:
//  - nick:  nickname del giocatore (senza il team che il sito mostra sotto il nome)
//  - team:  team di appartenenza su PBI (solo informativo, può essere null)
//  - pbiId: id del profilo PBI preso dal link /giocatori/<id> (identificativo stabile, può essere null)

const decode = s => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))

// pezzi di testo separati dai tag HTML: "<a>Nick</a><span>Team</span>" -> ["Nick", "Team"]
export const textChunks = html => html
  .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ')
  .split(/<[^>]+>/)
  .map(t => decode(t).replace(/\s+/g, ' ').trim())
  .filter(Boolean)

const clean = html => textChunks(html).join(' ')

export function parseRanking(html) {
  const body = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  const rows = []

  for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => m[1])
    if (cells.length < 8) continue
    const rank = clean(cells[0])
    if (!/^\d{1,4}$/.test(rank)) continue

    // cella del giocatore: il primo testo è il nickname, quello che segue è il team
    const chunks = textChunks(cells[1]).filter(t => !/^[▾▸►]$/.test(t))
    if (!chunks.length) continue
    const nick = chunks[0]
    const team = chunks.slice(1).join(' ') || null
    const pbiId = (cells[1].match(/\/giocatori\/(\d+)/) || tr.match(/\/giocatori\/(\d+)/) || [])[1] || null

    const pts = cells.slice(2).map(clean).reverse().find(c => /^\d+$/.test(c))
    if (pts === undefined) continue
    rows.push({ rank: +rank, nick, team, pbiId, points: +pts })
  }
  return rows
}

// Controlli prima di toccare il database: se il sito cambia struttura meglio fermarsi che scrivere dati sbagliati
export function validateRanking(rows) {
  const problems = []
  if (rows.length < 50) problems.push(`solo ${rows.length} righe lette (attese almeno 50)`)
  if (rows.length && rows[0].rank !== 1) problems.push('la prima riga non è la posizione 1')
  const bad = rows.filter(r => !r.nick || r.nick.length > 40 || /^\d+$/.test(r.nick))
  if (bad.length) problems.push(`${bad.length} nickname non validi (es. "${bad[0].nick}")`)
  return problems
}
