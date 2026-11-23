// Fa "slittare" le taglie Top 10 quando cambia la classifica PBI.
// Il valore dipende dalla posizione (tabella bounty_rank_values, impostata dall'admin dal pannello).
// Funzione pura (non tocca il database), così è collaudabile.
//
// Regole, per ogni taglia della stagione attiva:
//  - giocatore in top 10: valore = valore della sua posizione (se impostato);
//    se è appena entrato in top 10 la taglia si attiva; se era "rilevante" o "capo team" diventa Top 10
//    (categoria e valore precedenti vengono ricordati)
//  - giocatore uscito dalla top 10 (o senza più posizione): se prima era "rilevante", "capo team", "superstar"
//    o Fox Blader torna com'era, con il suo valore e attivazione invariata; altrimenti diventa "Blader rilevante"
//    con il valore più usato tra i rilevanti del team (attiva se il valore è maggiore di 0)
//  - chi resta in top 10 mantiene l'attivazione decisa dall'admin

const TOP = 10
const inTop = r => r != null && r >= 1 && r <= TOP

// bounties: [{ id, team_id, target_id, category, value, active, prev_category, prev_value }]
// oldRank/newRank: Map blader_id -> posizione (prima e dopo l'aggiornamento)
// slots: Map team_id -> Map posizione -> valore
export function planBounties(bounties, oldRank, newRank, slots) {
  const updates = [], rilevante = modeValues(bounties, 'rilevante')
  for (const b of bounties) {
    const was = inTop(oldRank.get(b.target_id)), now = inTop(newRank.get(b.target_id))
    const r = newRank.get(b.target_id)
    const u = {}
    if (now) {
      if (b.category !== 'top10') Object.assign(u, { category: 'top10', prev_category: b.category, prev_value: b.value })
      const v = slots.get(b.team_id)?.get(r)
      if (v != null && v !== b.value) u.value = v
      if (!was && !b.active && (v ?? b.value) > 0) u.active = true
    } else if (b.category === 'top10') {
      if (b.prev_category) Object.assign(u, { category: b.prev_category, value: b.prev_value ?? b.value, prev_category: null, prev_value: null })
      else {
        const v = rilevante.get(b.team_id) ?? b.value
        Object.assign(u, { category: 'rilevante', value: v, active: v > 0 })
      }
    }
    if (Object.keys(u).length) updates.push({ id: b.id, target_id: b.target_id, ...u })
  }
  return updates
}

// valore più usato (maggiore di 0) per categoria, team per team; a parità vince il più alto
function modeValues(bounties, category) {
  const count = new Map()
  for (const b of bounties) if (b.category === category && b.value > 0) {
    if (!count.has(b.team_id)) count.set(b.team_id, new Map())
    const c = count.get(b.team_id); c.set(b.value, (c.get(b.value) || 0) + 1)
  }
  const out = new Map()
  for (const [t, c] of count) out.set(t, [...c].sort((a, z) => z[1] - a[1] || z[0] - a[0])[0][0])
  return out
}
