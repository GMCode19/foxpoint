// Legge la classifica dalla pagina /ranking di PBI e restituisce [{ rank, nick, points }].
// 1) prova a leggere le righe della tabella (<tr>/<td>); 2) in alternativa il testo della pagina.
const clean = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim()

export function parseRanking(html) {
  const body = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  const rows = []

  for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => clean(m[1]))
    if (cells.length < 8 || !/^\d{1,4}$/.test(cells[0]) || !cells[1]) continue
    const pts = [...cells.slice(2)].reverse().find(c => /^\d+$/.test(c))
    if (pts !== undefined) rows.push({ rank: +cells[0], nick: cells[1], points: +pts })
  }
  if (rows.length >= 50) return rows

  // alternativa: testo piatto, ogni riga termina con il simbolo ▾
  const text = clean(body)
  const re = /(\d{1,4}) ([^▾]{1,40}?) (\d+) (\d+) (\d+)\/(\d+) [\d.]+ ?% (\d+) (\d+) [+-] ?\d+ [^▾]*? (\d+) ▾/g
  const flat = []
  for (const m of text.matchAll(re)) flat.push({ rank: +m[1], nick: m[2].trim(), points: +m[9] })
  return flat
}
