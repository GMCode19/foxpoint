// Decide cosa aggiornare nel database a partire dalla classifica PBI letta.
// Funzione pura (non tocca il database), così è collaudabile.
//
// Abbinamento di ogni riga PBI a un blader, in ordine di affidabilità:
//  1. id del profilo PBI (stabile, non cambia mai)
//  2. nickname o nickname PBI (es. Fourteenkay -> Krsto14)
//  3. vecchi doppioni "Nick Team" creati dalla versione precedente: vengono rinominati in "Nick"
// Chi entra in top N e non esiste viene creato UNA volta, con il suo id PBI.

const low = s => (s || '').trim().toLowerCase()

export function planSync(bladers, rows, { topN = 10 } = {}) {
  const byPbi = new Map(), byName = new Map()
  for (const b of bladers) {
    if (b.pbi_id) byPbi.set(String(b.pbi_id), b)
    for (const n of [b.nickname, b.pbi_nickname]) if (n && !byName.has(low(n))) byName.set(low(n), b)
  }
  const taken = new Set(bladers.map(b => low(b.nickname)))
  const updates = [], inserts = [], renames = [], skipped = []
  const used = new Set(), seenPbi = new Set()

  for (const r of rows) {
    if (r.pbiId) { if (seenPbi.has(r.pbiId)) continue; seenPbi.add(r.pbiId) }

    let b = (r.pbiId && byPbi.get(r.pbiId)) || byName.get(low(r.nick))
    if (!b && r.team) {
      const legacy = byName.get(low(`${r.nick} ${r.team}`))
      if (legacy && !used.has(legacy.id)) {
        b = legacy
        if (!taken.has(low(r.nick))) { renames.push({ id: b.id, from: b.nickname, nickname: r.nick }); taken.add(low(r.nick)) }
      }
    }

    if (b) {
      if (used.has(b.id)) continue
      if (r.pbiId && b.pbi_id && String(b.pbi_id) !== r.pbiId) {   // stesso nome, persona diversa
        skipped.push(`${r.nick} (#${r.rank}): omonimo con id PBI diverso`)
        continue
      }
      used.add(b.id)
      const u = { id: b.id, nickname: b.nickname, pro_rank: r.rank, pro_points: r.points }
      if (r.pbiId && !b.pbi_id) u.pbi_id = r.pbiId
      updates.push(u)
    } else if (r.rank <= topN && !taken.has(low(r.nick))) {
      inserts.push({ nickname: r.nick, pbi_id: r.pbiId, pro_rank: r.rank, pro_points: r.points })
      taken.add(low(r.nick))
    }
  }

  // chi non compare più in classifica perde la posizione (niente "fantasmi" in top 10)
  const clears = bladers.filter(b => b.pro_rank != null && !used.has(b.id)).map(b => ({ id: b.id, nickname: b.nickname }))
  return { updates, inserts, renames, clears, skipped }
}
